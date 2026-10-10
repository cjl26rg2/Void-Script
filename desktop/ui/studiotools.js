// SPDX-License-Identifier: GPL-3.0-or-later
// studiotools.js - the Selection and UI Check pages. Both work on what is
// already in the user's place: they read it from Studio, show it, and change it
// with small Luau scripts that each set an undo waypoint (Ctrl+Z in Studio).
"use strict";

// Runs Luau in Studio and returns its text, or throws with Studio's message.
async function stLuau(code, timeoutMs) {
  if (!S.state.connected) throw new Error("Start the bridge and open Roblox Studio first.");
  const r = await invoke("bridge_request", { payload: { type: "call_tool", name: "execute_luau", arguments: { code, datamodel_type: "Edit" } }, timeoutMs: timeoutMs || 30000 });
  if (!r || r.type !== "tool_result" || !r.ok) throw new Error((r && (r.error || r.text)) || "Studio didn't answer.");
  const t = String(r.text || "").trim();
  if (t.startsWith("ERR:")) throw new Error(t.slice(4));
  return t;
}
const stJSON = (t) => JSON.parse(t.slice(t.indexOf("{")));
const luaStr = (s) => JSON.stringify(String(s));
// Wraps an edit so it is one step in Studio's undo history.
const stUndoable = (label, body) => `local CH = game:GetService("ChangeHistoryService")
CH:SetWaypoint(${luaStr("Before " + label)})
local sel = game:GetService("Selection"):Get()
local parts = {}
for _, o in sel do
	if o:IsA("BasePart") then table.insert(parts, o) end
	for _, d in o:GetDescendants() do if d:IsA("BasePart") then table.insert(parts, d) end end
end
-- the edit runs in its own function, so its "return" doesn't end the script
-- before the closing waypoint
local function edit()
${body}
end
local result = edit()
CH:SetWaypoint(${luaStr(label)})
return result`;

// ════════════════════════════════════════════════════════════════════════════
//  Selection
// ════════════════════════════════════════════════════════════════════════════
const SEL_READ = `
local sel = game:GetService("Selection"):Get()
local out = { count = #sel, items = {}, parts = 0, anchored = 0, collide = 0, meshes = 0, scripts = 0, guis = 0, other = 0, materials = {} }
local lo, hi, seen = nil, nil, 0
for i, o in sel do
	if i <= 6 then table.insert(out.items, { name = o.Name, class = o.ClassName, path = o:GetFullName() }) end
	local list = o:GetDescendants()
	table.insert(list, o)
	for _, d in list do
		seen += 1
		if seen > 20000 then break end
		if d:IsA("BasePart") then
			out.parts += 1
			if d.Anchored then out.anchored += 1 end
			if d.CanCollide then out.collide += 1 end
			if d:IsA("MeshPart") or d:IsA("UnionOperation") then out.meshes += 1 end
			out.materials[d.Material.Name] = (out.materials[d.Material.Name] or 0) + 1
			local h = d.Size / 2
			lo = lo and lo:Min(d.Position - h) or d.Position - h
			hi = hi and hi:Max(d.Position + h) or d.Position + h
		elseif d:IsA("LuaSourceContainer") then out.scripts += 1
		elseif d:IsA("GuiObject") then out.guis += 1
		end
	end
end
out.capped = seen > 20000
if #sel == 2 and sel[1]:IsA("PVInstance") and sel[2]:IsA("PVInstance") then
	out.dist = math.floor((sel[1]:GetPivot().Position - sel[2]:GetPivot().Position).Magnitude * 100 + 0.5) / 100
end
if lo then local s = hi - lo out.size = { math.floor(s.X * 10 + .5) / 10, math.floor(s.Y * 10 + .5) / 10, math.floor(s.Z * 10 + .5) / 10 } end
return game:GetService("HttpService"):JSONEncode(out)`;

