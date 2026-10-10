// SPDX-License-Identifier: GPL-3.0-or-later
// workshop4.js - Workshop: Performance, Organize, Swap materials & colours,
// Test run and Parts → Terrain; every Workshop tool in the Ctrl+K palette; and
// the one-time "What's new in VoidScript²" screen.
"use strict";

// ── Performance ─────────────────────────────────────────────────────────────
const PF_SCAN = `local HS = game:GetService("HttpService")
local s = { instances = 0, parts = 0, meshes = 0, unions = 0, unanchored = 0, lights = 0, shadowLights = 0, emitters = 0, rate = 0,
	sounds = 0, playing = 0, scripts = 0, guis = 0, humanoids = 0, constraints = 0, textures = 0, bigParts = 0 }
for _, d in workspace:GetDescendants() do
	s.instances += 1
	if d:IsA("BasePart") then
		s.parts += 1
		if d:IsA("MeshPart") then s.meshes += 1 elseif d:IsA("UnionOperation") then s.unions += 1 end
		if not d.Anchored then s.unanchored += 1 end
		if math.max(d.Size.X, d.Size.Y, d.Size.Z) > 2048 then s.bigParts += 1 end
	elseif d:IsA("Light") then
		s.lights += 1
		if d.Shadows and d.Enabled then s.shadowLights += 1 end
	elseif d:IsA("ParticleEmitter") then
		s.emitters += 1
		if d.Enabled then s.rate += d.Rate end
	elseif d:IsA("Sound") then
		s.sounds += 1
		if d.Playing or d.Looped then s.playing += 1 end
	elseif d:IsA("Humanoid") then s.humanoids += 1
	elseif d:IsA("Constraint") then s.constraints += 1
	elseif d:IsA("Decal") or d:IsA("Texture") then s.textures += 1
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
	if d:IsA("LuaSourceContainer") then s.scripts += 1 elseif d:IsA("GuiObject") then s.guis += 1 end
end
s.streaming = workspace.StreamingEnabled
return HS:JSONEncode(s)`;
// [what, value, ok up to, bad from, why it matters, what to do]
function pfRows(s) {
  return [
    ["Parts in Workspace", s.parts, 20000, 60000, "Every part costs memory and draw time, most of all on phones.", "Merge small details into meshes, delete hidden parts, or turn on StreamingEnabled."],
    ["Unanchored parts", s.unanchored, 1500, 6000, "Loose parts all run physics every frame.", "Anchor anything that doesn't need to move (Workshop › Physics check)."],
    ["Lights with shadows", s.shadowLights, 12, 40, "Shadow-casting lights are among the most expensive things to draw.", "Turn Shadows off on small or far-away lights."],
    ["Particles per second", Math.round(s.rate), 1500, 5000, "Lots of particles slow down weaker devices.", "Lower Rate, or turn emitters on only near the player."],
    ["Humanoids", s.humanoids, 60, 200, "Each Humanoid runs its own movement and state code.", "Use fewer NPCs at once, or plain models for crowds."],
    ["Looping or playing sounds", s.playing, 20, 60, "Many sounds at once cost CPU and are hard to hear anyway.", "Use sound zones (Workshop › Sound zones)."],
    ["Huge parts", s.bigParts, 3, 15, "Parts bigger than 2048 studs across can break lighting and collisions.", "Split them, or use terrain."],
    ["Unions", s.unions, 500, 2000, "Unions are slow to load and hard to change.", "Swap busy unions for MeshParts."],
    ["Scripts in the place", s.scripts, 300, 1200, "Lots of copied scripts are slow to start and hard to fix.", "Use one script with CollectionService tags instead of a copy in every part."],
  ];
}
const pf = { data: null };
WK_TOOLS.perf = {
  name: "Performance", group: "Check", desc: "Counts what slows a game down - parts, physics, shadows, particles, NPCs, sounds - and says which numbers are fine and which to fix.",
  html: () => {
    if (!pf.data) return '<div class="row"><button class="btn primary" data-act="scan">Check performance</button></div><p class="muted small-p">Reads the place; changes nothing.</p>';
    const s = pf.data;
    const rows = pfRows(s).map(([t, v, ok, bad, why, fix]) => {
      const lvl = v >= bad ? "bad" : v > ok ? "warn" : "ok";
      return `<div class="pf-row pf-${lvl}"><i></i><div><b>${t}</b><span class="muted">${esc(lvl === "ok" ? why : fix)}</span></div><em>${v.toLocaleString()}</em></div>`;
    }).join("");
    const stream = !s.streaming && s.parts > 10000 ? `<ul class="st-notes"><li>StreamingEnabled is off. With ${s.parts.toLocaleString()} parts, turning it on (Workspace properties) lets phones load only what's near the player.</li></ul>` : "";
    return `<div class="row"><button class="btn" data-act="scan">Check again</button><span class="muted">${s.instances.toLocaleString()} things in Workspace · ${s.meshes.toLocaleString()} meshes · ${s.textures.toLocaleString()} decals and textures · ${s.guis.toLocaleString()} GUI objects</span></div>${stream}<div class="pf-list">${rows}</div>`;
  },
  async act(a, btn) {
    btn.disabled = true; btn.textContent = "Checking…";
    try { pf.data = JSON.parse(await stLuau(PF_SCAN, 90000)); wkShow("perf"); } catch (e) { toast(errText(e), 5000); btn.disabled = false; btn.textContent = "Check performance"; }
  },
};

