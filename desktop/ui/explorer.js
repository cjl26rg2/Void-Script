// SPDX-License-Identifier: GPL-3.0-or-later
// explorer.js - the Explorer page: the game tree live from Studio, an inspector,
// and a script editor. Everything goes through execute_luau in Studio's Edit mode.
// A node is addressed by [service class, child index, child index, …].
"use strict";

const EX_ROOTS = ["Workspace", "ReplicatedStorage", "ReplicatedFirst", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams"];
const EX_RESOLVE = `local HS = game:GetService("HttpService")
local function resolve(path)
	local ok, node = pcall(game.GetService, game, path[1])
	if not ok then return nil end
	for i = 2, #path do
		node = node:GetChildren()[path[i]]
		if not node then return nil end
	end
	return node
end
`;
const exPath = (p) => `HS:JSONDecode([==[${JSON.stringify(p)}]==])`;
const EX_CLASS_ICON = {
  Script: "script", LocalScript: "script", ModuleScript: "script", Folder: "folder", Model: "model", Part: "part", MeshPart: "part",
  UnionOperation: "part", WedgePart: "part", ScreenGui: "gui", Frame: "gui", TextLabel: "gui", TextButton: "gui", ImageLabel: "gui",
  Sound: "sound", RemoteEvent: "remote", RemoteFunction: "remote", BindableEvent: "remote", PointLight: "light", SpotLight: "light", SurfaceLight: "light",
};
const EX_ICONS = {
  script: '<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5"/>',
  folder: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  model: '<path d="M12 2.5 3.5 7.2v9.6L12 21.5l8.5-4.7V7.2z"/><path d="M3.5 7.2 12 12l8.5-4.8M12 12v9.5"/>',
  part: '<rect x="4" y="4" width="16" height="16" rx="2.5"/>',
  gui: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 9.5h18"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
  remote: '<path d="M4 12h6M14 12h6M10 9l3 3-3 3"/>',
  light: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  service: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M7 12h10"/>',
  other: '<circle cx="12" cy="12" r="3.5"/>',
};
const exIcon = (cls, svc) => `<svg viewBox="0 0 24 24">${EX_ICONS[svc ? "service" : EX_CLASS_ICON[cls] || "other"]}</svg>`;
const ex = { open: {}, kids: {}, sel: null, loaded: false };
const exKey = (p) => p.join("/");

async function exLuau(code) {
  const out = await callTool("execute_luau", { code, datamodel_type: "Edit" }, 45000);
  const s = String(out || "").replace(/^Output of '[^']*':\n?/, "");
  const i = s.search(/[[{]/);
  try { return JSON.parse(i >= 0 ? s.slice(i) : s); }
  catch { throw new Error("Studio said: " + (s.trim().slice(0, 240) || "nothing")); }
}
async function exChildren(path) {
  return exLuau(EX_RESOLVE + `local node = resolve(${exPath(path)})
if not node then return "[]" end
local out = {}
for i, c in node:GetChildren() do
	if i > 500 then break end
	out[#out + 1] = { n = c.Name, c = c.ClassName, k = #c:GetChildren(), i = i }
end
return HS:JSONEncode(out)`);
}

function exRow(path, name, cls, kids, depth, svc) {
  const k = exKey(path);
  const open = !!ex.open[k];
  return `<button class="ex-row${ex.sel === k ? " on" : ""}" data-p="${esc(JSON.stringify(path))}" style="padding-left:${8 + depth * 16}px">
    <span class="ex-tw${kids ? "" : " none"}${open ? " open" : ""}"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></span>
    <span class="ex-ic c-${svc ? "service" : EX_CLASS_ICON[cls] || "other"}">${exIcon(cls, svc)}</span><span class="ex-n">${esc(name)}</span><span class="ex-c">${esc(svc ? "" : cls)}</span></button>`;
}
function exRender() {
  const rows = [];
  const walk = (path, depth) => {
    for (const c of ex.kids[exKey(path)] || []) {
      const p = path.concat(c.i);
      rows.push(exRow(p, c.n, c.c, c.k, depth));
      if (ex.open[exKey(p)]) walk(p, depth + 1);
    }
  };
  for (const r of EX_ROOTS) {
    rows.push(exRow([r], r, r, 1, 0, true));
    if (ex.open[r]) walk([r], 1);
  }
  $("ex-list").innerHTML = rows.join("");
}
async function exToggle(path) {
  const k = exKey(path);
  if (ex.open[k]) { delete ex.open[k]; exRender(); return; }
  ex.open[k] = true;
  if (!ex.kids[k]) {
    exRender();
    try { ex.kids[k] = await exChildren(path); } catch (e) { toast(errText(e)); delete ex.open[k]; }
  }
  exRender();
}
function exLoad() {
  if (!S.state.connected) { $("ex-list").innerHTML = '<p class="muted small-p">Start the bridge and open Studio to see your game.</p>'; return; }
  ex.kids = {}; ex.loaded = true;
  const open = Object.keys(ex.open);
  ex.open = {};
  exRender();
  // Reopen what was open before a refresh, top-down.
  (async () => { for (const k of open.sort((a, b) => a.length - b.length)) { const p = k.split("/").map((x, i) => (i ? Number(x) : x)); if (!ex.open[exKey(p)]) await exToggle(p); } })();
}

async function exSelect(path) {
  ex.sel = exKey(path);
  exRender();
  const box = $("ex-detail");
  box.innerHTML = '<span class="spin"></span>';
  let d;
  try {
    d = await exLuau(EX_RESOLVE + `local node = resolve(${exPath(path)})
if not node then return HS:JSONEncode({ gone = true }) end
local d = { name = node.Name, class = node.ClassName, full = node:GetFullName(), props = {}, attrs = {}, kids = #node:GetChildren() }
for _, p in { "Anchored", "CanCollide", "Transparency", "Material", "Color", "Size", "Position", "Text", "Value", "Enabled", "Visible", "Disabled", "SoundId", "Brightness", "Range" } do
	local ok, v = pcall(function() return node[p] end)
	if ok and v ~= nil and typeof(v) ~= "Instance" then d.props[p] = tostring(v) end
end
for k, v in node:GetAttributes() do d.attrs[k] = tostring(v) end
d.tags = game:GetService("CollectionService"):GetTags(node)
if node:IsA("LuaSourceContainer") then d.source = node.Source end
return HS:JSONEncode(d)`);
  } catch (e) { box.innerHTML = `<p class="muted">${esc(errText(e))}</p>`; return; }
  if (d.gone) { box.innerHTML = '<p class="muted">It moved or was deleted. Press Refresh.</p>'; return; }
  // true/false, numbers and text can be edited in place (click the value).
  const editable = (k, v) => v === "true" || v === "false" || (/^-?\d+(\.\d+)?$/.test(v) && k !== "Size") || k === "Text" || k === "SoundId";
  const props = Object.entries(d.props).map(([k, v]) => `<span>${esc(k)}</span><b${editable(k, v) ? ` class="ex-ed" data-prop="${esc(k)}" data-val="${esc(v)}" title="Click to change"` : ""}>${esc(v.replace(/^Enum\.\w+\./, ""))}</b>`).join("")
    + Object.entries(d.attrs).map(([k, v]) => `<span>@${esc(k)}</span><b>${esc(v)}</b>`).join("");
  const isScript = d.source != null;
  box.innerHTML = `
    <div class="lib-head"><span class="ki ex-ic c-${EX_CLASS_ICON[d.class] || "other"}">${exIcon(d.class)}</span><div><b>${esc(d.name)}</b><span>${esc(d.class)} · ${esc(d.full)}</span></div></div>
    <div class="row">
      <button class="btn sm" data-x="select">Select in Studio</button>
      <button class="btn sm" data-x="ask">Ask the AI about it</button>
      ${isScript ? '<button class="btn sm" data-x="explain">Explain</button><button class="btn sm" data-x="bugs">Find bugs</button>' : ""}
      <span class="grow"></span>
      ${d.class !== "Script" && d.class !== "LocalScript" && d.class !== "ModuleScript" ? `<select class="input sm ex-new" title="Add something inside it"><option value="">New…</option><option>Script</option><option>LocalScript</option><option>ModuleScript</option><option>Folder</option><option>Part</option><option>Model</option><option>RemoteEvent</option></select>` : ""}
      <button class="btn sm ghost" data-x="dupe">Duplicate</button>
      <button class="btn sm ghost" data-x="rename">Rename</button>
      <button class="btn sm ghost" data-x="delete">Delete</button>
    </div>
    ${props ? `<div class="ex-props">${props}</div>` : ""}
    ${d.tags && d.tags.length ? `<div class="chips">${d.tags.map((t) => `<button class="on">${esc(t)}</button>`).join("")}</div>` : ""}
    ${isScript ? `<div class="ex-src"><div class="code-h"><span>${esc(d.class)} · ${d.source.split("\n").length} lines</span><button class="cb" data-x="edit">${ICONS.edit}Edit</button><button class="cb" data-x="copy">${ICONS.copy}Copy</button></div>
      <pre class="ex-pre"><code>${d.source.length > 150000 ? esc(d.source) : hl(d.source, "lua")}</code></pre>
      <textarea class="ex-edit" spellcheck="false" hidden></textarea>
      <div class="row ex-save" hidden><button class="btn sm primary" data-x="save">Save to Studio</button><button class="btn sm" data-x="cancel">Cancel</button><span class="muted small-p" style="margin:0">Ctrl+S saves · Ctrl+Z in Studio undoes</span></div></div>` : ""}`;
  box.dataset.path = JSON.stringify(path);
  box._d = d;
}

async function exAction(x) {
  const box = $("ex-detail"), d = box._d, path = JSON.parse(box.dataset.path || "[]");
  if (!d) return;
  const loc = `${d.full} (a ${d.class})`;
  if (x === "ask") { go("chat"); input.value = `About ${loc}: `; grow(); input.focus(); }
  else if (x === "explain") runBrief({ name: "Explain " + d.name, brief: `Explain what ${loc} does, how it connects to the rest of the game, and anything fragile about it. Don't change anything.` });
  else if (x === "bugs") runBrief({ name: "Find bugs in " + d.name, brief: `Review ${loc} for real bugs (nil access, race conditions, leaks, client/server mistakes). Fix the clear ones with surgical edits and list anything you're unsure about.` });
  else if (x === "copy") { try { await navigator.clipboard.writeText(d.source); toast("Copied."); } catch { toast("Couldn't copy."); } }
  else if (x === "select") { try { await exLuau(EX_RESOLVE + `local n = resolve(${exPath(path)}) if n then game:GetService("Selection"):Set({ n }) end return "[]"`); toast("Selected in Studio."); } catch (e) { toast(errText(e)); } }
  else if (x === "edit" || x === "cancel") {
    const editing = x === "edit";
    box.querySelector(".ex-pre").hidden = editing;
    box.querySelector(".ex-edit").hidden = !editing;
    box.querySelector(".ex-save").hidden = !editing;
    if (editing) { const t = box.querySelector(".ex-edit"); t.value = d.source; t.focus(); }
  } else if (x === "save") {
    const src = box.querySelector(".ex-edit").value;
    if (src.includes("]==]")) { toast("That script contains ]==] - edit it in Studio instead."); return; }
    try {
      await exLuau(EX_RESOLVE + `local n = resolve(${exPath(path)})
if not n then error("it moved or was deleted - press Refresh") end
local CH = game:GetService("ChangeHistoryService")
CH:SetWaypoint("Before VoidScript edit")
local src = [==[${src}]==]
local ok = pcall(function() game:GetService("ScriptEditorService"):UpdateSourceAsync(n, function() return src end) end)
if not ok then n.Source = src end
CH:SetWaypoint("VoidScript edit")
return "[]"`);
      toast("Saved to Studio."); sfx("done");
      exSelect(path);
    } catch (e) { toast(errText(e), 5000); }
  } else if (x === "dupe") {
    try {
      const r = await exLuau(EX_RESOLVE + `local n = resolve(${exPath(path)})
if not n then error("it moved or was deleted - press Refresh") end
local CH = game:GetService("ChangeHistoryService")
CH:SetWaypoint("Before duplicate")
local c = n:Clone()
if not c then error("this can't be copied") end
c.Parent = n.Parent
CH:SetWaypoint("Duplicated")
return HS:JSONEncode({ i = table.find(n.Parent:GetChildren(), c) })`);
      const parent = path.slice(0, -1);
      if (parent.length) { delete ex.kids[exKey(parent)]; delete ex.open[exKey(parent)]; await exToggle(parent); }
      if (r && r.i) exSelect(parent.concat(r.i));
      toast("Duplicated.");
    } catch (err) { toast(errText(err)); }
  } else if (x === "rename") {
    const t = box.querySelector(".lib-head b");
    t.innerHTML = `<input class="input" value="${esc(d.name)}" maxlength="100" style="padding:3px 8px" />`;
    const inp = t.querySelector("input");
    inp.focus(); inp.select();
    inp.onkeydown = async (e) => {
      if (e.key === "Escape") { exSelect(path); return; }
      if (e.key !== "Enter" || !inp.value.trim()) return;
      try {
        await exLuau(EX_RESOLVE + `local n = resolve(${exPath(path)}) if n then n.Name = HS:JSONDecode([==[${JSON.stringify(inp.value.trim())}]==]) end return "[]"`);
        delete ex.kids[exKey(path.slice(0, -1))];
        const parent = path.slice(0, -1);
        if (parent.length) { delete ex.open[exKey(parent)]; await exToggle(parent); }
        exSelect(path);
      } catch (err) { toast(errText(err)); }
    };
  } else if (x === "delete") {
    if (!(await approve("delete", "Delete", `Delete ${d.name}?`, `${d.full}${d.kids ? `\nand the ${d.kids} thing${d.kids === 1 ? "" : "s"} inside it` : ""}\n\nCtrl+Z in Studio brings it back.`, { once: true }))) return;
    try {
      await exLuau(EX_RESOLVE + `local n = resolve(${exPath(path)}) local CH = game:GetService("ChangeHistoryService") CH:SetWaypoint("Before delete") if n then n:Destroy() end CH:SetWaypoint("Deleted") return "[]"`);
      toast("Deleted. Ctrl+Z in Studio undoes it.");
      const parent = path.slice(0, -1);
      ex.sel = null;
      $("ex-detail").innerHTML = '<div class="lib-empty muted">Pick something on the left.</div>';
      if (parent.length) { delete ex.kids[exKey(parent)]; delete ex.open[exKey(parent)]; await exToggle(parent); }
    } catch (e) { toast(errText(e)); }
  }
}

async function exSearch(q) {
  if (!q) { exRender(); return; }
  $("ex-list").innerHTML = '<span class="spin"></span>';
  try {
    const list = await exLuau(EX_RESOLVE + `local q = string.lower(HS:JSONDecode([==[${JSON.stringify(q)}]==]))
local out = {}
local function ipath(x)
	local p = {}
	while x.Parent and x.Parent ~= game do
		table.insert(p, 1, table.find(x.Parent:GetChildren(), x))
		x = x.Parent
	end
	table.insert(p, 1, x.ClassName)
	return p
end
for _, svc in { ${EX_ROOTS.map((r) => `"${r}"`).join(", ")} } do
	local ok, s = pcall(game.GetService, game, svc)
	if ok then
		for _, d in s:GetDescendants() do
			if string.find(string.lower(d.Name), q, 1, true) then
				out[#out + 1] = { n = d.Name, c = d.ClassName, f = d:GetFullName(), p = ipath(d) }
				if #out >= 120 then return HS:JSONEncode(out) end
			end
		end
	end
end
return HS:JSONEncode(out)`);
    $("ex-list").innerHTML = list.length ? list.map((r) => `<button class="ex-row" data-p="${esc(JSON.stringify(r.p))}" data-leaf="1" style="padding-left:8px">
      <span class="ex-ic c-${EX_CLASS_ICON[r.c] || "other"}">${exIcon(r.c)}</span><span class="ex-n">${esc(r.n)}</span><span class="ex-c">${esc(r.f.split(".").slice(0, -1).join("."))}</span></button>`).join("")
      : '<p class="muted small-p">Nothing called that.</p>';
  } catch (e) { $("ex-list").innerHTML = `<p class="muted small-p">${esc(errText(e))}</p>`; }
}

$("ex-list").addEventListener("click", (e) => {
  const row = e.target.closest(".ex-row");
  if (!row) return;
  const path = JSON.parse(row.dataset.p);
  if (e.target.closest(".ex-tw") && !row.dataset.leaf) exToggle(path);
  else { exSelect(path); if (!row.dataset.leaf && !ex.open[exKey(path)] && path.length === 1) exToggle(path); }
});
$("ex-list").addEventListener("dblclick", (e) => { const row = e.target.closest(".ex-row"); if (row && !row.dataset.leaf) exToggle(JSON.parse(row.dataset.p)); });
$("ex-detail").addEventListener("click", (e) => { const b = e.target.closest("[data-x]"); if (b) exAction(b.dataset.x); });
$("ex-detail").addEventListener("keydown", (e) => {
  if (e.target.classList.contains("ex-edit")) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); exAction("save"); }
    else if (e.key === "Tab") { e.preventDefault(); document.execCommand("insertText", false, "\t"); }
  }
});
$("btn-ex-refresh").onclick = () => { $("ex-q").value = ""; exLoad(); if (ex.sel) exSelect(ex.sel.split("/").map((x, i) => (i ? Number(x) : x))); };
$("ex-q").addEventListener("keydown", (e) => { if (e.key === "Enter") exSearch($("ex-q").value.trim()); if (e.key === "Escape") { $("ex-q").value = ""; exRender(); } });
$("ex-q").addEventListener("input", () => { if (!$("ex-q").value) exRender(); });
const exBaseGo = go;
go = function (view) { exBaseGo(view); if (view === "explorer" && !ex.loaded) exLoad(); };
NAV_ORDER.splice(5, 0, "explorer");
PAGES.splice(5, 0, ["explorer", "Explorer"]);
// Load the tree as soon as Studio is there, if you're already on this page.
setInterval(() => { if (!ex.loaded && S.state.connected && $("view-explorer").classList.contains("active")) exLoad(); }, 2000);