// One-click fixes. Each one acts on the parts in the selection (and inside it).
const SEL_ACTIONS = {
  anchor: ["Anchor all", "Anchored", `for _, p in parts do p.Anchored = true end return "Anchored " .. #parts .. " parts"`],
  unanchor: ["Unanchor all", "Unanchored", `for _, p in parts do p.Anchored = false end return "Unanchored " .. #parts .. " parts"`],
  nocollide: ["Collisions off", "Collisions off", `for _, p in parts do p.CanCollide = false end return "Turned collisions off on " .. #parts .. " parts"`],
  collide: ["Collisions on", "Collisions on", `for _, p in parts do p.CanCollide = true end return "Turned collisions on for " .. #parts .. " parts"`],
  weld: ["Weld together", "Welded", `if #parts < 2 then return "ERR:Select at least two parts to weld." end
local root = parts[1]
for _, p in parts do if p.Size.Magnitude > root.Size.Magnitude then root = p end end
local made = 0
for _, p in parts do
	if p ~= root then
		local has = false
		for _, w in p:GetChildren() do if w:IsA("WeldConstraint") and (w.Part0 == root or w.Part1 == root) then has = true end end
		if not has then local w = Instance.new("WeldConstraint") w.Part0 = root w.Part1 = p w.Parent = p made += 1 end
	end
end
return "Welded " .. made .. " parts to " .. root.Name .. " (the biggest part)"`],
  group: ["Group into a Model", "Grouped", `if #sel == 0 then return "ERR:Select something first." end
local m = Instance.new("Model")
m.Name = "Group"
m.Parent = sel[1].Parent
for _, o in sel do if o ~= m and not o:IsA("Terrain") and o.Parent ~= nil then o.Parent = m end end
game:GetService("Selection"):Set({ m })
return "Grouped " .. #sel .. " things into a Model"`],
  pivot: ["Pivot to bottom", "Pivot moved", `local n = 0
for _, o in sel do
	if o:IsA("Model") then local cf, size = o:GetBoundingBox() o.WorldPivot = cf * CFrame.new(0, -size.Y / 2, 0) n += 1 end
end
if n == 0 then return "ERR:Select one or more Models - parts have no separate pivot." end
return "Moved the pivot of " .. n .. " model(s) to the bottom centre"`],
  ground: ["Drop to the ground", "Dropped", `local moved = 0
local params = RaycastParams.new()
params.FilterType = Enum.RaycastFilterType.Exclude
params.FilterDescendantsInstances = sel
for _, o in sel do
	if o:IsA("PVInstance") then
		local cf, size
		if o:IsA("Model") then cf, size = o:GetBoundingBox() elseif o:IsA("BasePart") then cf, size = o.CFrame, o.Size end
		if cf then
			local bottom = cf.Position - Vector3.new(0, size.Y / 2, 0)
			local hit = workspace:Raycast(bottom + Vector3.new(0, 0.05, 0), Vector3.new(0, -2000, 0), params)
			if hit then o:PivotTo(o:GetPivot() + Vector3.new(0, hit.Position.Y - bottom.Y, 0)) moved += 1 end
		end
	end
end
if moved == 0 then return "ERR:Nothing below the selection to land on." end
return "Dropped " .. moved .. " thing(s) onto what's below them"`],
  snap: ["Snap to grid", "Snapped", `local function r(v) return math.round(v * 2) / 2 end
for _, p in parts do
	local c = p.CFrame
	p.CFrame = CFrame.new(r(c.X), r(c.Y), r(c.Z)) * c.Rotation
end
return "Snapped " .. #parts .. " parts to the half-stud grid"`],
  empties: ["Remove empty folders", "Cleaned", `local gone = 0
for _, o in sel do
	local list = o:GetDescendants()
	table.insert(list, o)
	for i = #list, 1, -1 do
		local d = list[i]
		if (d:IsA("Folder") or d:IsA("Model")) and #d:GetChildren() == 0 and d.Parent then d.Parent = nil gone += 1 end
	end
end
return gone == 0 and "Nothing empty in there" or "Removed " .. gone .. " empty folders and models"`],
  smooth: ["Smooth surfaces", "Smoothed", `for _, p in parts do p.TopSurface = Enum.SurfaceType.Smooth p.BottomSurface = Enum.SurfaceType.Smooth end return "Smoothed " .. #parts .. " parts"`],
};