// ── Organize ────────────────────────────────────────────────────────────────
WK_TOOLS.organize = {
  name: "Organize", group: "Build", desc: "Tidy a messy folder or model: sort what's inside into folders by type or by name (Tree1, Tree2… go in Trees), and number things in order.",
  html: () => `
    ${fld("Sort by", seg("og-mode", [["name", "Name (Tree12 → Tree)"], ["class", "Type (Parts, Models, Lights…)"]], "name"))}
    ${fld("Only make a folder when there are at least", `<input class="input" id="og-min" type="number" min="2" max="50" value="3" />`, "things")}
    <div class="row"><button class="btn primary" data-act="sort">Sort the selected folder or model</button><button class="btn" data-act="number">Number what's inside in order</button></div>
    <p class="muted small-p">Scripts stay where they are, since moving them breaks script.Parent.</p>`,
  async act(a, btn) {
    const byName = segVal("og-mode") !== "class";
    await wkRun("Organize", `local box = sel[1]
if not box or #box:GetChildren() == 0 then return "ERR:Select the folder or model to tidy." end
${a === "number" ? `local base = {}
for _, c in box:GetChildren() do
	if not c:IsA("LuaSourceContainer") then
		local b = (string.gsub(c.Name, "[%s_%-]*%d+$", ""))
		base[b] = (base[b] or 0) + 1
		c.Name = b .. base[b]
	end
end
return "Numbered what's inside " .. box.Name` : `local MIN = ${Math.round(lnum(val("og-min"), 3, 2, 50))}
local groups, order = {}, {}
local function kind(c)
	${byName ? `local b = (string.gsub(c.Name, "[%s_%-]*%d+$", ""))
	if b == "" then b = c.ClassName end
	return string.sub(b, -1) == "s" and b or b .. "s"` : `if c:IsA("BasePart") then return "Parts" elseif c:IsA("Model") then return "Models" elseif c:IsA("Light") then return "Lights"
	elseif c:IsA("Sound") then return "Sounds" elseif c:IsA("GuiObject") then return "GUI" elseif c:IsA("ParticleEmitter") or c:IsA("Beam") or c:IsA("Trail") then return "Effects" end
	return c.ClassName .. "s"`}
end
for _, c in box:GetChildren() do
	if not c:IsA("LuaSourceContainer") and not c:IsA("Folder") then
		local k = kind(c)
		if not groups[k] then groups[k] = {} table.insert(order, k) end
		table.insert(groups[k], c)
	end
end
local made, moved = 0, 0
for _, k in order do
	local list = groups[k]
	if #list >= MIN then
		local f = box:FindFirstChild(k)
		if not (f and f:IsA("Folder")) then f = Instance.new("Folder") f.Name = k f.Parent = box made += 1 end
		for _, c in list do c.Parent = f moved += 1 end
	end
end
if moved == 0 then return "ERR:Nothing to sort - no group has " .. MIN .. " or more things." end
return "Moved " .. moved .. " things into " .. made .. " new folder(s)"`}`, btn);
  },
};