// "New…" adds a child, opens the parent and selects the new thing.
$("ex-detail").addEventListener("change", async (e) => {
  if (!e.target.classList.contains("ex-new") || !e.target.value) return;
  const cls = e.target.value, path = JSON.parse($("ex-detail").dataset.path || "[]");
  e.target.value = "";
  try {
    const r = await exLuau(EX_RESOLVE + `local n = resolve(${exPath(path)})
if not n then error("it moved or was deleted - press Refresh") end
local CH = game:GetService("ChangeHistoryService")
CH:SetWaypoint("Before new")
local x = Instance.new("${cls}")
x.Name = "${cls === "Part" ? "Part" : "New" + cls}"
${cls === "Part" ? "x.Anchored = true x.Size = Vector3.new(4, 1, 4) x.Position = (workspace.CurrentCamera and workspace.CurrentCamera.CFrame.Position or Vector3.zero) + Vector3.new(0, -2, -12)" : ""}
${/Script/.test(cls) ? `x.Source = ${cls === "ModuleScript" ? '"local M = {}\\n\\nreturn M\\n"' : '"\\n"'}` : ""}
x.Parent = n
CH:SetWaypoint("Added ${cls}")
return HS:JSONEncode({ i = table.find(n:GetChildren(), x) })`);
    delete ex.kids[exKey(path)]; delete ex.open[exKey(path)];
    await exToggle(path);
    if (r && r.i) exSelect(path.concat(r.i));
    toast(`Added a ${cls}.`);
  } catch (err) { toast(errText(err)); }
});