const sel = { info: null, busy: false, code: "" };
function selRender() {
  const i = sel.info, has = !!(i && i.count);
  $("sel-empty").hidden = has;
  $("sel-body").hidden = !has;
  document.querySelectorAll("#sel-acts button, #btn-sel-mat, #btn-sel-color, #btn-sel-rename, #btn-sel-tag, #btn-sel-ai").forEach((b) => { b.disabled = !has || sel.busy; });
  $("btn-sel-read").disabled = sel.busy;
  if (!has) return;
  const name = i.count === 1 ? `${esc(i.items[0].name)} <span class="muted">${esc(i.items[0].class)}</span>` : `${i.count} things selected`;
  $("sel-name").innerHTML = name;
  $("sel-path").textContent = i.count === 1 ? i.items[0].path : i.items.map((x) => x.name).join(", ") + (i.count > i.items.length ? "…" : "");
  const pct = (n) => (i.parts ? Math.round((n / i.parts) * 100) : 0);
  const mats = Object.entries(i.materials || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, n]) => `${m} ${n}`).join(" · ");
  const facts = [
    ["Parts", i.parts + (i.capped ? "+" : "")],
    ["Size", i.size ? i.size.join(" × ") + " studs" : "-"],
    ["Anchored", i.parts ? `${pct(i.anchored)}%` : "-"],
    ["Collisions", i.parts ? `${pct(i.collide)}%` : "-"],
    ["Meshes / unions", String(i.meshes)],
    ["Scripts", String(i.scripts)],
  ];
  if (i.dist != null) facts.splice(2, 0, ["Distance apart", i.dist + " studs"]);
  $("sel-facts").innerHTML = facts.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("");
  $("sel-mats").textContent = mats ? "Materials: " + mats : "";
  // Things worth a second look.
  const notes = [];
  if (i.parts && i.anchored < i.parts && i.anchored > 0) notes.push(`${i.parts - i.anchored} parts aren't anchored - they'll fall when you play.`);
  if (i.parts > 500) notes.push(`${i.parts} parts is a lot for one thing - it can lag on phones.`);
  if (i.capped) notes.push("Very big selection - only the first 20,000 things were counted.");
  $("sel-notes").innerHTML = notes.map((n) => `<li>${esc(n)}</li>`).join("");
}
async function selRead(quiet) {
  if (sel.busy) return;
  sel.busy = true; selRender();
  try { sel.info = stJSON(await stLuau(SEL_READ)); }
  catch (e) { sel.info = null; if (!quiet) toast(errText(e), 5000); }
  finally { sel.busy = false; selRender(); }
}
async function selRun(label, body, btn) {
  if (sel.busy) return;
  sel.busy = true; selRender();
  const was = btn && btn.textContent;
  if (btn) btn.textContent = "Working…";
  try {
    const out = await stLuau(stUndoable(label, body), 60000);
    toast(out + ". Ctrl+Z in Studio undoes it.", 4000); sfx("done");
  } catch (e) {
    toast(/timed out|timeout/i.test(errText(e)) ? "Studio didn't answer in time - check Studio before trying again, it may have done it." : errText(e), 6000);
    sfx("error");
  } finally {
    if (btn) btn.textContent = was;
    sel.busy = false;
    await selRead(true);
  }
}
$("sel-acts").innerHTML = Object.entries(SEL_ACTIONS).map(([k, [t]]) => `<button class="btn sm" data-a="${k}">${t}</button>`).join("");
$("sel-acts").addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const [, label, body] = SEL_ACTIONS[b.dataset.a];
  selRun(label, body, b);
});
$("btn-sel-read").onclick = () => selRead();
const ST_MATERIALS = ["SmoothPlastic", "Plastic", "Neon", "Glass", "ForceField",
  "Brick", "Cobblestone", "Concrete", "Pavement", "Asphalt", "Plaster", "CeramicTiles", "ClayRoofTiles", "RoofShingles",
  "Wood", "WoodPlanks", "Cardboard",
  "Metal", "CorrodedMetal", "DiamondPlate", "Foil",
  "Granite", "Marble", "Slate", "Basalt", "Limestone", "Sandstone", "Rock", "Pebble", "CrackedLava",
  "Grass", "LeafyGrass", "Ground", "Mud", "Sand", "Snow", "Ice", "Glacier", "Salt",
  "Fabric", "Carpet", "Leather", "Rubber"];
