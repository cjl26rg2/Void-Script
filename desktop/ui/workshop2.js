// SPDX-License-Identifier: GPL-3.0-or-later
// workshop2.js - more Workshop tools: Changes (snapshots and diffs), Find &
// replace, Script lint, Arrange, Randomize, Bulk edit, Tags, Cleanup and a
// Luau console. Builds on workshop.js (WK_TOOLS, wkRun, wkShow, fld, seg…).
"use strict";

// A Lua string literal that keeps the text exactly (JSON's escapes are Lua's,
// except \u00XX, which Luau writes as \xXX).
const luaExact = (s) => JSON.stringify(String(s)).replace(/\\u00([0-9a-fA-F]{2})/g, "\\x$1");
const WK_IDX = `local function idx(o)
	local p = {}
	while o and o.Parent ~= game do table.insert(p, 1, table.find(o.Parent:GetChildren(), o)) o = o.Parent end
	if not o then return nil end
	table.insert(p, 1, o.ClassName)
	return p
end
`;
const WK_SETSRC = `local function setSource(s, text)
	local ok = pcall(function() game:GetService("ScriptEditorService"):UpdateSourceAsync(s, function() return text end) end)
	if not ok then s.Source = text end
end
`;

// ── tiny IndexedDB store for snapshots (they're too big for localStorage) ──
const vsdb = (() => {
  let db = null;
  const open = () => db || (db = new Promise((res, rej) => {
    const r = indexedDB.open("voidscript", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("snaps");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction("snaps", mode); const q = fn(t.objectStore("snaps")); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
  return { get: (k) => tx("readonly", (s) => s.get(k)), put: (k, v) => tx("readwrite", (s) => s.put(v, k)), del: (k) => tx("readwrite", (s) => s.delete(k)), keys: () => tx("readonly", (s) => s.getAllKeys()) };
})();

// Line diff (longest common subsequence). null when the files are too big to compare.
function lineDiff(a, b) {
  const n = a.length, m = b.length;
  if (n * m > 6e6) return null;
  const w = m + 1, L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i * w + j] = a[i] === b[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { out.push([" ", a[i], i + 1]); i++; j++; }
    else if (j < m && (i >= n || L[i * w + j + 1] >= L[(i + 1) * w + j])) { out.push(["+", b[j], j + 1]); j++; }
    else { out.push(["-", a[i], i + 1]); i++; }
  }
  return out;
}
// Only the changed lines, with 3 lines around each.
function diffHtml(d) {
  if (!d) return '<p class="muted">Too big to compare line by line.</p>';
  const keep = new Set();
  d.forEach((x, k) => { if (x[0] !== " ") for (let q = k - 3; q <= k + 3; q++) keep.add(q); });
  let html = "", gap = false;
  d.forEach((x, k) => {
    if (!keep.has(k)) { if (!gap) { html += '<div class="df-gap">⋯</div>'; gap = true; } return; }
    gap = false;
    html += `<div class="df-l df-${x[0] === "+" ? "add" : x[0] === "-" ? "del" : "eq"}"><span>${x[0] === " " ? "" : x[2]}</span><code>${x[0] === " " ? " " : x[0]} ${esc(x[1])}</code></div>`;
  });
  return html || '<p class="muted">No differences.</p>';
}

// ── Changes: snapshots of the place and what changed since ──────────────────
const CH_SNAP = `local HS = game:GetService("HttpService")
local SVC = { "Workspace", "ReplicatedStorage", "ReplicatedFirst", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams", "TextChatService", "LocalizationService" }
local items, src, n, total = {}, {}, 0, 0
local function walk(o, path)
	for _, c in o:GetChildren() do
		if n >= 40000 then return end
		if not c:IsA("Terrain") and not c:IsA("Camera") and c.Archivable then
			local p = path .. "/" .. c.Name
			if items[p] then local k = 2 while items[p .. "#" .. k] do k += 1 end p = p .. "#" .. k end
			n += 1
			items[p] = c.ClassName
			if c:IsA("LuaSourceContainer") then
				local ok, s = pcall(function() return c.Source end)
				if ok and s and total + #s < 6000000 then src[p] = s total += #s end
			end
			walk(c, p)
		end
	end
end
for _, name in SVC do local ok, s = pcall(game.GetService, game, name) if ok then walk(s, name) end end
return HS:JSONEncode({ place = game.PlaceId, name = game.Name, items = items, src = src, n = n })`;
const CH_FIND = `local function find(path)
	local segs = string.split(path, "/")
	local ok, node = pcall(game.GetService, game, segs[1])
	if not ok then return nil end
	for i = 2, #segs do
		local name, k = string.match(segs[i], "^(.*)#(%d+)$")
		if name then k = tonumber(k) else name, k = segs[i], 1 end
		local hit, nxt = 0, nil
		for _, c in node:GetChildren() do
			if c.Name == name then hit += 1 if hit == k then nxt = c break end end
		end
		node = nxt
		if not node then return nil end
	end
	return node
end
`;
const ch = { list: [], diff: null, view: null, base: null };
const chKey = (s) => `snap:${s.place || s.name}:${s.t}`;
async function chLoad() {
  try { ch.list = (await vsdb.keys()).filter((k) => String(k).startsWith("snap:")).map((k) => ({ k, t: Number(String(k).slice(String(k).lastIndexOf(":") + 1)) })).sort((a, b) => b.t - a.t); }
  catch { ch.list = []; }
}
function chCompare(a, b) {
  const added = [], removed = [], changed = [], retyped = [];
  for (const p in b.items) if (!(p in a.items)) added.push(p);
  for (const p in a.items) {
    if (!(p in b.items)) removed.push(p);
    else if (a.items[p] !== b.items[p]) retyped.push(p);
    else if (a.src[p] != null && b.src[p] != null && a.src[p] !== b.src[p]) changed.push(p);
  }
  return { added, removed, changed, retyped };
}
const chShort = (p) => p.replace(/\//g, " › ");
WK_TOOLS.changes = {
  name: "Changes", group: "Check", desc: "Take a snapshot of the place, then see exactly what changed since - new and deleted things, and every edited script line by line. Put any script back.",
  html: () => {
    if (ch.view) return chViewHtml();
    return `<div class="row"><input class="input grow" id="ch-label" placeholder="Name it (e.g. before the AI's shop changes)" maxlength="60" /><button class="btn primary" data-act="snap">Take snapshot</button></div>
      <div class="ch-list">${ch.list.length ? ch.list.map((s) => `<div class="ch-item"><div><b>${esc(s.label || "Snapshot")}</b><span class="muted">${new Date(s.t).toLocaleString()}</span></div>
        <button class="btn sm" data-act="compare" data-k="${esc(s.k)}">Compare with now</button><button class="link" data-act="delsnap" data-k="${esc(s.k)}">Delete</button></div>`).join("")
        : '<p class="muted small-p">No snapshots yet. Take one before a big change (or before letting the AI loose), then compare after.</p>'}</div>
      ${ch.diff ? chDiffHtml() : ""}`;
  },
  async mount() {
    if (!ch.listed) { ch.listed = true; await chLoad(); for (const s of ch.list) { try { const v = await vsdb.get(s.k); s.label = v && v.label; } catch {} } if (wk.tool === "changes" && !ch.view) wkShow("changes"); }
  },
  async act(a, btn) {
    if (a === "back") { ch.view = null; wkShow("changes"); return; }
    if (a === "view") { ch.view = btn.dataset.p; wkShow("changes"); return; }
    if (a === "delsnap") { await vsdb.del(btn.dataset.k); ch.listed = false; ch.list = ch.list.filter((s) => s.k !== btn.dataset.k); wkShow("changes"); return; }
    if (a === "snap" || a === "compare") {
      const was = btn.textContent;
      btn.disabled = true; btn.textContent = a === "snap" ? "Reading the place…" : "Comparing…";
      try {
        const now = JSON.parse(await stLuau(CH_SNAP, 180000));
        now.t = Date.now();
        if (a === "snap") {
          now.label = val("ch-label").trim() || "Snapshot";
          await vsdb.put(chKey(now), now);
          ch.listed = false; await chLoad(); for (const s of ch.list) { try { const v = await vsdb.get(s.k); s.label = v && v.label; } catch {} }
          toast(`Snapshot taken - ${now.n.toLocaleString()} things, ${Object.keys(now.src).length} scripts.`);
        } else {
          const base = await vsdb.get(btn.dataset.k);
          if (!base) throw new Error("That snapshot is gone.");
          ch.base = base; ch.now = now; ch.diff = chCompare(base, now);
        }
        wkShow("changes");
      } catch (e) { toast(errText(e), 6000); }
      finally { btn.disabled = false; btn.textContent = was; }
      return;
    }
    if (a === "restore") {
      const p = ch.view, cls = ch.base.items[p], src = ch.base.src[p];
      const segs = p.split("/"), name = segs[segs.length - 1].replace(/#\d+$/, "");
      const out = await wkRun("Put script back", `${CH_FIND}${WK_SETSRC}
local s = find(${luaExact(p)})
local text = ${luaExact(src)}
if s then
	if not s:IsA("LuaSourceContainer") then return "ERR:That isn't a script any more." end
	setSource(s, text)
	return "Put " .. s:GetFullName() .. " back how it was"
end
local parent = find(${luaExact(segs.slice(0, -1).join("/"))})
if not parent then return "ERR:The folder it was in is gone too - put that back first." end
local n = Instance.new(${luaExact(cls)})
n.Name = ${luaExact(name)}
n.Source = text
n.Parent = parent
return "Brought back " .. n:GetFullName()`, btn);
      if (out) { ch.now.src[p] = src; ch.now.items[p] = cls; ch.diff = chCompare(ch.base, ch.now); }
    }
  },
};
function chDiffHtml() {
  const d = ch.diff, scr = (p) => p in ch.base.src || p in ch.now.src;
  const sec = (title, list, kind) => list.length ? `<div class="ch-sec"><div class="uc-gh"><b>${title}</b><span class="tag">${list.length}</span></div>
    ${list.slice(0, 200).map((p) => `<div class="ch-row ch-${kind}"><span>${esc(chShort(p))}</span><em>${esc(ch.now.items[p] || ch.base.items[p])}</em>${(kind === "chg" || (kind === "del" && scr(p))) ? `<button class="link" data-act="view" data-p="${esc(p)}">${kind === "chg" ? "See changes" : "See script"}</button>` : ""}</div>`).join("")}
    ${list.length > 200 ? `<p class="muted small-p">…and ${list.length - 200} more.</p>` : ""}</div>` : "";
  const none = !d.added.length && !d.removed.length && !d.changed.length && !d.retyped.length;
  return `<div class="ch-res"><div class="nav-sum"><div><b>${d.changed.length}</b><span>scripts edited</span></div><div><b>${d.added.length}</b><span>added</span></div><div><b>${d.removed.length}</b><span>deleted</span></div></div>
    ${none ? '<p class="uc-good">Nothing changed since that snapshot.</p>' : ""}
    ${sec("Scripts edited", d.changed, "chg")}${sec("Deleted", d.removed, "del")}${sec("Added", d.added, "add")}${sec("Changed type", d.retyped, "chg")}</div>`;
}
function chViewHtml() {
  const p = ch.view, a = ch.base.src[p], b = ch.now.src[p];
  const body = a != null && b != null ? diffHtml(lineDiff(a.split("\n"), b.split("\n"))) : `<pre class="st-code">${esc(a || b || "")}</pre>`;
  return `<div class="row"><button class="btn sm" data-act="back">← Back</button><b class="grow ch-title">${esc(chShort(p))}</b>${a != null ? '<button class="btn sm primary" data-act="restore">Put it back how it was</button>' : ""}</div>
    <div class="df">${body}</div>`;
}

// ── Find & replace in every script ──────────────────────────────────────────
// The search as a Lua pattern: special characters escaped, letters as [aA]
// when case doesn't matter, and frontier patterns for whole words.
function luaPat(text, matchCase, word) {
  let p = "";
  for (const c of text) {
    if (!matchCase && /[a-z]/i.test(c)) p += `[${c.toLowerCase()}${c.toUpperCase()}]`;
    else if (/[\^$()%.[\]*+\-?]/.test(c)) p += "%" + c;
    else p += c;
  }
  return word ? `%f[%w_]${p}%f[^%w_]` : p;
}
const jsPat = (text, matchCase, word) => new RegExp((word ? "(?<![\\w])" : "") + text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + (word ? "(?![\\w])" : ""), matchCase ? "g" : "gi");
const fr = { res: null, q: null };
WK_TOOLS.replace = {
  name: "Find & replace", group: "Check", desc: "Search every script in the place and replace text in the ones you tick - with a preview of each line first.",
  html: () => `
    <div class="wk-grid">${fld("Find", `<input class="input" id="fr-find" value="${esc(fr.q ? fr.q.find : "")}" />`)}${fld("Replace with", `<input class="input" id="fr-rep" value="${esc(fr.q ? fr.q.rep : "")}" />`)}</div>
    <div class="row"><label class="chk"><input type="checkbox" id="fr-case" ${fr.q && fr.q.mc ? "checked" : ""} /> Match case</label><label class="chk"><input type="checkbox" id="fr-word" ${fr.q && fr.q.word ? "checked" : ""} /> Whole word</label><span class="grow"></span>
      <button class="btn" data-act="find">Find</button><button class="btn primary" data-act="apply" ${fr.res && fr.res.length ? "" : "disabled"}>Replace in ticked scripts</button></div>
    <div id="fr-out">${fr.res ? frList() : ""}</div>`,
  async act(a, btn) {
    const q = { find: val("fr-find"), rep: val("fr-rep"), mc: chk("fr-case"), word: chk("fr-word") };
    if (!q.find) { toast("Type what to find."); $("fr-find").focus(); return; }
    const pat = luaPat(q.find, q.mc, q.word);
    if (a === "find") {
      btn.disabled = true; btn.textContent = "Searching…";
      try {
        fr.res = JSON.parse(await stLuau(`local HS = game:GetService("HttpService")
${WK_IDX}local PAT = ${luaExact(pat)}
local out = {}
local function ALL() -- your game only: never Studio's own plugin or core areas
	local out = {}
	for _, name in { "Workspace", "ReplicatedStorage", "ReplicatedFirst", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams", "Chat", "TextChatService", "LocalizationService", "MaterialService" } do
		local ok, s = pcall(game.GetService, game, name)
		if ok and s then for _, d in s:GetDescendants() do table.insert(out, d) end end
	end
	return out
end
for _, d in ALL() do
	if d:IsA("LuaSourceContainer") and #out < 300 then
		local ok, src = pcall(function() return d.Source end)
		if ok and src and string.find(src, PAT) then
			local hits = {}
			for ln, line in string.split(src, "\\n") do
				if string.find(line, PAT) and #hits < 40 then table.insert(hits, { l = ln, t = string.sub(line, 1, 220) }) end
			end
			local _, n = string.gsub(src, PAT, "")
			table.insert(out, { f = d:GetFullName(), p = idx(d), n = n, hits = hits })
		end
	end
end
return HS:JSONEncode({ r = out })`, 90000)).r;
        fr.q = q;
        wkShow("replace");
      } catch (e) { toast(errText(e), 6000); }
      finally { btn.disabled = false; btn.textContent = "Find"; }
      return;
    }
    if (a === "apply") {
      if (!fr.q || fr.q.find !== q.find || fr.q.mc !== q.mc || fr.q.word !== q.word) { toast("The search changed - press Find again first."); return; }
      const picked = fr.res.filter((_, i) => { const c = document.querySelector(`#fr-out input[data-i="${i}"]`); return c && c.checked; });
      if (!picked.length) { toast("Tick at least one script."); return; }
      const out = await wkRun("Replace", `local HS = game:GetService("HttpService")
${WK_RESOLVE.replace('local HS = game:GetService("HttpService")\n', "")}${WK_SETSRC}local PAT, REP = ${luaExact(pat)}, ${luaExact(q.rep.replace(/%/g, "%%"))}
local done, skipped, total = 0, 0, 0
for _, t in HS:JSONDecode(${luaExact(JSON.stringify(picked.map((x) => ({ p: x.p, n: x.n }))))}) do
	local s = resolve(t.p)
	local ok, src = pcall(function() return s and s.Source end)
	local _, now = string.gsub(ok and src or "", PAT, "")
	if not s or now ~= t.n then skipped += 1 else
		local new, n = string.gsub(src, PAT, REP)
		setSource(s, new)
		done += 1 total += n
	end
end
return "Replaced " .. total .. " in " .. done .. " script(s)" .. (skipped > 0 and (" - skipped " .. skipped .. " that changed since you searched") or "")`, btn);
      if (out) { fr.res = null; wkShow("replace"); }
    }
  },
};
function frList() {
  if (!fr.res.length) return '<p class="muted">Not found in any script.</p>';
  const re = jsPat(fr.q.find, fr.q.mc, fr.q.word);
  const total = fr.res.reduce((a, x) => a + x.n, 0);
  return `<p class="muted small-p">${total} match${total === 1 ? "" : "es"} in ${fr.res.length} script${fr.res.length === 1 ? "" : "s"}</p>` + fr.res.map((x, i) => `<div class="fr-file"><label class="chk"><input type="checkbox" data-i="${i}" checked /> <b>${esc(x.f)}</b> <span class="tag">${x.n}</span></label>
    ${x.hits.map((h) => `<div class="fr-hit"><span>${h.l}</span><code>${esc(h.t).replace(new RegExp(re.source, re.flags), (m) => `<del>${m}</del><ins>${esc(fr.q.rep)}</ins>`)}</code></div>`).join("")}</div>`).join("");
}

// ── Script lint ─────────────────────────────────────────────────────────────
const LINT_RULES = {
  wait: ["wait() is deprecated", "task.wait() is more accurate and doesn't throttle.", true],
  spawn: ["spawn() is deprecated", "task.spawn() runs right away instead of a frame later.", true],
  delay: ["delay() is deprecated", "Use task.delay().", true],
  connect: [":connect() is deprecated", "Use :Connect().", true],
  remove: [":remove() is deprecated", "Use :Destroy() - :remove() leaves connections alive.", true],
  newparent: ["Instance.new with a parent", "Setting Parent last is faster; Instance.new(\"X\", parent) is slow with many properties.", false],
  localplayer: ["LocalPlayer in a server script", "Players.LocalPlayer is nil on the server.", false],
  movers: ["Old body movers", "BodyVelocity, BodyGyro and friends are deprecated - use LinearVelocity, AlignOrientation and the other constraints.", false],
  requireid: ["Loads a module by asset id", "Code you don't control runs in your game. Make sure you trust it.", false],
  busyloop: ["Loop with no wait", "A while true loop with nothing waiting nearby can freeze the game.", false],
  place_local: ["LocalScript that never runs", "LocalScripts only run in StarterPlayer, StarterGui, StarterPack, ReplicatedFirst, tools and characters.", false],
  place_server: ["Script that never runs", "A server Script in ReplicatedStorage or a Starter folder doesn't run. Move it to ServerScriptService, or set its RunContext.", false],
};
const LINT_SCAN = `local HS = game:GetService("HttpService")
${WK_IDX}local out = {}
local function add(d, ln, rule, line) if #out < 1500 then table.insert(out, { f = d:GetFullName(), p = idx(d), l = ln, r = rule, t = string.sub(line or "", 1, 180) }) end end
local function bare(line, word)
	local from = 1
	while true do
		local s = string.find(line, word .. "%s*%(", from)
		if not s then return false end
		local prev = s > 1 and string.sub(line, s - 1, s - 1) or ""
		if not string.match(prev, "[%w_%.:]") then return true end
		from = s + 1
	end
end
local RS, SG, SP, SPk, RF = game:GetService("ReplicatedStorage"), game:GetService("StarterGui"), game:GetService("StarterPlayer"), game:GetService("StarterPack"), game:GetService("ReplicatedFirst")
local function ALL() -- your game only: never Studio's own plugin or core areas
	local out = {}
	for _, name in { "Workspace", "ReplicatedStorage", "ReplicatedFirst", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams", "Chat", "TextChatService", "LocalizationService", "MaterialService" } do
		local ok, s = pcall(game.GetService, game, name)
		if ok and s then for _, d in s:GetDescendants() do table.insert(out, d) end end
	end
	return out
end
for _, d in ALL() do
	if d:IsA("LuaSourceContainer") then
		local server = d:IsA("Script") and d.RunContext ~= Enum.RunContext.Client
		if d:IsA("LocalScript") then
			local m = d:FindFirstAncestorWhichIsA("Model")
			local ok = d:IsDescendantOf(SP) or d:IsDescendantOf(SG) or d:IsDescendantOf(SPk) or d:IsDescendantOf(RF) or d:FindFirstAncestorWhichIsA("Tool") or (m and m:FindFirstChildWhichIsA("Humanoid"))
			if not ok then add(d, 0, "place_local", d:GetFullName()) end
		elseif d:IsA("Script") and d.RunContext == Enum.RunContext.Legacy and (d:IsDescendantOf(RS) or d:IsDescendantOf(SG) or d:IsDescendantOf(SP) or d:IsDescendantOf(SPk) or d:IsDescendantOf(RF)) then
			add(d, 0, "place_server", d:GetFullName())
		end
		local ok, src = pcall(function() return d.Source end)
		if ok and src then
			local lines = string.split(src, "\\n")
			for ln, line in lines do
				local code = string.gsub(line, "%-%-.*$", "")
				if bare(code, "wait") then add(d, ln, "wait", line) end
				if bare(code, "spawn") then add(d, ln, "spawn", line) end
				if bare(code, "delay") then add(d, ln, "delay", line) end
				if string.find(code, ":connect%(") then add(d, ln, "connect", line) end
				if string.find(code, ":remove%(%)") then add(d, ln, "remove", line) end
				if string.find(code, "Instance%.new%s*%(%s*[\\"'][%w_]+[\\"']%s*,") then add(d, ln, "newparent", line) end
				if server and string.find(code, "LocalPlayer") then add(d, ln, "localplayer", line) end
				if string.find(code, "[\\"']Body[VGPFAT]%a+[\\"']") then add(d, ln, "movers", line) end
				if string.find(code, "require%s*%(%s*%d+") then add(d, ln, "requireid", line) end
				if string.find(code, "^%s*while%s+true%s+do") then
					local waits = false
					for k = ln, math.min(ln + 40, #lines) do
						local t = lines[k]
						if string.find(t, "wait", 1, true) or string.find(t, "Wait(", 1, true) or string.find(t, ":Wait", 1, true) or string.find(t, "Heartbeat", 1, true) or string.find(t, "Stepped", 1, true) then waits = true break end
					end
					if not waits then add(d, ln, "busyloop", line) end
				end
			end
		end
	end
end
return HS:JSONEncode({ r = out })`;
const LINT_FIX = (paths) => `local HS = game:GetService("HttpService")
${WK_RESOLVE.replace('local HS = game:GetService("HttpService")\n', "")}${WK_SETSRC}local function fixLine(line)
	if string.match(line, "^%s*%-%-") then return line end
	line = string.gsub(line, ":connect%(", ":Connect(")
	line = string.gsub(line, ":remove%(%)", ":Destroy()")
	for _, w in { "wait", "spawn", "delay" } do
		local orig = line
		line = string.gsub(orig, "()" .. w .. "(%s*%()", function(pos, paren)
			local prev = pos > 1 and string.sub(orig, pos - 1, pos - 1) or ""
			if string.match(prev, "[%w_%.:]") then return nil end
			return "task." .. w .. paren
		end)
	end
	return line
end
local files, lines = 0, 0
for _, p in HS:JSONDecode(${luaExact(JSON.stringify(paths))}) do
	local s = resolve(p)
	if s and s:IsA("LuaSourceContainer") then
		local list = string.split(s.Source, "\\n")
		local changed = 0
		for i, line in list do local f = fixLine(line) if f ~= line then list[i] = f changed += 1 end end
		if changed > 0 then setSource(s, table.concat(list, "\\n")) files += 1 lines += changed end
	end
end
return "Updated " .. lines .. " line(s) in " .. files .. " script(s)"`;
const li = { res: null };
WK_TOOLS.lint = {
  name: "Script lint", group: "Check", desc: "Finds old code (wait, spawn, :connect…), scripts sitting where they never run, and loops that can freeze the game. Fixes the safe ones in one click.",
  html: () => `<div class="row"><button class="btn primary" data-act="scan">Check every script</button><span class="grow"></span>${li.res && li.res.some((x) => LINT_RULES[x.r][2]) ? '<button class="btn" data-act="fix">Fix the safe ones</button>' : ""}</div><div id="li-out">${li.res ? liList() : '<p class="muted small-p">Reads every script; changes nothing until you press Fix.</p>'}</div>`,
  async act(a, btn) {
    if (a === "scan") {
      btn.disabled = true; btn.textContent = "Checking…";
      try { li.res = JSON.parse(await stLuau(LINT_SCAN, 90000)).r; wkShow("lint"); }
      catch (e) { toast(errText(e), 6000); }
      finally { btn.disabled = false; btn.textContent = "Check every script"; }
      return;
    }
    if (a === "fix") {
      const files = [...new Map(li.res.filter((x) => LINT_RULES[x.r][2]).map((x) => [x.f, x.p])).values()];
      if (await wkRun("Lint fixes", LINT_FIX(files), btn)) { li.res = li.res.filter((x) => !LINT_RULES[x.r][2]); wkShow("lint"); }
    }
  },
};
function liList() {
  if (!li.res.length) return '<p class="uc-good">Nothing to fix. Clean code.</p>';
  const by = {};
  for (const x of li.res) (by[x.r] = by[x.r] || []).push(x);
  return Object.entries(by).map(([r, list]) => `<div class="co-cat"><div class="uc-gh"><b>${LINT_RULES[r][0]}</b><span class="tag">${list.length}</span>${LINT_RULES[r][2] ? '<span class="nav-b">auto-fix</span>' : ""}</div>
    <p class="muted small-p">${esc(LINT_RULES[r][1])}</p>${list.slice(0, 25).map((x) => `<div class="fr-hit"><span>${x.l || ""}</span><code><b>${esc(x.f)}</b>${x.l ? " · " + esc(x.t.trim()) : ""}</code></div>`).join("")}
    ${list.length > 25 ? `<p class="muted small-p">…and ${list.length - 25} more.</p>` : ""}</div>`).join("");
}

// ── Arrange ─────────────────────────────────────────────────────────────────
const AR_BASE = `local items = {}
for _, o in sel do if o:IsA("BasePart") or o:IsA("Model") then table.insert(items, o) end end
local function box(o)
	if o:IsA("Model") then local cf, s = o:GetBoundingBox() return cf.Position, s end
	return o.Position, o.Size
end
local function shift(o, d) o:PivotTo(o:GetPivot() + d) end
local function comp(v, a) return a == "X" and v.X or a == "Y" and v.Y or v.Z end
local function vec(a, n) return a == "X" and Vector3.new(n, 0, 0) or a == "Y" and Vector3.new(0, n, 0) or Vector3.new(0, 0, n) end
`;
WK_TOOLS.arrange = {
  name: "Arrange", group: "Build", desc: "Line up what's selected: align edges or centres, space it evenly, stack it, or lay it out in a grid or a circle.",
  html: () => `
    ${fld("Axis", seg("ar-axis", [["X", "X"], ["Y", "Y"], ["Z", "Z"]], "X"))}
    <div class="row"><button class="btn sm" data-act="align" data-m="min">Align low edges</button><button class="btn sm" data-act="align" data-m="center">Align centres</button><button class="btn sm" data-act="align" data-m="max">Align high edges</button><button class="btn sm" data-act="dist">Space evenly</button></div>
    <div class="row">${fld("Gap", `<input class="input sm" id="ar-gap" type="number" step="0.5" value="1" />`, "studs")}<button class="btn sm" data-act="row">In a row with this gap</button><button class="btn sm" data-act="stack">Stack on top of each other</button></div>
    <div class="row">${fld("Columns", `<input class="input sm" id="ar-cols" type="number" min="1" max="100" value="4" />`)}<button class="btn sm" data-act="grid">Grid</button>${fld("Radius", `<input class="input sm" id="ar-r" type="number" min="1" value="20" />`, "studs")}<label class="chk"><input type="checkbox" id="ar-face" checked /> Face the middle</label><button class="btn sm" data-act="circle">Circle</button></div>
    <p class="muted small-p">Works on the parts and models you have selected. Sizes are measured straight along the world axes.</p>`,
  async act(a, btn) {
    const A = segVal("ar-axis") || "X", gap = lnum(val("ar-gap"), 1), cols = Math.round(lnum(val("ar-cols"), 4, 1, 100)), R = lnum(val("ar-r"), 20, 1);
    const ops = {
      align: `local m = ${lq(btn.dataset.m)}
local target
for _, o in items do
	local p, s = box(o)
	local v = m == "min" and comp(p, "${A}") - comp(s, "${A}") / 2 or m == "max" and comp(p, "${A}") + comp(s, "${A}") / 2 or comp(p, "${A}")
	if m == "min" then target = math.min(target or v, v) elseif m == "max" then target = math.max(target or v, v) else target = (target or 0) + v / #items end
end
for _, o in items do
	local p, s = box(o)
	local v = m == "min" and comp(p, "${A}") - comp(s, "${A}") / 2 or m == "max" and comp(p, "${A}") + comp(s, "${A}") / 2 or comp(p, "${A}")
	shift(o, vec("${A}", target - v))
end
return "Aligned " .. #items .. " things on ${A}"`,
      dist: `table.sort(items, function(a, b) return comp(box(a), "${A}") < comp(box(b), "${A}") end)
local first, last = comp(box(items[1]), "${A}"), comp(box(items[#items]), "${A}")
for i, o in items do shift(o, vec("${A}", first + (last - first) * (i - 1) / (#items - 1) - comp(box(o), "${A}"))) end
return "Spaced " .. #items .. " things evenly on ${A}"`,
      row: `table.sort(items, function(a, b) return comp(box(a), "${A}") < comp(box(b), "${A}") end)
local edge
for _, o in items do
	local p, s = box(o)
	local lo = comp(p, "${A}") - comp(s, "${A}") / 2
	if edge then shift(o, vec("${A}", edge + ${gap} - lo)) end
	local p2, s2 = box(o)
	edge = comp(p2, "${A}") + comp(s2, "${A}") / 2
end
return "Put " .. #items .. " things in a row"`,
      stack: `table.sort(items, function(a, b) return box(a).Y < box(b).Y end)
local top
for _, o in items do
	local p, s = box(o)
	if top then shift(o, Vector3.new(0, top - (p.Y - s.Y / 2), 0)) end
	local p2, s2 = box(o)
	top = p2.Y + s2.Y / 2
end
return "Stacked " .. #items .. " things"`,
      grid: `local cw, cd = 0, 0
for _, o in items do local _, s = box(o) cw = math.max(cw, s.X) cd = math.max(cd, s.Z) end
local origin = box(items[1])
for i, o in items do
	local col, row = (i - 1) % ${cols}, (i - 1) // ${cols}
	local p = box(o)
	shift(o, Vector3.new(origin.X + col * (cw + ${gap}) - p.X, 0, origin.Z + row * (cd + ${gap}) - p.Z))
end
return "Laid out " .. #items .. " things in a grid"`,
      circle: `local mid = Vector3.zero
for _, o in items do mid += box(o) end
mid /= #items
for i, o in items do
	local a = (i - 1) / #items * math.pi * 2
	local p = box(o)
	local at = Vector3.new(mid.X + math.cos(a) * ${R}, p.Y, mid.Z + math.sin(a) * ${R})
	shift(o, at - p)
	${chk("ar-face") ? `local piv = o:GetPivot()
	o:PivotTo(CFrame.lookAt(piv.Position, Vector3.new(mid.X, piv.Position.Y, mid.Z)))` : ""}
end
return "Put " .. #items .. " things in a circle"`,
    };
    const need = a === "circle" || a === "grid" ? 2 : a === "dist" ? 3 : 2;
    await wkRun("Arrange", `${AR_BASE}if #items < ${need} then return "ERR:Select at least ${need} parts or models." end
${ops[a]}`, btn);
  },
};

// ── Randomize ───────────────────────────────────────────────────────────────
WK_TOOLS.randomize = {
  name: "Randomize", group: "Build", desc: "Make copies look natural: a random turn, a little tilt, size and colour differences, and a nudge in position.",
  html: () => `
    <div class="wk-grid">
      ${fld("Tilt up to", `<input class="input" id="rz-tilt" type="number" min="0" max="45" value="4" />`, "degrees")}
      ${fld("Size ±", `<input class="input" id="rz-size" type="number" min="0" max="80" value="15" />`, "%")}
      ${fld("Colour ±", `<input class="input" id="rz-col" type="number" min="0" max="60" value="8" />`, "%")}
      ${fld("Move up to", `<input class="input" id="rz-move" type="number" min="0" max="50" value="0" />`, "studs sideways")}
    </div>
    <label class="chk"><input type="checkbox" id="rz-turn" checked /> Random turn</label>
    <div class="row"><button class="btn primary" data-act="go">Randomize the selection</button></div>`,
  async act(a, btn) {
    await wkRun("Randomize", `local rng = Random.new()
local TILT, SIZE, COL, MOVE, TURN = math.rad(${lnum(val("rz-tilt"), 4, 0, 45)}), ${lnum(val("rz-size"), 15, 0, 80) / 100}, ${lnum(val("rz-col"), 8, 0, 60) / 100}, ${lnum(val("rz-move"), 0, 0, 50)}, ${chk("rz-turn")}
local n = 0
for _, o in sel do
	if o:IsA("BasePart") or o:IsA("Model") then
		n += 1
		local piv = o:GetPivot()
		local turn = TURN and CFrame.Angles(0, rng:NextNumber(0, math.pi * 2), 0) or CFrame.identity
		local tilt = CFrame.Angles(rng:NextNumber(-TILT, TILT), 0, rng:NextNumber(-TILT, TILT))
		local move = MOVE > 0 and Vector3.new(rng:NextNumber(-MOVE, MOVE), 0, rng:NextNumber(-MOVE, MOVE)) or Vector3.zero
		o:PivotTo(CFrame.new(piv.Position + move) * turn * piv.Rotation * tilt)
		if SIZE > 0 then
			local k = 1 + rng:NextNumber(-SIZE, SIZE)
			if o:IsA("Model") then pcall(function() o:ScaleTo(o:GetScale() * k) end) else o.Size *= k end
		end
		if COL > 0 then
			local list = o:GetDescendants()
			table.insert(list, o)
			local dh, dv = rng:NextNumber(-COL, COL) / 4, rng:NextNumber(-COL, COL)
			for _, p in list do
				if p:IsA("BasePart") then
					local h, s, v = p.Color:ToHSV()
					p.Color = Color3.fromHSV((h + dh) % 1, s, math.clamp(v * (1 + dv), 0, 1))
				end
			end
		end
	end
end
if n == 0 then return "ERR:Select the parts or models to randomize." end
return "Randomized " .. n .. " things"`, btn);
  },
};

// ── Bulk edit ───────────────────────────────────────────────────────────────
const BE_PROPS = {
  Transparency: ["num", "parts"], Reflectance: ["num", "parts"], Size: ["vec", "parts"], CastShadow: ["bool", "parts"], CanCollide: ["bool", "parts"],
  CanTouch: ["bool", "parts"], CanQuery: ["bool", "parts"], Massless: ["bool", "parts"], Anchored: ["bool", "parts"], "Turn (Y)": ["deg", "sel"], Name: ["name", "sel"],
};
WK_TOOLS.bulk = {
  name: "Bulk edit", group: "Build", desc: "Change one property on everything selected at once - set it, add to it or multiply it.",
  html: () => `
    <div class="wk-grid">
      ${fld("Property", `<select class="input" id="be-prop">${Object.keys(BE_PROPS).map((p) => `<option>${p}</option>`).join("")}</select>`)}
      ${fld("How", `<select class="input" id="be-op"></select>`)}
      ${fld("Value", `<input class="input" id="be-val" />`, '<span id="be-hint"></span>')}
    </div>
    <div class="row"><button class="btn primary" data-act="go">Apply to the selection</button></div>`,
  mount() { const f = () => beOps(); $("be-prop").onchange = f; f(); },
  async act(a, btn) {
    const prop = val("be-prop"), [kind, on] = BE_PROPS[prop], op = val("be-op"), v = val("be-val").trim();
    let body;
    if (kind === "bool") body = `local v = ${op === "on"}\nfor _, p in parts do p.${prop} = v end\nreturn "Set ${prop} on " .. #parts .. " parts"`;
    else if (kind === "num") body = `local v = ${lnum(v, 0)}\nfor _, p in parts do p.${prop} = math.clamp(${op === "set" ? "v" : op === "add" ? `p.${prop} + v` : `p.${prop} * v`}, 0, 1) end\nreturn "Changed ${prop} on " .. #parts .. " parts"`;
    else if (kind === "vec") {
      const xyz = v.split(",").map((x) => lnum(x, 1));
      const V = xyz.length >= 3 ? `Vector3.new(${xyz.slice(0, 3).join(", ")})` : `Vector3.new(${xyz[0]}, ${xyz[0]}, ${xyz[0]})`;
      body = `local v = ${V}\nfor _, p in parts do p.Size = ${op === "set" ? "v" : op === "add" ? "p.Size + v" : "p.Size * v"} end\nreturn "Resized " .. #parts .. " parts"`;
    } else if (kind === "deg") body = `local d = math.rad(${lnum(v, 90)})\nlocal n = 0\nfor _, o in sel do if o:IsA("PVInstance") then local piv = o:GetPivot() o:PivotTo(${op === "set" ? "CFrame.new(piv.Position) * CFrame.Angles(0, d, 0)" : "piv * CFrame.Angles(0, d, 0)"}) n += 1 end end\nreturn "Turned " .. n .. " things"`;
    else {
      if (!v && op !== "number") { toast("Type the text first."); return; }
      body = op === "prefix" ? `for _, o in sel do o.Name = ${luaExact(v)} .. o.Name end` : op === "suffix" ? `for _, o in sel do o.Name = o.Name .. ${luaExact(v)} end`
        : `for i, o in sel do o.Name = ${luaExact(v || "")} .. i end`;
      body += `\nreturn "Renamed " .. #sel .. " things"`;
    }
    await wkRun("Bulk " + prop, `if #sel == 0 then return "ERR:Select something in Studio first." end\n${on === "parts" ? 'if #parts == 0 then return "ERR:There are no parts in the selection." end\n' : ""}${body}`, btn);
  },
};
function beOps() {
  const kind = BE_PROPS[val("be-prop")][0];
  const ops = { bool: [["on", "Turn on"], ["off", "Turn off"]], num: [["set", "Set to"], ["add", "Add"], ["mul", "Multiply by"]], vec: [["mul", "Multiply by"], ["set", "Set to"], ["add", "Add"]],
    deg: [["add", "Turn by"], ["set", "Set to"]], name: [["prefix", "Add before"], ["suffix", "Add after"], ["number", "Name + number"]] }[kind];
  $("be-op").innerHTML = ops.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
  $("be-val").disabled = kind === "bool";
  $("be-val").placeholder = { num: "0.5", vec: "2  or  1, 2, 1", deg: "90", name: "Coin", bool: "" }[kind];
  $("be-hint").textContent = { num: "0 to 1", vec: "one number, or x, y, z", deg: "degrees", name: "", bool: "" }[kind];
}

// ── Tags ────────────────────────────────────────────────────────────────────
const tg = { list: null };
WK_TOOLS.tags = {
  name: "Tags", group: "Plan", desc: "Every CollectionService tag in the place, how many things have it, and quick ways to select, rename or remove it.",
  html: () => `<div class="row"><button class="btn" data-act="load">Refresh</button><span class="grow"></span><input class="input sm" id="tg-new" placeholder="Tag name" maxlength="40" /><button class="btn sm" data-act="add">Tag the selection</button></div>
    <div id="tg-out">${tg.list ? (tg.list.length ? tg.list.map((t) => `<div class="tg-row"><b>${esc(t.tag)}</b><span class="tag">${t.n}</span><span class="muted">${esc(t.ex.join(", "))}</span><span class="grow"></span>
      <button class="btn sm" data-act="select" data-t="${esc(t.tag)}">Select</button><button class="btn sm ghost" data-act="rename" data-t="${esc(t.tag)}">Rename</button><button class="btn sm ghost" data-act="untag" data-t="${esc(t.tag)}">Remove</button></div>`).join("") : '<p class="muted">No tags in this place yet.</p>') : '<p class="muted small-p">Press Refresh to read the tags.</p>'}</div>`,
  mount() { if (!tg.list && S.state.connected) this.act("load", { textContent: "", disabled: false }); },
  async act(a, btn) {
    const CS = 'local CS = game:GetService("CollectionService")\n';
    if (a === "load") {
      try { tg.list = JSON.parse(await stLuau(`local HS = game:GetService("HttpService")\n${CS}local out = {}
-- only things in your game, not Studio's own UI
local roots = {}
for _, name in { "Workspace", "ReplicatedStorage", "ReplicatedFirst", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams" } do
	local ok, s = pcall(game.GetService, game, name) if ok then table.insert(roots, s) end
end
local function mine(o) for _, r in roots do if o == r or o:IsDescendantOf(r) then return true end end return false end
for _, t in CS:GetAllTags() do
	local list = {}
	for _, o in CS:GetTagged(t) do if mine(o) then table.insert(list, o) end end
	if #list > 0 then
		local ex = {}
		for i, o in list do if i > 3 then break end table.insert(ex, o.Name) end
		table.insert(out, { tag = t, n = #list, ex = ex })
	end
end
return HS:JSONEncode({ t = out })`)).t; if (wk.tool === "tags") wkShow("tags"); } catch (e) { toast(errText(e), 5000); }
      return;
    }
    const t = btn.dataset.t;
    let body;
    if (a === "add") { const n = val("tg-new").trim(); if (!n) { toast("Type a tag name."); return; } body = `for _, o in sel do CS:AddTag(o, ${luaExact(n)}) end return "Tagged " .. #sel .. " thing(s) ${n.replace(/"/g, "")}"`; }
    if (a === "select") { try { toast(await stLuau(`${CS}local l = CS:GetTagged(${luaExact(t)}) game:GetService("Selection"):Set(l) return "Selected " .. #l .. " in Studio"`)); } catch (e) { toast(errText(e)); } return; }
    if (a === "untag") body = `local l = CS:GetTagged(${luaExact(t)}) for _, o in l do CS:RemoveTag(o, ${luaExact(t)}) end return "Removed the tag from " .. #l .. " thing(s)"`;
    if (a === "rename") {
      const n = val("tg-new").trim();
      if (!n) { toast("Type the new name in the box at the top first."); $("tg-new").focus(); return; }
      body = `local l = CS:GetTagged(${luaExact(t)}) for _, o in l do CS:AddTag(o, ${luaExact(n)}) CS:RemoveTag(o, ${luaExact(t)}) end return "Renamed the tag on " .. #l .. " thing(s)"`;
    }
    if (await wkRun("Tags", CS + body, btn)) this.act("load", btn);
  },
};

// ── Cleanup ─────────────────────────────────────────────────────────────────
const CL_SCAN = (act) => `local HS = game:GetService("HttpService")
local cats = { dupes = {}, scripts = {}, fallen = {}, empty = {} }
local seen = {}
local floor = workspace.FallenPartsDestroyHeight + 10
for _, p in workspace:GetDescendants() do
	if p:IsA("BasePart") and not p:IsA("Terrain") then
		local s, c = p.Size, p.CFrame
		local rx, ry, rz = c:ToOrientation()
		local key = string.format("%s|%.2f|%.2f|%.2f|%.2f|%.2f|%.2f|%.1f|%.1f|%.1f", p.ClassName, s.X, s.Y, s.Z, c.X, c.Y, c.Z, math.deg(rx), math.deg(ry), math.deg(rz))
		if seen[key] then table.insert(cats.dupes, p) else seen[key] = true end
		if p.Position.Y < floor then table.insert(cats.fallen, p) end
	end
end
local function ALL() -- your game only: never Studio's own plugin or core areas
	local out = {}
	for _, name in { "Workspace", "ReplicatedStorage", "ReplicatedFirst", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams", "Chat", "TextChatService", "LocalizationService", "MaterialService" } do
		local ok, s = pcall(game.GetService, game, name)
		if ok and s then for _, d in s:GetDescendants() do table.insert(out, d) end end
	end
	return out
end
for _, d in ALL() do
	if d:IsA("LuaSourceContainer") then
		local ok, src = pcall(function() return d.Source end)
		if ok and src and (string.match(src, "^%s*$") or string.match(src, '^%s*print%("Hello world!"%)%s*$')) then table.insert(cats.scripts, d) end
	elseif (d:IsA("Folder") or d:IsA("Model")) and #d:GetChildren() == 0 and d:IsDescendantOf(workspace) then
		table.insert(cats.empty, d)
	end
end
${act ? `local list = cats[${luaExact(act[1])}]
${act[0] === "select" ? 'game:GetService("Selection"):Set(list) return "Selected " .. #list .. " in Studio"' : 'for _, o in list do o.Parent = nil end return "Removed " .. #list'}` : `local out = {}
for k, list in cats do
	out[k] = { n = #list, names = {} }
	for i, o in list do if i > 20 then break end table.insert(out[k].names, o:GetFullName()) end
end
return HS:JSONEncode(out)`}`;
const CL_CAT = { dupes: ["Duplicate parts", "Exact copies in the same spot - they flicker and cost memory."], scripts: ["Empty scripts", "Blank, or still \"Hello world!\"."], fallen: ["Below the kill height", "Parts under FallenPartsDestroyHeight get destroyed when the game runs."], empty: ["Empty folders and models", "In Workspace, with nothing inside."] };
const cl = { data: null };
WK_TOOLS.cleanup = {
  name: "Cleanup", group: "Check", desc: "Duplicate parts, blank or \"Hello world!\" scripts, parts below the kill height and empty folders - select or remove them.",
  html: () => `<div class="row"><button class="btn primary" data-act="scan">Look for clutter</button></div><div id="cl-out">${cl.data ? Object.entries(CL_CAT).map(([k, [t, why]]) => `<div class="co-cat"><div class="uc-gh"><b>${t}</b><span class="tag">${cl.data[k].n}</span>${cl.data[k].n ? `<button class="btn sm" data-act="select" data-k="${k}">Select</button><button class="btn sm" data-act="remove" data-k="${k}">Remove</button>` : ""}</div>
    <p class="muted small-p">${why}</p>${cl.data[k].names.map((n) => `<div class="co-n">${esc(n)}</div>`).join("")}${cl.data[k].n > cl.data[k].names.length ? `<p class="muted small-p">…and ${cl.data[k].n - cl.data[k].names.length} more.</p>` : ""}</div>`).join("") : ""}</div>`,
  async act(a, btn) {
    if (a === "scan") {
      btn.disabled = true; btn.textContent = "Looking…";
      try { cl.data = JSON.parse(await stLuau(CL_SCAN(null), 90000)); wkShow("cleanup"); } catch (e) { toast(errText(e), 5000); }
      finally { btn.disabled = false; btn.textContent = "Look for clutter"; }
      return;
    }
    if (a === "select") { try { toast(await stLuau(CL_SCAN(["select", btn.dataset.k]), 90000)); } catch (e) { toast(errText(e)); } return; }
    if (a === "remove" && await wkRun("Cleanup", CL_SCAN(["remove", btn.dataset.k]), btn)) { if (cl.data) cl.data[btn.dataset.k] = { n: 0, names: [] }; wkShow("cleanup"); }
  },
};

// ── Luau console ────────────────────────────────────────────────────────────
let lcHist = [], lcSnips = {};
try { lcHist = JSON.parse(lsGet("vs-lc-hist") || "[]"); lcSnips = JSON.parse(lsGet("vs-lc-snips") || "{}"); } catch {}
const lc = { out: "", code: lcHist[0] || 'return #workspace:GetDescendants() .. " things in Workspace"' };
WK_TOOLS.console = {
  name: "Luau console", group: "Plan", desc: "Run your own Luau in Studio from here, see what it returns, and keep the snippets you use a lot.",
  html: () => `<textarea class="input lc-code" id="lc-code" spellcheck="false" rows="8">${esc(lc.code)}</textarea>
    <div class="row"><button class="btn primary" data-act="run">Run <kbd class="kb-in">Ctrl ↵</kbd></button><label class="chk"><input type="checkbox" id="lc-undo" checked /> One Ctrl+Z undoes it</label><span class="grow"></span><input class="input sm" id="lc-name" placeholder="Snippet name" maxlength="30" /><button class="btn sm" data-act="snip">Save snippet</button></div>
    <pre class="st-code lc-out" id="lc-out" ${lc.out ? "" : "hidden"}>${esc(lc.out)}</pre>
    ${Object.keys(lcSnips).length ? `<div class="lc-chips"><span class="muted">Snippets</span>${Object.keys(lcSnips).map((n) => `<button class="chip-b" data-act="load" data-n="${esc(n)}">${esc(n)}</button><button class="link" data-act="delsnip" data-n="${esc(n)}" aria-label="Delete ${esc(n)}">×</button>`).join("")}</div>` : ""}
    ${lcHist.length > 1 ? `<div class="lc-chips"><span class="muted">Recent</span>${lcHist.slice(0, 8).map((c, i) => `<button class="chip-b" data-act="hist" data-i="${i}" title="${esc(c.slice(0, 300))}">${esc(c.split("\n")[0].slice(0, 40))}</button>`).join("")}</div>` : ""}`,
  mount() {
    $("lc-code").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); document.querySelector('#wk-panel [data-act="run"]').click(); }
      else if (e.key === "Tab") { e.preventDefault(); document.execCommand("insertText", false, "\t"); }
    });
    $("lc-code").addEventListener("input", () => { lc.code = $("lc-code").value; });
  },
  async act(a, btn) {
    lc.code = val("lc-code");
    if (a === "load") { lc.code = lcSnips[btn.dataset.n]; wkShow("console"); return; }
    if (a === "hist") { lc.code = lcHist[Number(btn.dataset.i)]; wkShow("console"); return; }
    if (a === "delsnip") { delete lcSnips[btn.dataset.n]; lsSet("vs-lc-snips", JSON.stringify(lcSnips)); wkShow("console"); return; }
    if (a === "snip") { const n = val("lc-name").trim(); if (!n) { toast("Name the snippet first."); return; } lcSnips[n] = lc.code; lsSet("vs-lc-snips", JSON.stringify(lcSnips)); wkShow("console"); toast("Saved."); return; }
    if (a === "run") {
      if (!lc.code.trim()) return;
      lcHist = [lc.code].concat(lcHist.filter((c) => c !== lc.code)).slice(0, 20);
      lsSet("vs-lc-hist", JSON.stringify(lcHist));
      btn.disabled = true;
      const t0 = Date.now();
      try {
        const r = await invoke("bridge_request", { payload: { type: "call_tool", name: "execute_luau", arguments: { code: chk("lc-undo") ? stUndoable("Console", lc.code) : lc.code, datamodel_type: "Edit" } }, timeoutMs: 120000 });
        lc.out = (r && (r.text || r.error)) || "(nothing returned)";
        lc.out = `${r && r.ok ? "✓" : "✗"} ${((Date.now() - t0) / 1000).toFixed(1)}s\n${lc.out}`;
      } catch (e) { lc.out = "✗ " + errText(e); }
      finally { btn.disabled = false; }
      wkShow("console");
    }
  },
};

// The page was drawn before these tools existed: redraw the list, and reopen
// the last tool if it's one of these.
if (WK_TOOLS[lsGet("vs-wk-tool")]) wkShow(lsGet("vs-wk-tool")); else wkNav();