// Edit a property: true/false flips, numbers and text get a little box.
async function exSetProp(prop, raw) {
  const path = JSON.parse($("ex-detail").dataset.path || "[]");
  const val = raw === "true" || raw === "false" ? raw : /^-?\d+(\.\d+)?$/.test(raw) ? raw : `HS:JSONDecode([==[${JSON.stringify(raw)}]==])`;
  try {
    await exLuau(EX_RESOLVE + `local n = resolve(${exPath(path)})
if not n then error("it moved or was deleted - press Refresh") end
local CH = game:GetService("ChangeHistoryService")
CH:SetWaypoint("Before edit")
n[${JSON.stringify(prop)}] = ${val}
CH:SetWaypoint("Changed ${prop.replace(/[^\w]/g, "")}")
return "[]"`);
    exSelect(path);
  } catch (e) { toast(errText(e), 5000); }
}
$("ex-detail").addEventListener("click", (e) => {
  const b = e.target.closest(".ex-ed");
  if (!b || b.querySelector("input")) return;
  const prop = b.dataset.prop, v = b.dataset.val;
  if (v === "true" || v === "false") { exSetProp(prop, v === "true" ? "false" : "true"); return; }
  b.innerHTML = `<input class="input" value="${esc(v)}" style="padding:2px 6px;width:100%" />`;
  const inp = b.querySelector("input");
  inp.focus(); inp.select();
  inp.onkeydown = (ev) => {
    if (ev.key === "Escape") { b.textContent = v; return; }
    if (ev.key !== "Enter") return;
    const nv = inp.value;
    if (/^-?\d+(\.\d+)?$/.test(v) && !/^-?\d+(\.\d+)?$/.test(nv.trim())) { toast("That needs to be a number."); return; }
    exSetProp(prop, /^-?\d+(\.\d+)?$/.test(v) ? nv.trim() : nv);
  };
  inp.onblur = () => { if (b.contains(inp)) b.textContent = v; };
});