// ── Swap materials & colours ────────────────────────────────────────────────
WK_TOOLS.swap = {
  name: "Swap looks", group: "Build", desc: "Restyle a map in one go: change every part of one material to another, or every part of one colour to another.",
  html: () => `
    ${fld("Where", seg("sw-where", [["sel", "In the selection"], ["all", "Everywhere in Workspace"]], "sel"))}
    <div class="wk-grid">
      ${fld("Material", `<select class="input" id="sw-m0"><option value="">(any)</option>${ST_MATERIALS.map((m) => `<option>${m}</option>`).join("")}</select>`)}
      ${fld("becomes", `<select class="input" id="sw-m1"><option value="">(keep)</option>${ST_MATERIALS.map((m) => `<option>${m}</option>`).join("")}</select>`)}
      ${fld("Colour", `<span class="row"><input type="color" id="sw-c0" value="#a3a2a5" /><label class="chk"><input type="checkbox" id="sw-anyc" checked /> any</label></span>`)}
      ${fld("becomes", `<span class="row"><input type="color" id="sw-c1" value="#4b8a3c" /><label class="chk"><input type="checkbox" id="sw-keepc" checked /> keep</label></span>`)}
      ${fld("Colour match", `<input class="input" id="sw-tol" type="number" min="0" max="100" value="8" />`, "% close enough")}
    </div>
    <div class="row"><button class="btn primary" data-act="go">Swap</button></div>`,
  async act(a, btn) {
    const m0 = val("sw-m0"), m1 = val("sw-m1"), anyC = chk("sw-anyc"), keepC = chk("sw-keepc");
    if (!m1 && keepC) { toast("Pick a new material or a new colour."); return; }
    if (!m0 && anyC) { toast("Pick which material or colour to change, or everything gets changed."); return; }
    await wkRun("Swap looks", `local list = ${segVal("sw-where") === "all" ? "{}\nfor _, d in workspace:GetDescendants() do if d:IsA(\"BasePart\") and not d:IsA(\"Terrain\") then table.insert(list, d) end end" : "parts"}
local M0, M1 = ${m0 ? `Enum.Material[${lq(m0)}]` : "nil"}, ${m1 ? `Enum.Material[${lq(m1)}]` : "nil"}
local C0, C1, TOL = ${anyC ? "nil" : `Color3.fromHex(${lq(val("sw-c0").slice(1))})`}, ${keepC ? "nil" : `Color3.fromHex(${lq(val("sw-c1").slice(1))})`}, ${lnum(val("sw-tol"), 8, 0, 100) / 100}
local n = 0
for _, p in list do
	local okM = not M0 or p.Material == M0
	local okC = not C0 or (math.abs(p.Color.R - C0.R) + math.abs(p.Color.G - C0.G) + math.abs(p.Color.B - C0.B)) / 3 <= TOL
	if okM and okC then
		if M1 then p.Material = M1 end
		if C1 then p.Color = C1 end
		n += 1
	end
end
if n == 0 then return "ERR:No parts matched." end
return "Changed " .. n .. " parts"`, btn);
  },
};

