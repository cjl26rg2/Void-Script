// SPDX-License-Identifier: GPL-3.0-or-later
// navigator.js - the Scripts map on the Explorer page: every script in the
// place, what each one requires and what requires it, modules nothing uses,
// requires that point at nothing, and a find-in-all-scripts search.
"use strict";

// Every script, with the module names its require() calls point at. The name is
// the last thing inside require(...): require(script.Parent.Config),
// require(RS:WaitForChild("Config")) and require(RS.Modules["Config"]) all give
// "Config". Numeric requires (asset ids) are counted separately.
const NAV_SCAN = `
local HS = game:GetService("HttpService")
local out, n = {}, 0
local function idx(o)
	local p = {}
	while o and o.Parent ~= game do
		table.insert(p, 1, table.find(o.Parent:GetChildren(), o))
		o = o.Parent
	end
	if not o then return nil end
	table.insert(p, 1, o.ClassName)
	return p
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
	if d:IsA("LuaSourceContainer") and n < 1500 then
		local ok, src = pcall(function() return d.Source end)
		if ok and src then
			n += 1
			local reqs, ids = {}, 0
			for inner in string.gmatch(src, "require%s*(%b())") do
				local body = string.sub(inner, 2, -2)
				if string.match(body, "^%s*%d+%s*$") then ids += 1 else
					local name = string.match(body, "[\\"']([%w_ ]+)[\\"']%s*[%)%]]?%s*$") or string.match(body, "([%w_]+)%s*$")
					if name and name ~= "script" and name ~= "Parent" then table.insert(reqs, name) end
				end
			end
			local _, lines = string.gsub(src, "\\n", "")
			table.insert(out, { name = d.Name, class = d.ClassName, full = d:GetFullName(), p = idx(d), lines = lines + 1, reqs = reqs, ids = ids,
				off = (d:IsA("BaseScript") and (d.Disabled or not d.Enabled)) or nil })
		end
	end
end
return HS:JSONEncode({ scripts = out, capped = n >= 1500 })`;

// Every RemoteEvent / RemoteFunction, and the script lines that fire or listen
// to it. Matched by name: on the same line as the call, or through a local
// variable set from it (local buy = RS:WaitForChild("BuyItem") ... buy:FireServer()).
const NAV_REMOTES = `
local HS = game:GetService("HttpService")
local remotes, byName = {}, {}
local function ALL() -- your game only: never Studio's own plugin or core areas
	local out = {}
	for _, name in { "Workspace", "ReplicatedStorage", "ReplicatedFirst", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams", "Chat", "TextChatService", "LocalizationService", "MaterialService" } do
		local ok, s = pcall(game.GetService, game, name)
		if ok and s then for _, d in s:GetDescendants() do table.insert(out, d) end end
	end
	return out
end
for _, d in ALL() do
	if (d:IsA("RemoteEvent") or d:IsA("RemoteFunction") or d:IsA("UnreliableRemoteEvent")) and #remotes < 400 then
		local r = { name = d.Name, class = d.ClassName, full = d:GetFullName(), fire = {}, listen = {} }
		table.insert(remotes, r)
		byName[d.Name] = byName[d.Name] or {}
		table.insert(byName[d.Name], r)
	end
end
local FIRE = { "FireServer", "InvokeServer", "FireClient", "FireAllClients", "InvokeClient" }
local LISTEN = { "OnServerEvent", "OnServerInvoke", "OnClientEvent", "OnClientInvoke" }
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
		if ok and src then
			local vars = {}
			local lines = string.split(src, "\\n")
			for ln, line in lines do
				local v, rest = string.match(line, "^%s*local%s+([%w_]+)%s*=%s*(.+)$")
				if v then
					for name in string.gmatch(rest, "[\\"']([%w_ ]+)[\\"']") do if byName[name] then vars[v] = name end end
					local last = string.match(rest, "%.([%w_]+)%s*$")
					if last and byName[last] then vars[v] = last end
				end
				local function hit(list, key)
					for _, word in list do
						if string.find(line, word, 1, true) then
							local found = nil
							for name in pairs(byName) do if string.find(line, name, 1, true) then found = name break end end
							if not found then for var, name in pairs(vars) do if string.find(line, var .. "[.:]" .. word) then found = name break end end end
							if found then
								for _, r in byName[found] do
									if #r[key] < 40 then
										local e = { s = d:GetFullName(), c = d.ClassName, l = ln, w = word }
										-- a server handler: does it check what the client sent in the next lines?
										if string.sub(word, 1, 8) == "OnServer" then
											e.checks = false
											for k = ln, math.min(ln + 15, #lines) do
												local t = lines[k]
												if string.find(t, "typeof(", 1, true) or string.find(t, "type(", 1, true) or string.find(t, "tonumber(", 1, true)
													or string.find(t, "assert(", 1, true) or string.find(t, ":IsA(", 1, true) or string.find(t, "math.clamp", 1, true) then
													e.checks = true break
												end
											end
										end
										table.insert(r[key], e)
									end
								end
							end
						end
					end
				end
				hit(FIRE, "fire")
				hit(LISTEN, "listen")
			end
		end
	end
end
return HS:JSONEncode({ remotes = remotes })`;