$("sel-mat").innerHTML = ST_MATERIALS.map((m) => `<option>${m}</option>`).join("");
$("btn-sel-mat").onclick = (e) => selRun("Material", `local ok, m = pcall(function() return Enum.Material[${luaStr($("sel-mat").value)}] end)
if not ok then return "ERR:This Studio doesn't have that material." end
for _, p in parts do p.Material = m end return "Set " .. #parts .. " parts to " .. m.Name`, e.currentTarget);
$("btn-sel-color").onclick = (e) => selRun("Colour", `for _, p in parts do p.Color = Color3.fromHex(${luaStr($("sel-color").value)}) end return "Coloured " .. #parts .. " parts"`, e.currentTarget);
$("btn-sel-tag").onclick = (e) => {
  const tag = $("sel-tag").value.trim();
  if (!tag) { toast("Type a tag first."); $("sel-tag").focus(); return; }
  selRun("Tag", `local CS = game:GetService("CollectionService")
for _, o in sel do CS:AddTag(o, ${luaStr(tag)}) end
return "Tagged " .. #sel .. " thing(s) " .. ${luaStr(tag)} .. " - find them with CollectionService:GetTagged"`, e.currentTarget);
};
$("btn-sel-rename").onclick = (e) => {
  const base = $("sel-rename").value.trim().replace(/[^\w -]/g, "");
  if (!base) { toast("Type a name first."); $("sel-rename").focus(); return; }
  selRun("Rename", `for i, o in sel do o.Name = ${luaStr(base)} .. (#sel > 1 and i or "") end return "Renamed " .. #sel .. " thing(s)"`, e.currentTarget);
};

// Change it with AI: the AI writes the Luau, you read it, then you run it.
const SEL_AI_SYS = "You write Roblox Studio Luau that edits ONLY the user's current selection. " +
  "These variables already exist: `sel` (the selected Instances) and `parts` (every BasePart in and under the selection). " +
  "Never touch anything outside them, never delete the selection unless asked, and never use wait() or loops that never end. " +
  "End with: return \"<one short sentence saying what you changed>\". Reply with ONLY the Luau code, no markdown fences.";
$("btn-sel-ai").onclick = async () => {
  const ask = $("sel-ask").value.trim();
  if (!ask) { toast("Say what to change first."); $("sel-ask").focus(); return; }
  if (chat.busy || gen.busy) { toast("Wait for the AI to finish first."); return; }
  if (!keySet()) { toast(`Add your ${PROV_NAME[prov()]} API key in Settings first.`, 3500); go("settings"); return; }
  const btn = $("btn-sel-ai");
  gen.busy = true; gen.onDelta = () => {}; chat.stop = false;
  btn.disabled = true; btn.textContent = "Writing…";
  try {
    const { res } = await callModel({ messages: [{ role: "system", content: SEL_AI_SYS },
      { role: "user", content: `What's selected: ${JSON.stringify(sel.info)}\n\nChange: ${ask}` }], temperature: 0.2, max_tokens: 2500 },
      { model: (await genModel()) || undefined, noThink: true, quiet: true });
    const m = res && res.choices && res.choices[0] && res.choices[0].message;
    sel.code = splitThinking(m || {}).content.trim().replace(/^```\w*\n?|```$/g, "").trim();
    if (!sel.code) throw new Error("The AI sent nothing back - try again.");
    $("sel-code").textContent = sel.code;
    $("sel-review").hidden = false;
  } catch (e) { if (!chat.stop) toast(errText(e), 5000); }
  finally { gen.busy = false; btn.textContent = "Write it"; selRender(); }
};
$("btn-sel-run").onclick = async (e) => {
  $("sel-review").hidden = true;
  await selRun("AI edit", sel.code, e.currentTarget);
};
$("btn-sel-cancel").onclick = () => { $("sel-review").hidden = true; sel.code = ""; };
$("sel-ask").addEventListener("keydown", (e) => { if (e.key === "Enter") $("btn-sel-ai").click(); });
selRender();