// ── Test run: play for a few seconds and report new errors ──────────────────
const tr = { res: null };
WK_TOOLS.testrun = {
  name: "Test run", group: "Check", desc: "Press Play for a few seconds, then stop, and list every new error and warning from Studio's Output - with the script and line.",
  html: () => `<div class="row">${fld("Play for", `<input class="input sm" id="tr-secs" type="number" min="3" max="120" value="10" />`, "seconds")}<button class="btn primary" data-act="go">Run a test</button></div>
    <div id="tr-out">${tr.res ? trList() : '<p class="muted small-p">Studio plays the game, then stops by itself. Nothing in the place changes.</p>'}</div>`,
  async act(a, btn) {
    if (a === "ask") { go("chat"); input.value = "Fix these errors from a test run:\n" + tr.res.errors.join("\n"); grow(); input.focus(); return; }
    const secs = lnum(val("tr-secs"), 10, 3, 120);
    btn.disabled = true;
    try {
      const before = await callTool("get_console_output", {}, 20000).catch(() => "");
      btn.textContent = "Starting…";
      await callTool("start_stop_play", { is_start: true }, 60000);
      for (let i = secs; i > 0; i--) { btn.textContent = `Playing… ${i}s`; await sleep(1000); }
      const after = await callTool("get_console_output", {}, 20000).catch(() => "");
      btn.textContent = "Stopping…";
      await callTool("start_stop_play", { is_start: false }, 60000).catch(() => {});
      const fresh = before && after.startsWith(before) ? after.slice(before.length) : after.split("\n").slice(-200).join("\n");
      const lines = fresh.split("\n").map((l) => l.trim()).filter(Boolean);
      const isErr = (l) => /error|exception|attempt to|is not a valid member|stack begin|nil value|failed/i.test(l) || /^\s*[A-Za-z_][\w ]*(?:\.[\w ]+)+:\d+:/.test(l);
      const isWarn = (l) => /warn|infinite yield|deprecated/i.test(l);
      tr.res = { errors: [...new Set(lines.filter(isErr))].slice(0, 40), warns: [...new Set(lines.filter((l) => !isErr(l) && isWarn(l)))].slice(0, 30), secs, n: lines.length };
      wkShow("testrun");
    } catch (e) {
      toast(errText(e), 6000);
      callTool("start_stop_play", { is_start: false }, 20000).catch(() => {});
    } finally { btn.disabled = false; btn.textContent = "Run a test"; }
  },
};
function trList() {
  const r = tr.res, row = (l) => `<div class="fr-hit"><code>${esc(l.slice(0, 400))}</code></div>`;
  const ask = r.errors.length ? '<div class="row"><button class="btn sm" data-act="ask">Ask the AI to fix them</button></div>' : "";
  return `<div class="nav-sum"><div><b>${r.errors.length}</b><span>errors</span></div><div><b>${r.warns.length}</b><span>warnings</span></div><div><b>${r.secs}s</b><span>played</span></div></div>
    ${r.errors.length ? `<div class="co-cat co-invisible"><div class="uc-gh"><b>Errors</b></div>${r.errors.map(row).join("")}</div>` : '<p class="uc-good">No errors while it played.</p>'}
    ${r.warns.length ? `<div class="co-cat co-tiny"><div class="uc-gh"><b>Warnings</b></div>${r.warns.map(row).join("")}</div>` : ""}${ask}`;
}

// ── Parts → Terrain ─────────────────────────────────────────────────────────
const TERRAIN_MATS = ["Grass", "LeafyGrass", "Ground", "Mud", "Sand", "Sandstone", "Rock", "Slate", "Basalt", "Limestone", "Snow", "Ice", "Glacier", "Water", "Asphalt", "Concrete", "Pavement", "Cobblestone", "Brick", "WoodPlanks", "Salt", "CrackedLava"];
WK_TOOLS.terrain = {
  name: "Parts → Terrain", group: "Build", desc: "Turn rough blocks, balls, cylinders and wedges into smooth terrain - sketch hills and paths with parts, then convert them.",
  html: () => `
    <div class="wk-grid">
      ${fld("Terrain material", `<select class="input" id="pt-mat"><option value="">Match each part's material</option>${TERRAIN_MATS.map((m) => `<option>${m}</option>`).join("")}</select>`)}
      ${fld("Then", seg("pt-after", [["delete", "Delete the parts"], ["hide", "Hide them"], ["keep", "Keep them"]], "delete"))}
    </div>
    <div class="row"><button class="btn primary" data-act="go">Convert the selected parts</button><button class="btn ghost" data-act="carve">Carve them out of terrain instead</button></div>
    <p class="muted small-p">Carving fills the parts' shape with air - handy for caves, tunnels and rivers.</p>`,
  async act(a, btn) {
    const after = segVal("pt-after") || "delete", mat = val("pt-mat");
    await wkRun(a === "carve" ? "Carve terrain" : "Parts to terrain", `if #parts == 0 then return "ERR:Select the parts to turn into terrain." end
local T = workspace.Terrain
local fixed = ${mat ? `Enum.Material[${lq(mat)}]` : "nil"}
local MAP = { Plastic = "Ground", SmoothPlastic = "Ground", Wood = "WoodPlanks", Granite = "Rock", Marble = "Limestone", Fabric = "Grass", Metal = "Basalt", DiamondPlate = "Basalt", Glass = "Ice", Neon = "CrackedLava", Foil = "Salt" }
local n = 0
for _, p in parts do
	local m = ${a === "carve" ? "Enum.Material.Air" : `fixed or (function()
		local ok, tm = pcall(function() return Enum.Material[MAP[p.Material.Name] or p.Material.Name] end)
		if ok and tm and pcall(function() T:GetMaterialColor(tm) end) then return tm end
		return Enum.Material.Ground
	end)()`}
	if p:IsA("WedgePart") then T:FillWedge(p.CFrame, p.Size, m)
	elseif p:IsA("Part") and p.Shape == Enum.PartType.Ball then T:FillBall(p.Position, p.Size.X / 2, m)
	elseif p:IsA("Part") and p.Shape == Enum.PartType.Cylinder then T:FillCylinder(p.CFrame * CFrame.Angles(0, 0, math.rad(90)), p.Size.X, p.Size.Y / 2, m)
	else T:FillBlock(p.CFrame, p.Size, m) end
	n += 1
end
${after === "delete" ? "for _, p in parts do p.Parent = nil end" : after === "hide" ? "for _, p in parts do p.Transparency = 1 p.CanCollide = false p.CanQuery = false end" : ""}
return "${a === "carve" ? "Carved" : "Converted"} " .. n .. " parts"`, btn);
  },
};