const nav = { data: null, sel: null, mode: "tree", filter: "all", q: "", remotes: null };
function navGraph(list) {
  const byName = {};
  for (const s of list) if (s.class === "ModuleScript") (byName[s.name] = byName[s.name] || []).push(s);
  for (const s of list) { s.uses = []; s.usedBy = []; s.missing = []; }
  for (const s of list) {
    for (const r of [...new Set(s.reqs)]) {
      const hit = byName[r];
      if (hit) for (const m of hit) { s.uses.push(m); m.usedBy.push(s); }
      else s.missing.push(r);
    }
  }
  // A module nothing requires (by name) is probably dead code.
  for (const s of list) s.unused = s.class === "ModuleScript" && !s.usedBy.length;
}
const NAV_FILTERS = [["all", "All"], ["unused", "Unused modules"], ["missing", "Broken requires"], ["off", "Disabled"], ["big", "Over 500 lines"]];
function navMatch(s) {
  const f = nav.filter;
  if (f === "unused" && !s.unused) return false;
  if (f === "missing" && !s.missing.length) return false;
  if (f === "off" && !s.off) return false;
  if (f === "big" && s.lines <= 500) return false;
  return !nav.q || s.full.toLowerCase().includes(nav.q);
}
const navKind = (s) => (s.class === "ModuleScript" ? "M" : s.class === "LocalScript" ? "L" : "S");
function navList() {
  if (!nav.data) { $("ex-list").innerHTML = '<p class="muted small-p">Press Map scripts to scan the place.</p>'; return; }
  const list = nav.data.scripts.filter(navMatch);
  const counts = { unused: 0, missing: 0, off: 0, big: 0 };
  for (const s of nav.data.scripts) { if (s.unused) counts.unused++; if (s.missing.length) counts.missing++; if (s.off) counts.off++; if (s.lines > 500) counts.big++; }
  $("ex-list").innerHTML = `<div class="nav-filters">${NAV_FILTERS.map(([k, t]) => `<button class="${nav.filter === k ? "on" : ""}" data-f="${k}">${t}${counts[k] ? ` <em>${counts[k]}</em>` : ""}</button>`).join("")}</div>`
    + (list.length ? list.slice(0, 400).map((s) => `<button class="ex-row nav-row${nav.sel === s ? " on" : ""}" data-i="${nav.data.scripts.indexOf(s)}">
      <span class="nav-k k${navKind(s)}">${navKind(s)}</span><span class="ex-n">${esc(s.name)}</span>
      ${s.missing.length ? '<span class="nav-b bad">broken</span>' : s.unused ? '<span class="nav-b">unused</span>' : s.off ? '<span class="nav-b">off</span>' : ""}
      <span class="ex-c">${s.lines}</span></button>`).join("") : '<p class="muted small-p">Nothing here.</p>');
}
function navDetail(s) {
  nav.sel = s;
  navList();
  const link = (x) => `<button class="nav-link" data-i="${nav.data.scripts.indexOf(x)}"><span class="nav-k k${navKind(x)}">${navKind(x)}</span>${esc(x.full)}</button>`;
  const notes = [];
  if (s.missing.length) notes.push(`Requires ${s.missing.map((m) => `<b>${esc(m)}</b>`).join(", ")} - no ModuleScript has that name.`);
  if (s.unused) notes.push("No script requires this module by name. It may be unused (or required by a path we can't follow).");
  if (s.ids) notes.push(`Loads ${s.ids} module(s) by asset id - check you trust where they come from.`);
  if (s.off) notes.push("This script is disabled, so it doesn't run.");
  if (s.lines > 500) notes.push(`${s.lines} lines - consider splitting it into modules.`);
  $("ex-detail").innerHTML = `
    <div class="lib-head"><span class="ki nav-k big k${navKind(s)}">${navKind(s)}</span><div><b>${esc(s.name)}</b><span>${esc(s.class)} · ${esc(s.full)} · ${s.lines} lines</span></div></div>
    <div class="row"><button class="btn sm" data-n="open">Open in the tree</button><button class="btn sm" data-n="ask">Ask the AI about it</button></div>
    ${notes.length ? `<ul class="st-notes">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>` : ""}
    <div class="nav-cols">
      <div><div class="card-t">Requires <span class="tag">${s.uses.length}</span></div>${s.uses.map(link).join("") || '<p class="muted small-p">Nothing.</p>'}</div>
      <div><div class="card-t">Required by <span class="tag">${s.usedBy.length}</span></div>${s.usedBy.map(link).join("") || '<p class="muted small-p">Nothing.</p>'}</div>
    </div>`;
}
async function navScan() {
  const btn = $("btn-nav-scan");
  btn.disabled = true; btn.textContent = "Mapping…";
  $("ex-list").innerHTML = '<span class="spin"></span>';
  try {
    nav.data = await exLuau(NAV_SCAN);
    navGraph(nav.data.scripts);
    if (nav.data.capped) toast("Big place - mapped the first 1,500 scripts.", 4000);
    nav.sel = null;
    navList();
    const d = nav.data.scripts;
    $("ex-detail").innerHTML = `<div class="nav-sum">
      <div><b>${d.length}</b><span>scripts</span></div>
      <div><b>${d.reduce((a, s) => a + s.lines, 0).toLocaleString()}</b><span>lines</span></div>
      <div><b>${d.filter((s) => s.class === "ModuleScript").length}</b><span>modules</span></div>
      <div><b>${d.filter((s) => s.missing.length).length}</b><span>broken requires</span></div>
      <div><b>${d.filter((s) => s.unused).length}</b><span>unused modules</span></div></div>
      <p class="muted">Pick a script to see what it needs and what needs it.</p>`;
  } catch (e) { $("ex-list").innerHTML = `<p class="muted small-p">${esc(errText(e))}</p>`; }
  finally { btn.disabled = false; btn.textContent = "Map scripts"; }
}