// ════════════════════════════════════════════════════════════════════════════
//  UI Check
// ════════════════════════════════════════════════════════════════════════════
// Reads a ScreenGui from Studio: the selected one (or the one holding the
// selected element), else the only ScreenGui in StarterGui.
const UC_READ = `
local sel = game:GetService("Selection"):Get()[1]
local gui = sel and (sel:IsA("LayerCollector") and sel or sel:FindFirstAncestorWhichIsA("LayerCollector"))
if not gui then
	local list = {}
	for _, g in game:GetService("StarterGui"):GetChildren() do if g:IsA("ScreenGui") then table.insert(list, g) end end
	if #list == 1 then gui = list[1]
	elseif #list == 0 then return "ERR:There's no ScreenGui in StarterGui yet."
	else return "ERR:Select the ScreenGui you want to check (or anything inside it) in Studio." end
end
local n = 0
local function ud(u) return { u.X.Scale, u.X.Offset, u.Y.Scale, u.Y.Offset } end
local function walk(o)
	local kids = {}
	local node = { name = o.Name, class = o.ClassName, path = o:GetFullName(), kids = kids }
	if o:IsA("GuiObject") then
		node.pos, node.size = ud(o.Position), ud(o.Size)
		node.anchor = { o.AnchorPoint.X, o.AnchorPoint.Y }
		node.visible = o.Visible
		node.bg = o.BackgroundColor3:ToHex()
		node.bgt = o.BackgroundTransparency
		node.z = o.ZIndex
		node.button = o:IsA("GuiButton")
		if node.button then node.sel = o.Selectable end
		if o:IsA("TextLabel") or o:IsA("TextButton") or o:IsA("TextBox") then
			node.text = string.sub(o.Text, 1, 60) node.len = utf8.len(o.Text) or #o.Text node.ts = o.TextSize node.scaled = o.TextScaled node.wrap = o.TextWrapped node.tc = o.TextColor3:ToHex()
		end
	end
	for _, c in o:GetChildren() do
		if c:IsA("UIAspectRatioConstraint") then node.ratio = c.AspectRatio
		elseif c:IsA("UIGridStyleLayout") then node.layout = c.ClassName
		elseif c:IsA("UICorner") then node.corner = c.CornerRadius.Offset + c.CornerRadius.Scale * 100
		elseif c:IsA("GuiObject") and n < 600 then n += 1 table.insert(kids, walk(c)) end
	end
	return node
end
return game:GetService("HttpService"):JSONEncode({ gui = walk(gui), inset = gui:IsA("ScreenGui") and not gui.IgnoreGuiInset, capped = n >= 600 })`;

// Screens to check against (landscape, in Roblox's own points).
const UC_DEVICES = { phone: { name: "Phone", w: 844, h: 390 }, tablet: { name: "Tablet", w: 1024, h: 768 }, pc: { name: "PC", w: 1920, h: 1080 } };
const uc = { data: null, device: "phone", issues: [], focus: null, busy: false };

