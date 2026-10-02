// SPDX-License-Identifier: GPL-3.0-or-later
// toolkit.js - game templates, script tools and the place health check, shared by
// the desktop app and the extension.
"use strict";

const VSKit = (() => {
  // One-click game starters. Each is a build brief the agent follows in Studio.
  const TEMPLATES = [
    { id: "obby", name: "Obby", icon: "🧗", desc: "10 stages, checkpoints, kill bricks, a finish",
      brief: "Build a complete obby: 10 stages that get harder (jumps, moving platforms, spinning bars, disappearing tiles, kill bricks), a checkpoint at the start of each stage that saves the player's stage in leaderstats (Stage), respawning at your last checkpoint, a timer GUI, and a finish platform with a celebration effect. Make the stages look good with a consistent color theme." },
    { id: "tycoon", name: "Tycoon", icon: "🏭", desc: "droppers, conveyor, collector, buy buttons",
      brief: "Build a working tycoon for one player plot: a claim pad, droppers that spawn ore parts, a conveyor that carries them to a collector which adds Cash to leaderstats, and buy buttons (with prices shown on BillboardGuis) that unlock more droppers, upgrades and walls in order. Server-side purchase checks only." },
    { id: "sim", name: "Simulator", icon: "⚡", desc: "click to gain, sell area, upgrades, rebirths",
      brief: "Build a simulator loop: a tool you click to gain Strength (with a cooldown), a sell pad that converts Strength to Coins, an upgrade shop GUI that multiplies gains, and rebirths that reset Coins for a permanent multiplier. leaderstats for Coins and Rebirths. All currency changes happen on the server via RemoteEvents with validation." },
    { id: "rounds", name: "Round system", icon: "⏱️", desc: "lobby, intermission, map vote, winners",
      brief: "Build a round-based game loop: a lobby, a 20 second intermission with a status GUI, a vote between 3 maps stored in ServerStorage, teleporting players into the chosen map, a 2 minute round, awarding Wins to survivors in leaderstats, then cleaning up and returning everyone to the lobby." },
    { id: "shop", name: "Shop + saving", icon: "🛒", desc: "currency, shop GUI, DataStore saving",
      brief: "Build an item shop: Coins in leaderstats that save and load with DataStoreService (with pcall, retries and saving on leave and on shutdown), a shop GUI listing 4 tools from ServerStorage with prices, and a server-validated purchase RemoteEvent that gives the tool and remembers owned items across sessions." },
    { id: "lb", name: "Global leaderboard", icon: "🏆", desc: "top 10 board in the world",
      brief: "Build a global top-10 leaderboard: an OrderedDataStore for Wins, saving each player's Wins, and a physical board in the workspace with a SurfaceGui that lists the top 10 names and scores and refreshes every 60 seconds." },
    { id: "admin", name: "Admin commands", icon: "🛡️", desc: ":kick :tp :speed :fly for admins",
      brief: "Add admin commands for a list of admin UserIds in a ModuleScript: :kick, :tp (to player), :bring, :speed, :jump, :fly and :heal via chat messages (TextChatService). Validate everything on the server and ignore non-admins." },
    { id: "daynight", name: "Day / night", icon: "🌗", desc: "smooth cycle with lighting moods",
      brief: "Add a smooth day/night cycle (a full day every 10 minutes) with tweened Lighting moods for dawn, day, dusk and night (ambient, fog, sky colors), plus street lamps whose lights turn on at night." },
    { id: "sprint", name: "Sprint + stamina", icon: "🏃", desc: "Shift to sprint, stamina bar",
      brief: "Add sprinting: hold Shift (or a mobile button) to run faster, a stamina bar GUI that drains while sprinting and refills when not, and a slight camera FOV change while sprinting. Client-side with sensible values." },
    { id: "pets", name: "Pets", icon: "🐾", desc: "pets that follow you, egg hatch",
      brief: "Add pets: an egg you can buy that hatches a random pet with rarities, pets that smoothly follow the player, equipping up to 3 pets, and pets giving a coin multiplier. Save owned pets with DataStoreService." },
    { id: "doublejump", name: "Double jump", icon: "🦘", desc: "second jump in mid-air",
      brief: "Add a double jump: pressing jump again in mid-air does a second jump with a small particle burst, and it resets when the player lands. Works on PC and mobile." },
    { id: "music", name: "Music + SFX", icon: "🎵", desc: "background music player, UI sounds",
      brief: "Add background music: a playlist of free Roblox audio that loops with a mute toggle button in the corner, plus click and hover sounds for every TextButton in StarterGui." },
  ];

  // Quick jobs on the current game.
  const TOOLS = [
    { id: "fix", name: "Fix errors in Output", icon: "🩹", desc: "reads Studio's console and fixes the causes",
      brief: "Read the Studio console with get_console_output. For every error or warning that comes from this game's scripts, find the cause (script_read the script) and fix it with a surgical edit. Then tell me in a few lines what was wrong and what you changed. If there are no errors, say so." },
    { id: "bugs", name: "Find bugs", icon: "🐞", desc: "reviews every script for real bugs",
      brief: "Review every Script, LocalScript and ModuleScript in this game (use script_search / script_read). Look for real bugs: nil access, wrong service, missing WaitForChild timeouts, race conditions on PlayerAdded, memory leaks from connections never disconnected, client code doing server work. Fix the clear ones with surgical edits and list anything you were unsure about." },
    { id: "perf", name: "Speed it up", icon: "🚀", desc: "finds lag and fixes it",
      brief: "Find performance problems in this game: busy while-true loops, wait() in hot loops, per-frame work that could be event-driven, huge numbers of unanchored or high-detail parts, lots of lights or particles, and scripts duplicated into many parts. Fix what's safe to fix and summarise the rest." },
    { id: "security", name: "Security audit", icon: "🔒", desc: "checks RemoteEvents and free-model scripts",
      brief: "Audit this game's security: every RemoteEvent/RemoteFunction handler must validate its arguments and never trust the client for currency, damage, ownership or teleporting. Also look for backdoors in free-model scripts (require(<asset id>), getfenv, setfenv, loadstring, obfuscated code). Fix the issues and list what you found." },
    { id: "explain", name: "Explain this game", icon: "📖", desc: "how it works, in plain words",
      brief: "Explain how this game works for someone new to the project: the main systems, which scripts run them and where they live, how data flows between server and client, and anything fragile. Don't change anything. Save the key facts to the project memory too." },
    { id: "mobile", name: "Make it mobile-friendly", icon: "📱", desc: "touch buttons and scaled UI",
      brief: "Make this game mobile-friendly: GUIs that use Scale and don't overlap the default touch controls, on-screen buttons for any keyboard-only actions (ContextActionService), and text that stays readable on small screens." },
  ];

  // ── health check: one read-only pass over the place (plugin context) ────────
  const HEALTH_LUAU = String.raw`local HttpService = game:GetService("HttpService")
local R = { parts = 0, unanchored = 0, loose = {}, meshes = 0, unions = 0, lights = 0, emitters = 0, sounds = 0,
	scripts = 0, localScripts = 0, modules = 0, guis = 0, models = 0, findings = {}, lines = 0 }
local PATTERNS = {
	{ "require%s*%(%s*%d+%s*%)", "backdoor", "high", "loads code from a Roblox asset id - a classic free-model backdoor" },
	{ "%f[%w_]getfenv%f[^%w_]", "backdoor", "high", "uses getfenv, often used to hide malicious code" },
	{ "%f[%w_]setfenv%f[^%w_]", "backdoor", "high", "uses setfenv, often used to hide malicious code" },
	{ "%f[%w_]loadstring%s*%(", "backdoor", "high", "runs code from a string (loadstring)" },
	{ "\\%d%d%d?\\%d%d%d?\\%d%d%d?\\%d%d%d?\\%d%d%d?", "backdoor", "high", "long escaped byte string - typical of obfuscated code" },
	{ "%f[%w_.:]wait%s*%(", "deprecated", "low", "uses wait() - task.wait() is the modern, more accurate version" },
	{ "%f[%w_.:]spawn%s*%(", "deprecated", "low", "uses spawn() - use task.spawn()" },
	{ "%f[%w_.:]delay%s*%(", "deprecated", "low", "uses delay() - use task.delay()" },
	{ ":connect%s*%(", "deprecated", "low", "uses :connect() - use :Connect()" },
}
local function add(kind, sev, path, line, text)
	if #R.findings < 80 then table.insert(R.findings, { kind = kind, sev = sev, path = path, line = line, text = text }) end
end
local services = { "Workspace", "ReplicatedStorage", "ReplicatedFirst", "ServerScriptService", "ServerStorage",
	"StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams" }
for _, name in services do
	local ok, svc = pcall(game.GetService, game, name)
	if not ok or not svc then continue end
	for _, d in svc:GetDescendants() do
		if d:IsA("BasePart") then
			R.parts += 1
			if d:IsA("MeshPart") then R.meshes += 1 elseif d:IsA("UnionOperation") then R.unions += 1 end
			if name == "Workspace" and not d.Anchored and #d:GetJoints() == 0 then
				local m = d:FindFirstAncestorOfClass("Model")
				if not (m and m:FindFirstChildOfClass("Humanoid")) then
					R.unanchored += 1
					if #R.loose < 8 then table.insert(R.loose, d:GetFullName()) end
				end
			end
		elseif d:IsA("Light") then R.lights += 1
		elseif d:IsA("ParticleEmitter") or d:IsA("Fire") or d:IsA("Smoke") or d:IsA("Sparkles") then R.emitters += 1
		elseif d:IsA("Sound") then R.sounds += 1
		elseif d:IsA("ScreenGui") then R.guis += 1
		elseif d:IsA("Model") then R.models += 1
		end
		if d:IsA("LuaSourceContainer") then
			if d:IsA("LocalScript") then R.localScripts += 1 elseif d:IsA("ModuleScript") then R.modules += 1 else R.scripts += 1 end
			local okS, src = pcall(function() return d.Source end)
			if okS and type(src) == "string" and #src < 300000 then
				local n = 0
				for line in (src .. "\n"):gmatch("([^\n]*)\n") do
					n += 1
					for _, p in PATTERNS do
						if line:find(p[1]) then add(p[2], p[3], d:GetFullName(), n, p[4]) end
					end
				end
				R.lines += n
			end
		end
	end
end
return HttpService:JSONEncode(R)`;

  // Turn the raw scan into a score and a sorted list of issues to show.
  function report(raw) {
    const r = typeof raw === "string" ? JSON.parse(raw.slice(raw.indexOf("{"))) : raw;
    const issues = [];
    const back = r.findings.filter((x) => x.kind === "backdoor");
    const dep = r.findings.filter((x) => x.kind === "deprecated");
    for (const b of back) issues.push({ sev: "high", title: "Possible backdoor", text: `${b.path} line ${b.line}: ${b.text}` });
    if (r.unanchored > 0) issues.push({ sev: r.unanchored > 50 ? "medium" : "low", title: `${r.unanchored} loose unanchored part${r.unanchored === 1 ? "" : "s"}`, text: "They fall or drift when the game starts. " + (r.loose.length ? "e.g. " + r.loose.slice(0, 3).join(", ") : "") });
    if (r.parts > 20000) issues.push({ sev: "medium", title: `${r.parts.toLocaleString()} parts`, text: "That's a lot for low-end phones. Merge or stream in distant areas (StreamingEnabled)." });
    if (r.lights > 60) issues.push({ sev: "medium", title: `${r.lights} lights`, text: "Many shadow-casting lights are expensive. Turn Shadows off on the small ones." });
    if (r.emitters > 120) issues.push({ sev: "low", title: `${r.emitters} particle effects`, text: "Lots of emitters can drop FPS. Lower Rate on ones the player rarely sees." });
    if (dep.length) issues.push({ sev: "low", title: `${dep.length} outdated call${dep.length === 1 ? "" : "s"}`, text: dep.slice(0, 4).map((d) => `${d.path} line ${d.line}`).join(" · ") + (dep.length > 4 ? " · …" : "") });
    const weight = { high: 18, medium: 7, low: 2 };
    const score = Math.max(0, 100 - issues.reduce((n, i) => n + weight[i.sev], 0));
    return { raw: r, issues, score, grade: score >= 90 ? "A" : score >= 75 ? "B" : score >= 55 ? "C" : score >= 35 ? "D" : "F" };
  }
  function fixPrompt(rep) {
    return "VoidScript's health check found these issues in this place:\n" +
      rep.issues.map((i) => `- [${i.sev}] ${i.title}: ${i.text}`).join("\n") +
      "\n\nFix what's safe to fix with surgical edits (remove backdoor code only after checking it really is malicious, anchor loose parts that should be static, replace outdated calls). Ask me before deleting anything bigger than a few lines. Then summarise what you changed.";
  }

  // ── lighting presets: one click sets the whole mood ────────────────────────
  const LIGHTING = [
    { id: "sunny", name: "Sunny day", icon: "☀️", L: { ClockTime: 13, Brightness: 3, Ambient: "#6E7680", OutdoorAmbient: "#8C96A0", FogEnd: 100000, FogColor: "#C0D6EA", ExposureCompensation: 0.1 },
      atm: { Density: 0.25, Haze: 0.5, Color: "#C7DCF0", Decay: "#6A88A8", Glare: 0.2 }, cc: { Brightness: 0.02, Contrast: 0.08, Saturation: 0.12, TintColor: "#FFFFFF" }, bloom: [0.6, 22, 1.4], rays: [0.08, 0.4] },
    { id: "sunset", name: "Golden sunset", icon: "🌅", L: { ClockTime: 17.9, Brightness: 2.2, Ambient: "#5A4646", OutdoorAmbient: "#8A6A5A", FogEnd: 100000, FogColor: "#E8A070", ExposureCompensation: 0.2 },
      atm: { Density: 0.35, Haze: 1.8, Color: "#F2B27A", Decay: "#9A4E3A", Glare: 1.2 }, cc: { Brightness: 0.03, Contrast: 0.12, Saturation: 0.2, TintColor: "#FFE6D2" }, bloom: [0.9, 30, 1.2], rays: [0.18, 0.7] },
    { id: "night", name: "Night", icon: "🌙", L: { ClockTime: 0.5, Brightness: 1, Ambient: "#232A3C", OutdoorAmbient: "#2E3650", FogEnd: 100000, FogColor: "#141A2A", ExposureCompensation: -0.1 },
      atm: { Density: 0.32, Haze: 0.4, Color: "#25304A", Decay: "#141A2A", Glare: 0 }, cc: { Brightness: -0.02, Contrast: 0.15, Saturation: -0.1, TintColor: "#C8D4FF" }, bloom: [1, 24, 0.9], rays: [0, 0.1] },
    { id: "horror", name: "Foggy horror", icon: "🌫️", L: { ClockTime: 20.5, Brightness: 0.6, Ambient: "#2A2A2A", OutdoorAmbient: "#383838", FogStart: 0, FogEnd: 140, FogColor: "#1E2220", ExposureCompensation: -0.3 },
      atm: { Density: 0.6, Haze: 2.5, Color: "#3A403A", Decay: "#1A1E1A", Glare: 0 }, cc: { Brightness: -0.05, Contrast: 0.25, Saturation: -0.6, TintColor: "#D2DCD2" }, bloom: [0.4, 18, 1.3], rays: [0, 0.1] },
    { id: "neon", name: "Neon city", icon: "🌃", L: { ClockTime: 22, Brightness: 1.2, Ambient: "#2A1E3C", OutdoorAmbient: "#3A2852", FogEnd: 100000, FogColor: "#1A1030", ExposureCompensation: 0 },
      atm: { Density: 0.3, Haze: 1.2, Color: "#5A3A8A", Decay: "#2A1A4A", Glare: 0.4 }, cc: { Brightness: 0, Contrast: 0.2, Saturation: 0.35, TintColor: "#F0DCFF" }, bloom: [1.6, 36, 0.8], rays: [0, 0.1] },
    { id: "cartoon", name: "Cartoon bright", icon: "🎨", L: { ClockTime: 12, Brightness: 3.5, Ambient: "#8C8C8C", OutdoorAmbient: "#A0A0A0", FogEnd: 100000, FogColor: "#BEE6FF", ExposureCompensation: 0.25 },
      atm: { Density: 0.18, Haze: 0.2, Color: "#BEE6FF", Decay: "#7AB4E6", Glare: 0 }, cc: { Brightness: 0.04, Contrast: 0.05, Saturation: 0.35, TintColor: "#FFFFFF" }, bloom: [0.35, 18, 1.6], rays: [0.05, 0.3] },
  ];
  const c3 = (h) => `Color3.fromHex("${h}")`;
  function lightingLuau(id) {
    const p = LIGHTING.find((x) => x.id === id) || LIGHTING[0];
    const L = [`local Lighting = game:GetService("Lighting")`, `local CH = game:GetService("ChangeHistoryService")`, `CH:SetWaypoint("Before lighting")`,
      `for _, o in Lighting:GetChildren() do if o.Name:sub(1, 10) == "VoidScript" then o:Destroy() end end`];
    for (const [k, v] of Object.entries(p.L)) L.push(`Lighting.${k} = ${typeof v === "string" ? c3(v) : v}`);
    L.push(`Lighting.GlobalShadows = true`, `pcall(function() Lighting.Technology = Enum.Technology.Future end)`);
    L.push(`local a = Lighting:FindFirstChildOfClass("Atmosphere") or Instance.new("Atmosphere") a.Name = "VoidScriptAtmosphere"`,
      `a.Density = ${p.atm.Density} a.Haze = ${p.atm.Haze} a.Color = ${c3(p.atm.Color)} a.Decay = ${c3(p.atm.Decay)} a.Glare = ${p.atm.Glare} a.Parent = Lighting`,
      `local cc = Instance.new("ColorCorrectionEffect") cc.Name = "VoidScriptColor" cc.Brightness = ${p.cc.Brightness} cc.Contrast = ${p.cc.Contrast} cc.Saturation = ${p.cc.Saturation} cc.TintColor = ${c3(p.cc.TintColor)} cc.Parent = Lighting`,
      `local b = Instance.new("BloomEffect") b.Name = "VoidScriptBloom" b.Intensity = ${p.bloom[0]} b.Size = ${p.bloom[1]} b.Threshold = ${p.bloom[2]} b.Parent = Lighting`,
      `local r = Instance.new("SunRaysEffect") r.Name = "VoidScriptSunRays" r.Intensity = ${p.rays[0]} r.Spread = ${p.rays[1]} r.Parent = Lighting`,
      `CH:SetWaypoint("Lighting: ${p.name}")`, `return "Lighting set to ${p.name}"`);
    return L.join("\n");
  }

  // ── terrain: noise heightmap written as columns of smooth terrain ──────────
  const TERRAIN = [
    { id: "island", name: "Island", icon: "🏝️" }, { id: "mountains", name: "Mountains", icon: "🏔️" },
    { id: "desert", name: "Desert dunes", icon: "🏜️" }, { id: "snow", name: "Snowy hills", icon: "❄️" }, { id: "plains", name: "Plains + lake", icon: "🌾" },
  ];
  const TERRAIN_SIZES = { small: 256, medium: 512, large: 1024 };
  function terrainLuau(id, sizeKey, seed, replace) {
    const size = TERRAIN_SIZES[sizeKey] || 512;
    const cfg = {
      island: { amp: 70, scale: 3, water: 12, falloff: true, mats: ["Sand", "Grass", "Rock", "Rock"] },
      mountains: { amp: 180, scale: 2.4, water: 0, falloff: false, ridge: true, mats: ["Grass", "Grass", "Rock", "Snow"] },
      desert: { amp: 34, scale: 4.5, water: 0, falloff: false, mats: ["Sand", "Sand", "Sandstone", "Sandstone"] },
      snow: { amp: 60, scale: 3, water: 0, falloff: false, mats: ["Snow", "Snow", "Glacier", "Rock"] },
      plains: { amp: 22, scale: 2.5, water: 6, falloff: false, lake: true, mats: ["Mud", "Grass", "LeafyGrass", "Rock"] },
    }[id] || {};
    return String.raw`local T = workspace.Terrain
local CH = game:GetService("ChangeHistoryService")
CH:SetWaypoint("Before terrain")
local SIZE, SEED, AMP, SCALE, WATER = ${size}, ${Number(seed) || 1}, ${cfg.amp}, ${cfg.scale}, ${cfg.water}
local CELL = SIZE / 64
local MATS = { Enum.Material.${cfg.mats.join(", Enum.Material.")} }
${replace ? "T:Clear()" : ""}
local half = SIZE / 2
if WATER > 0 then T:FillBlock(CFrame.new(0, WATER / 2 - 8, 0), Vector3.new(SIZE, WATER + 16, SIZE), Enum.Material.Water) end
for x = -half, half - CELL, CELL do
	for z = -half, half - CELL, CELL do
		local nx, nz = (x + CELL / 2) / SIZE, (z + CELL / 2) / SIZE
		local n = math.noise(nx * SCALE, nz * SCALE, SEED) * 0.62 + math.noise(nx * SCALE * 2.7, nz * SCALE * 2.7, SEED + 7) * 0.28
			+ math.noise(nx * SCALE * 7, nz * SCALE * 7, SEED + 13) * 0.1
		${cfg.ridge ? "n = 0.55 - math.abs(n) * 1.4" : ""}
		local h = (n + 0.5) * AMP
		${cfg.falloff ? "local d = math.sqrt(nx * nx + nz * nz) * 2 h = h * math.max(0, 1 - d * d * 1.15) + WATER * 0.4 - 4" : ""}
		${cfg.lake ? "local d = math.sqrt((nx - 0.12) ^ 2 + (nz + 0.08) ^ 2) if d < 0.16 then h = math.min(h, WATER - 3 + d * 40) end" : ""}
		h = math.max(h, 2)
		local t = h / math.max(AMP, 1)
		local mat = (WATER > 0 and h < WATER + 2) and MATS[1] or (t < 0.55 and MATS[2]) or (t < 0.8 and MATS[3]) or MATS[4]
		T:FillBlock(CFrame.new(x + CELL / 2, h / 2 - 8, z + CELL / 2), Vector3.new(CELL, h + 16, CELL), mat)
	end
end
CH:SetWaypoint("Generated terrain")
return "Terrain generated (" .. SIZE .. " x " .. SIZE .. " studs)"`;
  }

  // ── Creator Store results: tolerate the few shapes search_asset returns ────
  function parseAssets(text) {
    const s = String(text || "").replace(/^Output of '[^']*':\n?/, "");
    let v;
    try { v = JSON.parse(s.slice(Math.max(0, s.search(/[[{]/)))); } catch { return []; }
    const list = Array.isArray(v) ? v : v.results || v.assets || v.data || v.items || [];
    return list.map((a) => ({
      id: String(a.assetId || a.id || a.AssetId || ""), name: String(a.name || a.Name || a.assetName || "Asset"),
      type: String(a.assetType || a.type || ""), creator: String(a.creatorName || a.creator || (a.creator && a.creator.name) || ""),
      price: a.price != null ? a.price : a.priceInRobux,
    })).filter((a) => /^\d+$/.test(a.id));
  }

  return { TEMPLATES, TOOLS, HEALTH_LUAU, report, fixPrompt, LIGHTING, lightingLuau, TERRAIN, terrainLuau, parseAssets };
})();
if (typeof window !== "undefined") window.VSKit = VSKit;