// Find text in every script: each hit with its line.
async function navFind(text) {
  if (!text) return;
  $("ex-detail").innerHTML = '<span class="spin"></span>';
  try {
    const r = await exLuau(`local HS = game:GetService("HttpService")
local want = HS:JSONDecode([==[${JSON.stringify([text])}]==])[1]
local out, total = {}, 0
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
		if ok and src and string.find(src, want, 1, true) then
			local ln = 0
			for line in string.gmatch(src .. "\\n", "(.-)\\n") do
				ln += 1
				if string.find(line, want, 1, true) then
					total += 1
					if #out < 300 then table.insert(out, { s = d:GetFullName(), l = ln, t = string.sub(line, 1, 160) }) end
				end
			end
		end
	end
end
return HS:JSONEncode({ hits = out, total = total })`);
    const rows = r.hits.map((h) => `<div class="nav-hit"><span>${esc(h.s)}<em>:${h.l}</em></span><code>${esc(h.t.trim())}</code></div>`).join("");
    $("ex-detail").innerHTML = `<div class="card-t">“${esc(text)}” <span class="tag">${r.total}</span></div>${rows || '<p class="muted">Not found in any script.</p>'}${r.total > r.hits.length ? `<p class="muted small-p">Showing the first ${r.hits.length}.</p>` : ""}`;
  } catch (e) { $("ex-detail").innerHTML = `<p class="muted">${esc(errText(e))}</p>`; }
}