// Where every element lands on a screen of w × h. Children of a list/grid layout
// are placed by the layout at runtime, so they are skipped for overlap checks.
function ucLayout(root, w, h, inset) {
  const out = [];
  const top = inset ? 58 : 0;
  function place(node, px, py, pw, ph, inLayout, hidden) {
    let x = px, y = py, ww = pw, hh = ph;
    if (node.size) {
      ww = node.size[0] * pw + node.size[1];
      hh = node.size[2] * ph + node.size[3];
      if (node.ratio > 0) { // UIAspectRatioConstraint: shrink to the ratio inside that box
        if (ww / hh > node.ratio) ww = hh * node.ratio; else hh = ww / node.ratio;
      }
      x = px + node.pos[0] * pw + node.pos[1] - node.anchor[0] * ww;
      y = py + node.pos[2] * ph + node.pos[3] - node.anchor[1] * hh;
      hidden = hidden || !node.visible;
      out.push({ node, x, y, w: ww, h: hh, inLayout, hidden });
    }
    for (const k of node.kids || []) place(k, x, y, ww, hh, !!node.layout, hidden);
  }
  place(root, 0, top, w, h - top, false, false);
  return out;
}
function ucCheck(data) {
  const issues = [];
  const add = (kind, el, dev, text) => {
    const same = issues.find((i) => i.kind === kind && i.path === el.node.path);
    if (same) { if (!same.devs.includes(dev)) same.devs.push(dev); return; }
    issues.push({ kind, path: el.node.path, name: el.node.name, devs: [dev], text });
  };
  for (const [id, d] of Object.entries(UC_DEVICES)) {
    const els = ucLayout(data.gui, d.w, d.h, data.inset).filter((e) => !e.hidden);
    const offs = [];
    for (const e of els) {
      // only the outermost thing that sticks out - its children go with it
      if ((e.x < -2 || e.y < -2 || e.x + e.w > d.w + 2 || e.y + e.h > d.h + 2) && !offs.some((p) => e.node.path.startsWith(p + "."))) {
        offs.push(e.node.path);
        add("off", e, id, "Goes off the edge of the screen");
      }
      if (e.node.ts && !e.node.scaled && id === "phone" && e.node.ts < 12) add("text", e, id, `Text size ${e.node.ts} is hard to read on phones`);
      if (e.node.button && id === "phone" && (e.w < 32 || e.h < 32)) add("tap", e, id, `Button is ${Math.round(e.w)}×${Math.round(e.h)} - too small to tap`);
      // Text that doesn't fit its box (rough: an average letter is about half the text size wide).
      if (e.node.ts && !e.node.scaled && e.node.len > 3) {
        const wide = e.node.len * e.node.ts * 0.5;
        const clip = e.node.wrap ? Math.ceil(wide / Math.max(e.w, 1)) * e.node.ts * 1.15 > e.h + 2 : wide > e.w + 2;
        if (clip) add("clip", e, id, "Text doesn't fit - it gets cut off");
      }
      if (e.node.button && e.node.sel === false && id === "pc") add("pad", e, id, "A controller can't select this button");
      // Roblox draws its menu, chat and leaderboard buttons in the top 58 points.
      // With IgnoreGuiInset on, anything clickable in those corners sits under them.
      if (!data.inset && e.node.button && e.y < 52 && (e.x < 180 || e.x + e.w > d.w - 120)) add("topbar", e, id, "Under Roblox's own top-bar buttons");
    }
    // Buttons on top of each other (same parent, not placed by a layout).
    const btns = els.filter((e) => e.node.button && !e.inLayout);
    for (let a = 0; a < btns.length; a++) for (let b = a + 1; b < btns.length; b++) {
      const A = btns[a], B = btns[b];
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (ox > 0 && oy > 0 && ox * oy > 0.25 * Math.min(A.w * A.h, B.w * B.h)) add("overlap", A, id, `Covers the button ${B.node.name}`);
    }
  }
  // Big boxes sized in pixels only: right on one screen, wrong on the others.
  (function walk(n, depth) {
    if (n.size && depth <= 2 && n.size[0] === 0 && n.size[2] === 0 && n.size[1] > 300 && !n.ratio)
      issues.push({ kind: "offset", path: n.path, name: n.name, devs: ["phone", "tablet", "pc"], text: `Sized in pixels (${n.size[1]}×${n.size[3]}) - huge on phones, small on big screens` });
    for (const k of n.kids || []) walk(k, depth + 1);
  })(data.gui, 0);
  return issues;
}
// Fixes, per kind of issue. They act on exactly the elements listed.
const UC_FIX = {
  off: ["Pull back on screen", `for _, o in list do
	local p = o.Parent
	if p and p:IsA("GuiBase2d") and p.AbsoluteSize.X > 0 then
		local P = p.AbsoluteSize
		local sx = math.min(o.Size.X.Scale + o.Size.X.Offset / P.X, 1)
		local sy = math.min(o.Size.Y.Scale + o.Size.Y.Offset / P.Y, 1)
		local px = o.Position.X.Scale + o.Position.X.Offset / P.X
		local py = o.Position.Y.Scale + o.Position.Y.Offset / P.Y
		local ax, ay = o.AnchorPoint.X, o.AnchorPoint.Y
		o.Size = UDim2.fromScale(sx, sy)
		o.Position = UDim2.fromScale(math.clamp(px, ax * sx, 1 - (1 - ax) * sx), math.clamp(py, ay * sy, 1 - (1 - ay) * sy))
	end
end`],
  text: ["Scale the text", `for _, o in list do
	if o:IsA("TextLabel") or o:IsA("TextButton") or o:IsA("TextBox") then
		local c = o:FindFirstChildWhichIsA("UITextSizeConstraint") or Instance.new("UITextSizeConstraint")
		c.MaxTextSize = math.max(o.TextSize * 2, 24) c.MinTextSize = 10 c.Parent = o
		o.TextScaled = true
	end
end`],
  tap: ["Make buttons bigger", `for _, o in list do
	local s = o.AbsoluteSize
	if s.X > 0 and s.Y > 0 then
		local k = math.max(1, 44 / math.min(s.X, s.Y))
		o.Size = UDim2.new(o.Size.X.Scale * k, o.Size.X.Offset * k, o.Size.Y.Scale * k, o.Size.Y.Offset * k)
	end
end`],
  offset: ["Switch to Scale", `for _, o in list do
	local p = o.Parent
	if p and p:IsA("GuiBase2d") and p.AbsoluteSize.X > 0 then
		local s = o.AbsoluteSize
		local r = Instance.new("UIAspectRatioConstraint")
		r.AspectRatio = s.X / math.max(s.Y, 1) r.Parent = o
		o.Size = UDim2.fromScale(s.X / p.AbsoluteSize.X, s.Y / p.AbsoluteSize.Y)
		o.Position = UDim2.fromScale(o.Position.X.Scale + o.Position.X.Offset / p.AbsoluteSize.X, o.Position.Y.Scale + o.Position.Y.Offset / p.AbsoluteSize.Y)
	end
end`],
  clip: ["Fit the text", `for _, o in list do
	if o:IsA("TextLabel") or o:IsA("TextButton") or o:IsA("TextBox") then
		local c = o:FindFirstChildWhichIsA("UITextSizeConstraint") or Instance.new("UITextSizeConstraint")
		c.MaxTextSize = math.max(o.TextSize, 14) c.MinTextSize = 8 c.Parent = o
		o.TextScaled = true
	end
end`],
  pad: ["Link for controllers", `local gui = list[1]:FindFirstAncestorWhichIsA("LayerCollector")
local buttons = {}
for _, d in gui:GetDescendants() do
	if d:IsA("GuiButton") and d.Visible then d.Selectable = true table.insert(buttons, d) end
end
-- each button's up/down/left/right neighbour is the closest one in that direction
local DIRS = { Up = Vector2.new(0, -1), Down = Vector2.new(0, 1), Left = Vector2.new(-1, 0), Right = Vector2.new(1, 0) }
for _, b in buttons do
	local c = b.AbsolutePosition + b.AbsoluteSize / 2
	for dir, v in DIRS do
		local best, score = nil, math.huge
		for _, o in buttons do
			if o ~= b then
				local d = (o.AbsolutePosition + o.AbsoluteSize / 2) - c
				local along = d.X * v.X + d.Y * v.Y
				local side = math.abs(d.X * v.Y - d.Y * v.X)
				if along > 4 and along + side * 2 < score then best, score = o, along + side * 2 end
			end
		end
		b["NextSelection" .. dir] = best
	end
end`],
  topbar: ["Move below the top bar", `for _, o in list do
	o.Position = o.Position + UDim2.fromOffset(0, 60)
end`],
  overlap: null, // needs a person to decide what goes where
};
const UC_TITLE = { clip: "Text cut off", pad: "Controller can't reach", topbar: "Behind Roblox's buttons", off: "Off the screen", text: "Text too small", tap: "Buttons too small to tap", offset: "Sized in pixels", overlap: "Buttons on top of each other" };
const UC_FIND = (paths) => `local list = {}
for _, path in ${"{" + paths.map(luaStr).join(", ") + "}"} do
	local o = game
	for seg in string.gmatch(path, "[^%.]+") do o = o and o:FindFirstChild(seg) end
	if o and o ~= game and o:IsA("GuiObject") then table.insert(list, o) end
end
if #list == 0 then return "ERR:Those elements moved or were renamed - press Check again." end`;