// ── every Workshop tool in the Ctrl+K palette ──────────────────────────────
const wkBasePalette = paletteItems;
paletteItems = function () {
  const items = wkBasePalette();
  const icon = (document.querySelector('.nav-item[data-view="workshop"] svg') || {}).outerHTML || ICONS.go;
  for (const [id, t] of Object.entries(WK_TOOLS)) items.push({ g: "Workshop", t: t.name, d: t.desc.split(/[.:-]\s/)[0], i: icon, run: () => { go("workshop"); wkShow(id); } });
  return items;
};

// ── What's new in VoidScript² (once per version) ────────────────────────────
const WN_PAGES = [
  ["select", "Selection", "Select anything in Studio and fix it in one click - or let the AI change just that."],
  ["uicheck", "UI Check", "Your GUI on a phone, a tablet and a PC at once, with one-click fixes."],
  ["workshop", "Workshop", "Interactions, scatter, NPC routes, a GUI kit, snapshots and diffs, lint, physics and performance checks - and more."],
  ["explorer", "Scripts map & Remotes", "How your scripts connect, and which remotes nobody listens to."],
];
async function whatsNew() {
  let ver = "";
  try { ver = (await invoke("get_snapshot")).version; } catch { return; }
  if (!ver || lsGet("vs-whatsnew") === ver) return;
  if (!S.settings || !S.settings.accepted_disclaimer) { setTimeout(whatsNew, 4000); return; }
  lsSet("vs-whatsnew", ver);
  const box = document.createElement("div");
  box.className = "vwn";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "wn-t");
  box.innerHTML = `<div class="vwn-card">
    <p class="eyebrow">New in ${esc(ver)}</p>
    <h2 id="wn-t">Welcome to Void<span class="grad">Script</span><sup class="sq">2</sup></h2>
    <p class="muted">The biggest update yet. Here's where to start:</p>
    <div class="vwn-list">${WN_PAGES.map(([v, t, d]) => `<button class="vwn-item" data-v="${v}"><b>${t}</b><span>${d}</span></button>`).join("")}</div>
    <div class="row"><span class="grow"></span><button class="btn primary" data-v="">Let's go</button></div></div>`;
  const close = (v) => { box.remove(); document.removeEventListener("keydown", esc_); if (v) go(v); };
  const esc_ = (e) => { if (e.key === "Escape") close(""); };
  box.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) close(b.dataset.v); else if (e.target === box) close(""); });
  document.addEventListener("keydown", esc_);
  document.body.appendChild(box);
  box.querySelector(".btn.primary").focus();
}
setTimeout(whatsNew, 2500);

if (WK_TOOLS[lsGet("vs-wk-tool")]) wkShow(lsGet("vs-wk-tool")); else wkNav();