function navRemoteIssue(r) {
  const fromClient = r.fire.some((f) => /Server$/.test(f.w)), serverHears = r.listen.some((f) => /^OnServer/.test(f.w));
  const fromServer = r.fire.some((f) => /Client/.test(f.w)), clientHears = r.listen.some((f) => /^OnClient/.test(f.w));
  if (fromClient && !serverHears) return "Fired by a client, but nothing on the server listens";
  if (fromServer && !clientHears) return "Fired by the server, but no client listens";
  if (!r.fire.length && !r.listen.length) return "Not used by any script";
  if (serverHears && !fromClient) return "The server listens, but no script fires it";
  if (r.listen.some((f) => f.checks === false)) return "A server handler doesn't seem to check what the client sends (no typeof / tonumber / assert / IsA nearby)";
  return "";
}
async function navRemotes() {
  const btn = $("btn-nav-scan");
  btn.disabled = true; btn.textContent = "Mapping…";
  $("ex-list").innerHTML = '<span class="spin"></span>';
  try {
    nav.remotes = (await exLuau(NAV_REMOTES)).remotes;
    navRemoteList();
    const bad = nav.remotes.filter(navRemoteIssue).length;
    $("ex-detail").innerHTML = `<div class="nav-sum"><div><b>${nav.remotes.length}</b><span>remotes</span></div><div><b>${bad}</b><span>need a look</span></div></div>
      <p class="muted">Each remote with the scripts that fire it and listen to it. They're matched by name, so a remote passed around in a table may not show who uses it.</p>`;
  } catch (e) { $("ex-list").innerHTML = `<p class="muted small-p">${esc(errText(e))}</p>`; }
  finally { btn.disabled = false; btn.textContent = "Map remotes"; }
}
function navRemoteList() {
  if (!nav.remotes) { $("ex-list").innerHTML = '<p class="muted small-p">Press Map remotes to scan the place.</p>'; return; }
  const list = nav.remotes.filter((r) => !nav.q || r.full.toLowerCase().includes(nav.q));
  $("ex-list").innerHTML = list.length ? list.map((r) => `<button class="ex-row nav-row" data-r="${nav.remotes.indexOf(r)}"><span class="nav-k kR">${r.class === "RemoteFunction" ? "F" : "E"}</span><span class="ex-n">${esc(r.name)}</span>${navRemoteIssue(r) ? '<span class="nav-b bad">check</span>' : ""}<span class="ex-c" title="fired / listened">${r.fire.length} → ${r.listen.length}</span></button>`).join("")
    : '<p class="muted small-p">No RemoteEvents or RemoteFunctions here.</p>';
}
function navRemoteDetail(r) {
  const k = (c) => (c === "LocalScript" ? "L" : c === "ModuleScript" ? "M" : "S");
  const row = (f) => `<div class="nav-hit"><span><span class="nav-k k${k(f.c)}">${k(f.c)}</span> ${esc(f.s)}<em>:${f.l}</em></span><code>${esc(f.w)}${f.checks === false ? ' <b class="nav-warn">· no input checks found</b>' : f.checks ? " · checks input" : ""}</code></div>`;
  const issue = navRemoteIssue(r);
  $("ex-detail").innerHTML = `
    <div class="lib-head"><span class="ki nav-k big kR">${r.class === "RemoteFunction" ? "F" : "E"}</span><div><b>${esc(r.name)}</b><span>${esc(r.class)} · ${esc(r.full)}</span></div></div>
    ${issue ? `<ul class="st-notes"><li>${esc(issue)}.</li></ul>` : ""}
    <div class="nav-cols">
      <div><div class="card-t">Fired by <span class="tag">${r.fire.length}</span></div>${r.fire.map(row).join("") || '<p class="muted small-p">Nothing found.</p>'}</div>
      <div><div class="card-t">Listened to by <span class="tag">${r.listen.length}</span></div>${r.listen.map(row).join("") || '<p class="muted small-p">Nothing found.</p>'}</div>
    </div>
    <p class="muted small-p">A server listener gets the player first. Check anything a client sends before you trust it.</p>`;
}