function ucDraw() {
  const stage = $("uc-stage"), d = UC_DEVICES[uc.device];
  if (!uc.data) { stage.innerHTML = ""; return; }
  const k = Math.min((stage.clientWidth - 24) / d.w, (stage.clientHeight - 24) / d.h, 1);
  const els = ucLayout(uc.data.gui, d.w, d.h, uc.data.inset);
  const bad = new Set(uc.issues.filter((i) => i.devs.includes(uc.device)).map((i) => i.path));
  stage.innerHTML = `<div class="uc-screen" style="width:${d.w * k}px;height:${d.h * k}px">${els.filter((e) => !e.hidden).map((e) => {
    const n = e.node, cls = [bad.has(n.path) ? "bad" : "", uc.focus === n.path ? "focus" : ""].join(" ");
    const bg = n.bgt < 1 ? `background:#${n.bg};opacity:${Math.max(0.15, 1 - n.bgt)};` : "";
    const txt = n.text ? `<span style="color:#${n.tc};font-size:${Math.max(6, (n.scaled ? Math.min(e.h * 0.6, 40) : n.ts) * k)}px">${esc(n.text)}</span>` : "";
    return `<div class="uc-el ${cls}" title="${esc(n.name)}" style="left:${e.x * k}px;top:${e.y * k}px;width:${Math.max(1, e.w * k)}px;height:${Math.max(1, e.h * k)}px;z-index:${n.z || 1};${n.corner ? `border-radius:${n.corner * k}px;` : ""}"><i style="${bg}${n.corner ? `border-radius:${n.corner * k}px;` : ""}"></i>${txt}</div>`;
  }).join("")}</div>`;
}
function ucRender() {
  const has = !!uc.data;
  $("uc-empty").hidden = has;
  $("uc-main").hidden = !has;
  $("btn-uc-read").disabled = uc.busy;
  $("uc-device").querySelectorAll("button").forEach((b) => {
    const n = uc.issues.filter((i) => i.devs.includes(b.dataset.v)).length;
    b.classList.toggle("on", b.dataset.v === uc.device);
    b.innerHTML = `${UC_DEVICES[b.dataset.v].name}${has ? ` <em class="${n ? "bad" : "ok"}">${n || "✓"}</em>` : ""}`;
  });
  if (!has) return;
  $("uc-name").textContent = uc.data.gui.name + (uc.data.capped ? " (first 600 elements)" : "");
  const groups = {};
  for (const i of uc.issues) (groups[i.kind] = groups[i.kind] || []).push(i);
  $("uc-issues").innerHTML = uc.issues.length ? Object.entries(groups).map(([kind, list]) => `
    <div class="uc-group">
      <div class="uc-gh"><b>${UC_TITLE[kind]}</b><span class="tag">${list.length}</span>
        ${UC_FIX[kind] ? `<button class="btn sm" data-fix="${kind}">${UC_FIX[kind][0]}</button>` : `<span class="muted small">Fix by hand</span>`}</div>
      ${list.map((i) => `<button class="uc-issue${uc.focus === i.path ? " on" : ""}" data-p="${esc(i.path)}"><span>${esc(i.name)}</span><em>${esc(i.text)} · ${i.devs.map((x) => UC_DEVICES[x].name).join(", ")}</em></button>`).join("")}
    </div>`).join("") : '<p class="uc-good">Looks good on phone, tablet and PC.</p>';
  ucDraw();
}
async function ucRead() {
  if (uc.busy) return;
  uc.busy = true; ucRender();
  try {
    uc.data = stJSON(await stLuau(UC_READ));
    uc.issues = ucCheck(uc.data);
    uc.focus = null;
  } catch (e) { toast(errText(e), 5000); }
  finally { uc.busy = false; ucRender(); }
}
$("btn-uc-read").onclick = ucRead;
$("uc-device").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) { uc.device = b.dataset.v; ucRender(); } });
$("uc-issues").addEventListener("click", async (e) => {
  const it = e.target.closest("[data-p]");
  if (it) { uc.focus = uc.focus === it.dataset.p ? null : it.dataset.p; ucRender(); return; }
  const fx = e.target.closest("[data-fix]");
  if (!fx || uc.busy) return;
  const paths = uc.issues.filter((i) => i.kind === fx.dataset.fix).map((i) => i.path);
  const [label, body] = UC_FIX[fx.dataset.fix];
  uc.busy = true; fx.disabled = true; fx.textContent = "Fixing…";
  try {
    await stLuau(stUndoable(label, `${UC_FIND(paths)}\n${body}\nreturn "ok"`), 60000);
    toast(`${label}: done on ${paths.length} element(s). Ctrl+Z in Studio undoes it.`, 4000); sfx("done");
  } catch (err) { toast(errText(err), 6000); sfx("error"); }
  finally { uc.busy = false; await ucRead(); }
});
window.addEventListener("resize", () => { if (uc.data) ucDraw(); });
ucRender();