function navMode(m) {
  nav.mode = m;
  $("ex-mode").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
  $("btn-nav-scan").hidden = m === "tree";
  $("btn-nav-scan").textContent = m === "remotes" ? "Map remotes" : "Map scripts";
  $("ex-q").placeholder = m === "scripts" ? "Filter scripts · Enter finds text in all of them" : m === "remotes" ? "Filter remotes" : "Find anything by name (Enter)";
  $("ex-q").value = "";
  nav.q = "";
  if (m === "scripts") { navList(); if (!nav.data && S.state.connected) navScan(); }
  else if (m === "remotes") { navRemoteList(); if (!nav.remotes && S.state.connected) navRemotes(); }
  else exRender();
}
$("ex-mode").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b) navMode(b.dataset.m); });
$("btn-nav-scan").onclick = () => (nav.mode === "remotes" ? navRemotes() : navScan());
// In Scripts mode the search box filters the list, and Enter searches inside scripts.
$("ex-q").addEventListener("keydown", (e) => {
  if (nav.mode === "tree") return;
  e.stopImmediatePropagation();
  if (e.key === "Enter" && nav.mode === "scripts") navFind($("ex-q").value.trim());
  if (e.key === "Escape") { $("ex-q").value = ""; nav.q = ""; if (nav.mode === "remotes") navRemoteList(); else navList(); }
}, true);
$("ex-q").addEventListener("input", (e) => {
  if (nav.mode === "tree") return;
  e.stopImmediatePropagation();
  nav.q = $("ex-q").value.trim().toLowerCase();
  if (nav.mode === "remotes") navRemoteList(); else navList();
}, true);
$("ex-list").addEventListener("click", (e) => {
  if (nav.mode === "tree") return;
  e.stopImmediatePropagation();
  const rr = e.target.closest("[data-r]");
  if (rr) { navRemoteDetail(nav.remotes[Number(rr.dataset.r)]); return; }
  const f = e.target.closest("[data-f]");
  if (f) { nav.filter = f.dataset.f; navList(); return; }
  const row = e.target.closest("[data-i]");
  if (row) navDetail(nav.data.scripts[Number(row.dataset.i)]);
}, true);
$("ex-detail").addEventListener("click", (e) => {
  if (nav.mode !== "scripts") return;
  const l = e.target.closest(".nav-link");
  if (l) { e.stopImmediatePropagation(); navDetail(nav.data.scripts[Number(l.dataset.i)]); return; }
  const b = e.target.closest("[data-n]");
  if (!b || !nav.sel) return;
  e.stopImmediatePropagation();
  if (b.dataset.n === "open" && nav.sel.p) { navMode("tree"); exSelect(nav.sel.p); }
  if (b.dataset.n === "ask") { go("chat"); input.value = `About ${nav.sel.full} (a ${nav.sel.class}): `; grow(); input.focus(); }
}, true);
