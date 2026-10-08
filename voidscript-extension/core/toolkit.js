// SPDX-License-Identifier: GPL-3.0-or-later
// toolkit.js - game templates, script tools and the place health check, shared by
// the desktop app and the extension.
"use strict";

const VSKit = (() => {
  // Line icons (24px grid, stroked with currentColor) - used by the app and the extension.
  const ico = (d) => `<svg class="vs-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    haunted: ico('<path d="M3 21V11l9-7 9 7v10M9 21v-5h6v5"/><path d="M7.5 12h1M15.5 12h1M12 4V2"/>'),
    zombies: ico('<path d="M8 21v-5l-2.5-3.2a1.1 1.1 0 0 1 1.8-1.3L8 12.5V6a1.2 1.2 0 0 1 2.4 0v5V4.6a1.2 1.2 0 0 1 2.4 0V11V5.6a1.2 1.2 0 0 1 2.4 0V11V7.6a1.2 1.2 0 0 1 2.4 0V15l-1.6 6"/><path d="M3 21h18"/>'),
    candy: ico('<circle cx="12" cy="12" r="3.6"/><path d="M8.6 10.6 4 7.5v9l4.6-3.1M15.4 10.6 20 7.5v9l-4.6-3.1M10.5 9.2l2.6 5.4"/>'),
    ghosthunt: ico('<path d="M6 20.5V11a6 6 0 0 1 12 0v9.5l-2-1.6-2 1.6-2-1.6-2 1.6-2-1.6z"/><path d="M10 10.5v1M14 10.5v1"/>'),
    obby: ico('<path d="M3 20h4.5v-4.5H12V11h4.5V6.5H21"/><path d="M17 3.5h4v3"/>'),
    tycoon: ico('<path d="M3 21V10.5l5 3v-3l5 3V6h4.5v15z"/><path d="M2 21h20M15 3.5v2.5M7 17h2M12 17h2"/>'),
    sim: ico('<path d="M13.5 2 4.5 13.5H11L10 22l9-11.5h-6.5z"/>'),
    rounds: ico('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.6 1.6M9.5 2.5h5M19 6l1.4-1.4"/>'),
    shop: ico('<path d="M5 8h14l-1.1 12.1a1 1 0 0 1-1 .9H7.1a1 1 0 0 1-1-.9z"/><path d="M9 10.5V6.5a3 3 0 0 1 6 0v4"/>'),
    lb: ico('<path d="M8 3.5h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 5.5H5a3 3 0 0 0 3 4.4M16 5.5h3a3 3 0 0 1-3 4.4M12 13v3.5M8.5 20.5h7l-1-4h-5z"/>'),
    admin: ico('<path d="M12 2.5l7.5 3v5.3c0 4.7-3.2 8.6-7.5 10.2-4.3-1.6-7.5-5.5-7.5-10.2V5.5z"/><path d="M9 12l2.2 2.2L15.5 9.8"/>'),
    daynight: ico('<path d="M12 3a9 9 0 1 0 0 18z" fill="currentColor" fill-opacity=".22"/><circle cx="12" cy="12" r="9"/><path d="M12 3v18"/>'),
    sprint: ico('<path d="M2.5 8.5H13a3 3 0 1 0-3-3M2.5 12.5h15.5a3 3 0 1 1-3 3M2.5 16.5h7"/>'),
    pets: ico('<circle cx="8" cy="6.5" r="1.8"/><circle cx="16" cy="6.5" r="1.8"/><circle cx="4.5" cy="11.5" r="1.7"/><circle cx="19.5" cy="11.5" r="1.7"/><path d="M12 12c-3 0-5.2 3.2-5.2 5.6A2.4 2.4 0 0 0 9.2 20c1.1 0 1.8-.5 2.8-.5s1.7.5 2.8.5a2.4 2.4 0 0 0 2.4-2.4C17.2 15.2 15 12 12 12z"/>'),
    doublejump: ico('<path d="M6.5 13.5 12 8l5.5 5.5M6.5 20 12 14.5l5.5 5.5"/><path d="M8 3.5h8"/>'),
    music: ico('<path d="M9 17.5V5.2l11-2.2v12.4"/><circle cx="6.3" cy="17.6" r="2.7"/><circle cx="17.3" cy="15.4" r="2.7"/>'),
    fix: ico('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'),
    bugs: ico('<rect x="7.5" y="7" width="9" height="13" rx="4.5"/><path d="M12 11v9M3.5 11.5h4M16.5 11.5h4M4 18l3.6-1.4M20 18l-3.6-1.4M9.5 7.5 8 4M14.5 7.5 16 4"/>'),
    perf: ico('<path d="M3.5 17a8.5 8.5 0 1 1 17 0"/><path d="M12 17l4.2-5.5M2.5 20.5h19"/>'),
    security: ico('<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5M12 14.5v2.5"/>'),
    explain: ico('<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3M8 7.5h8M8 11h5"/>'),
    mobile: ico('<rect x="6.5" y="2" width="11" height="20" rx="2.5"/><path d="M10.5 18.5h3"/>'),
    halloween: ico('<path d="M12 6.5c-5 0-8.5 2.9-8.5 6.8S7 20.5 12 20.5s8.5-3.3 8.5-7.2S17 6.5 12 6.5z"/><path d="M12 6.5V3.5h2.5M8.8 7c-1.6 2.6-1.6 10.4 0 13M15.2 7c1.6 2.6 1.6 10.4 0 13"/>'),
    sunny: ico('<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>'),
    sunset: ico('<path d="M2.5 18h19M6.5 18a5.5 5.5 0 0 1 11 0M12 4v4M4.6 10.1l1.8 1.8M19.4 10.1l-1.8 1.8M7 21.5h10"/>'),
    night: ico('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5z"/><path d="M17 3.5v3M15.5 5h3"/>'),
    horror: ico('<path d="M3 9h13.5M6.5 13H21M3 17h11.5M8 5h8M17.5 17H21"/>'),
    neon: ico('<path d="M3 21V9.5h5V21M8 21V3.5h8V21M16 21v-9h5v9M2 21h20M11 7.5h2M11 11h2M11 14.5h2"/>'),
    cartoon: ico('<path d="M12 3a9 9 0 0 0 0 18c1.3 0 2.1-.8 2.1-2 0-.6-.3-1-.6-1.4-.3-.4-.4-.8-.4-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 21 9.8C21 6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15.5" cy="7.5" r="1.2"/>'),
    island: ico('<path d="M2 20.5c3-1.2 5-1.2 7 0s4 1.2 6 0 4-1.2 7 0M5.5 17.5c1.5-2 4-3 6.5-3s5 1 6.5 3"/><path d="M12 14.5c0-3.5-.6-6.5-2-9M10 5.5c-2-.6-4 .2-5 1.8M10 5.5c1.6-1.5 4-1.6 5.6-.4M10 5.5c.8 1.6.6 3.6-.6 5"/>'),
    mountains: ico('<path d="M2.5 20 9 8.5l4 6.5 2.7-4L21.5 20z"/><path d="M7.4 11.3 9 12.5l1.6-1.3"/>'),
    desert: ico('<path d="M2 18.5c3.8-6 8.2-6 12 0M9.5 18.5c3.2-4.3 8.8-4.3 12.5 0M2 21.5h20"/><circle cx="17.5" cy="6" r="2.5"/>'),
    snow: ico('<path d="M12 2v20M3.4 7l17.2 10M3.4 17 20.6 7M9 3.8 12 6l3-2.2M9 20.2l3-2.2 3 2.2M3.6 10.6l3.2-.6-.9-3.4M20.4 13.4l-3.2.6.9 3.4"/>'),
    plains: ico('<path d="M2 19.5h20M5 19.5v-4.5M8 19.5v-7M11.5 19.5V16M15 19.5v-6M18.5 19.5v-3.5"/><path d="M8 12.5c-1.2-.8-2-2.1-2-3.5M15 13.5c1.2-.8 2-2 2-3.6"/>'),
    volcano: ico('<path d="M2.5 21 8.5 10h7l6 11z"/><path d="M10.5 10 9 5.5M13.5 10 15 5.5M12 10V3.5M10 15l2 2 2-2"/>'),
    canyon: ico('<path d="M2 6.5h6.5l1 4-1 9.5M22 6.5h-6.5l-1 4 1 9.5M8.5 20h7"/><path d="M10 16c1.3.6 2.7.6 4 0"/>'),
    swamp: ico('<path d="M2 15.5c2-1.2 4-1.2 6 0s4 1.2 6 0 4-1.2 6 0M2 19.5c2-1.2 4-1.2 6 0s4 1.2 6 0 4-1.2 6 0M7 12.5v-8M17 12.5V7"/><path d="M7 7.5c-1.4 0-2.5-1-2.5-2.5M17 9c1.4 0 2.5-1 2.5-2.5"/>'),
    graveyard: ico('<path d="M4.5 21V10a4 4 0 0 1 8 0v11M8.5 12.5v4.5M6.5 14.5h4M14.5 21v-6a3 3 0 0 1 6 0v6M2 21h20"/>'),
  };
  // One-click game starters. Each is a build brief the agent follows in Studio.
  const TEMPLATES = [
    { id: "haunted", name: "Haunted house", icon: ICON.haunted, desc: "creaky mansion, jump scares, flickering lights",
      brief: "Build a haunted house experience: a two-storey spooky mansion (dark wood, broken windows, cobwebs, candles with flickering PointLights), a creaking front door that swings open when you approach, three jump-scare trigger zones (a ghost that flies across a hallway with a scream sound, a portrait whose eyes follow you, a closet that bursts open), thick purple fog and dim moonlight, and a way out at the end with a 'You escaped!' message." },
    { id: "zombies", name: "Zombie survival", icon: ICON.zombies, desc: "waves of zombies, weapons, round counter",
      brief: "Build a zombie survival game: zombies (R15 NPCs with a green tint) spawn in waves from graveyard spawn points and path-find to the nearest player, a simple sword and a slingshot as starter weapons, wave counter + zombies-left GUI, waves get bigger and faster, coins dropped by zombies saved in leaderstats, and a safe lobby between waves. Server-authoritative damage." },
    { id: "candy", name: "Trick-or-treat simulator", icon: ICON.candy, desc: "collect candy, bigger bags, sell, rebirth",
      brief: "Build a trick-or-treat simulator: a Halloween street with houses whose doors give candy when you knock (with a cooldown each), a candy bag with a capacity, a sell stand that turns candy into coins, a shop for bigger bags and costumes that boost candy per knock, rebirths, leaderstats (Candy, Coins, Rebirths) and DataStore saving. Pumpkin lanterns and string lights along the street." },
    { id: "ghosthunt", name: "Ghost hunt", icon: ICON.ghosthunt, desc: "find hidden ghosts, flashlight, timer",
      brief: "Build a ghost hunt: 10 ghosts hidden around a dark graveyard map that are only visible in a flashlight beam (a Tool with a SpotLight that reveals them when aimed at), a counter GUI (Ghosts found 3/10), a 5-minute timer, eerie ambient sound, and a win screen with your time. Ghosts drift and bob slowly." },
    { id: "obby", name: "Obby", icon: ICON.obby, desc: "10 stages, checkpoints, kill bricks, a finish",
      brief: "Build a complete obby: 10 stages that get harder (jumps, moving platforms, spinning bars, disappearing tiles, kill bricks), a checkpoint at the start of each stage that saves the player's stage in leaderstats (Stage), respawning at your last checkpoint, a timer GUI, and a finish platform with a celebration effect. Make the stages look good with a consistent color theme." },
    { id: "tycoon", name: "Tycoon", icon: ICON.tycoon, desc: "droppers, conveyor, collector, buy buttons",
      brief: "Build a working tycoon for one player plot: a claim pad, droppers that spawn ore parts, a conveyor that carries them to a collector which adds Cash to leaderstats, and buy buttons (with prices shown on BillboardGuis) that unlock more droppers, upgrades and walls in order. Server-side purchase checks only." },
    { id: "sim", name: "Simulator", icon: ICON.sim, desc: "click to gain, sell area, upgrades, rebirths",
      brief: "Build a simulator loop: a tool you click to gain Strength (with a cooldown), a sell pad that converts Strength to Coins, an upgrade shop GUI that multiplies gains, and rebirths that reset Coins for a permanent multiplier. leaderstats for Coins and Rebirths. All currency changes happen on the server via RemoteEvents with validation." },
    { id: "rounds", name: "Round system", icon: ICON.rounds, desc: "lobby, intermission, map vote, winners",
      brief: "Build a round-based game loop: a lobby, a 20 second intermission with a status GUI, a vote between 3 maps stored in ServerStorage, teleporting players into the chosen map, a 2 minute round, awarding Wins to survivors in leaderstats, then cleaning up and returning everyone to the lobby." },
    { id: "shop", name: "Shop + saving", icon: ICON.shop, desc: "currency, shop GUI, DataStore saving",
      brief: "Build an item shop: Coins in leaderstats that save and load with DataStoreService (with pcall, retries and saving on leave and on shutdown), a shop GUI listing 4 tools from ServerStorage with prices, and a server-validated purchase RemoteEvent that gives the tool and remembers owned items across sessions." },
    { id: "lb", name: "Global leaderboard", icon: ICON.lb, desc: "top 10 board in the world",
      brief: "Build a global top-10 leaderboard: an OrderedDataStore for Wins, saving each player's Wins, and a physical board in the workspace with a SurfaceGui that lists the top 10 names and scores and refreshes every 60 seconds." },
    { id: "admin", name: "Admin commands", icon: ICON.admin, desc: ":kick :tp :speed :fly for admins",
      brief: "Add admin commands for a list of admin UserIds in a ModuleScript: :kick, :tp (to player), :bring, :speed, :jump, :fly and :heal via chat messages (TextChatService). Validate everything on the server and ignore non-admins." },
    { id: "daynight", name: "Day / night", icon: ICON.daynight, desc: "smooth cycle with lighting moods",
      brief: "Add a smooth day/night cycle (a full day every 10 minutes) with tweened Lighting moods for dawn, day, dusk and night (ambient, fog, sky colors), plus street lamps whose lights turn on at night." },
    { id: "sprint", name: "Sprint + stamina", icon: ICON.sprint, desc: "Shift to sprint, stamina bar",
      brief: "Add sprinting: hold Shift (or a mobile button) to run faster, a stamina bar GUI that drains while sprinting and refills when not, and a slight camera FOV change while sprinting. Client-side with sensible values." },
    { id: "pets", name: "Pets", icon: ICON.pets, desc: "pets that follow you, egg hatch",
      brief: "Add pets: an egg you can buy that hatches a random pet with rarities, pets that smoothly follow the player, equipping up to 3 pets, and pets giving a coin multiplier. Save owned pets with DataStoreService." },
    { id: "doublejump", name: "Double jump", icon: ICON.doublejump, desc: "second jump in mid-air",
      brief: "Add a double jump: pressing jump again in mid-air does a second jump with a small particle burst, and it resets when the player lands. Works on PC and mobile." },
    { id: "music", name: "Music + SFX", icon: ICON.music, desc: "background music player, UI sounds",
      brief: "Add background music: a playlist of free Roblox audio that loops with a mute toggle button in the corner, plus click and hover sounds for every TextButton in StarterGui." },
  ];

  // Quick jobs on the current game.
  const TOOLS = [
    { id: "fix", name: "Fix errors in Output", icon: ICON.fix, desc: "reads Studio's console and fixes the causes",
      brief: "Read the Studio console with get_console_output. For every error or warning that comes from this game's scripts, find the cause (script_read the script) and fix it with a surgical edit. Then tell me in a few lines what was wrong and what you changed. If there are no errors, say so." },
    { id: "bugs", name: "Find bugs", icon: ICON.bugs, desc: "reviews every script for real bugs",
      brief: "Review every Script, LocalScript and ModuleScript in this game (use script_search / script_read). Look for real bugs: nil access, wrong service, missing WaitForChild timeouts, race conditions on PlayerAdded, memory leaks from connections never disconnected, client code doing server work. Fix the clear ones with surgical edits and list anything you were unsure about." },
    { id: "perf", name: "Speed it up", icon: ICON.perf, desc: "finds lag and fixes it",
      brief: "Find performance problems in this game: busy while-true loops, wait() in hot loops, per-frame work that could be event-driven, huge numbers of unanchored or high-detail parts, lots of lights or particles, and scripts duplicated into many parts. Fix what's safe to fix and summarise the rest." },
    { id: "security", name: "Security audit", icon: ICON.security, desc: "checks RemoteEvents and free-model scripts",
      brief: "Audit this game's security: every RemoteEvent/RemoteFunction handler must validate its arguments and never trust the client for currency, damage, ownership or teleporting. Also look for backdoors in free-model scripts (require(<asset id>), getfenv, setfenv, loadstring, obfuscated code). Fix the issues and list what you found." },
    { id: "explain", name: "Explain this game", icon: ICON.explain, desc: "how it works, in plain words",
      brief: "Explain how this game works for someone new to the project: the main systems, which scripts run them and where they live, how data flows between server and client, and anything fragile. Don't change anything. Save the key facts to the project memory too." },
    { id: "website", name: "Build a web page", icon: ICON.explain, desc: "HTML/CSS/JS on your PC, opened in your browser",
      brief: "Build a polished, responsive single-page website with the files tools (they save into the user's workspace folder on their PC): write site/index.html, site/style.css and site/script.js with clean, modern design, then files_open site/index.html so the user sees it. If the files tools aren't available, tell the user to switch on Workspace access in the VoidScript app (Settings) and choose a folder. Ask me what the page should be about if I haven't said." },
    { id: "mobile", name: "Make it mobile-friendly", icon: ICON.mobile, desc: "touch buttons and scaled UI",
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
    { id: "halloween", name: "Halloween night", icon: ICON.halloween, L: { ClockTime: 0.2, Brightness: 0.6, Ambient: "#2A1A3A", OutdoorAmbient: "#3A2050", FogEnd: 260, FogStart: 10, FogColor: "#2A1440", ExposureCompensation: 0.1 },
      atm: { Density: 0.5, Haze: 2.2, Color: "#5A2E86", Decay: "#FF7A18", Glare: 0.4 }, cc: { Brightness: 0, Contrast: 0.2, Saturation: -0.05, TintColor: "#E8D2FF" }, bloom: [1.1, 26, 0.9], rays: [0.05, 0.3] },
    { id: "sunny", name: "Sunny day", icon: ICON.sunny, L: { ClockTime: 13, Brightness: 3, Ambient: "#6E7680", OutdoorAmbient: "#8C96A0", FogEnd: 100000, FogColor: "#C0D6EA", ExposureCompensation: 0.1 },
      atm: { Density: 0.25, Haze: 0.5, Color: "#C7DCF0", Decay: "#6A88A8", Glare: 0.2 }, cc: { Brightness: 0.02, Contrast: 0.08, Saturation: 0.12, TintColor: "#FFFFFF" }, bloom: [0.6, 22, 1.4], rays: [0.08, 0.4] },
    { id: "sunset", name: "Golden sunset", icon: ICON.sunset, L: { ClockTime: 17.9, Brightness: 2.2, Ambient: "#5A4646", OutdoorAmbient: "#8A6A5A", FogEnd: 100000, FogColor: "#E8A070", ExposureCompensation: 0.2 },
      atm: { Density: 0.35, Haze: 1.8, Color: "#F2B27A", Decay: "#9A4E3A", Glare: 1.2 }, cc: { Brightness: 0.03, Contrast: 0.12, Saturation: 0.2, TintColor: "#FFE6D2" }, bloom: [0.9, 30, 1.2], rays: [0.18, 0.7] },
    { id: "night", name: "Night", icon: ICON.night, L: { ClockTime: 0.5, Brightness: 1, Ambient: "#232A3C", OutdoorAmbient: "#2E3650", FogEnd: 100000, FogColor: "#141A2A", ExposureCompensation: -0.1 },
      atm: { Density: 0.32, Haze: 0.4, Color: "#25304A", Decay: "#141A2A", Glare: 0 }, cc: { Brightness: -0.02, Contrast: 0.15, Saturation: -0.1, TintColor: "#C8D4FF" }, bloom: [1, 24, 0.9], rays: [0, 0.1] },
    { id: "horror", name: "Foggy horror", icon: ICON.horror, L: { ClockTime: 20.5, Brightness: 0.6, Ambient: "#2A2A2A", OutdoorAmbient: "#383838", FogStart: 0, FogEnd: 140, FogColor: "#1E2220", ExposureCompensation: -0.3 },
      atm: { Density: 0.6, Haze: 2.5, Color: "#3A403A", Decay: "#1A1E1A", Glare: 0 }, cc: { Brightness: -0.05, Contrast: 0.25, Saturation: -0.6, TintColor: "#D2DCD2" }, bloom: [0.4, 18, 1.3], rays: [0, 0.1] },
    { id: "neon", name: "Neon city", icon: ICON.neon, L: { ClockTime: 22, Brightness: 1.2, Ambient: "#2A1E3C", OutdoorAmbient: "#3A2852", FogEnd: 100000, FogColor: "#1A1030", ExposureCompensation: 0 },
      atm: { Density: 0.3, Haze: 1.2, Color: "#5A3A8A", Decay: "#2A1A4A", Glare: 0.4 }, cc: { Brightness: 0, Contrast: 0.2, Saturation: 0.35, TintColor: "#F0DCFF" }, bloom: [1.6, 36, 0.8], rays: [0, 0.1] },
    { id: "cartoon", name: "Cartoon bright", icon: ICON.cartoon, L: { ClockTime: 12, Brightness: 3.5, Ambient: "#8C8C8C", OutdoorAmbient: "#A0A0A0", FogEnd: 100000, FogColor: "#BEE6FF", ExposureCompensation: 0.25 },
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
    { id: "island", name: "Island", icon: ICON.island }, { id: "mountains", name: "Mountains", icon: ICON.mountains },
    { id: "desert", name: "Desert dunes", icon: ICON.desert }, { id: "snow", name: "Snowy hills", icon: ICON.snow }, { id: "plains", name: "Plains + lake", icon: ICON.plains },
    { id: "volcano", name: "Volcano", icon: ICON.volcano }, { id: "canyon", name: "Canyon river", icon: ICON.canyon },
    { id: "swamp", name: "Swamp", icon: ICON.swamp }, { id: "graveyard", name: "Graveyard hills", icon: ICON.graveyard },
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
      volcano: { amp: 190, scale: 3, water: 10, falloff: false, cone: true, mats: ["Sand", "Basalt", "Rock", "Basalt"] },
      canyon: { amp: 90, scale: 2, water: 8, falloff: false, canyon: true, mats: ["Sand", "Sandstone", "Sandstone", "Rock"] },
      swamp: { amp: 12, scale: 4, water: 6, falloff: false, mats: ["Mud", "Mud", "LeafyGrass", "Grass"] },
      graveyard: { amp: 26, scale: 2.2, water: 0, falloff: false, mats: ["Mud", "Ground", "Mud", "Slate"] },
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
		${cfg.cone ? "local d = math.sqrt(nx * nx + nz * nz) * 2 h = AMP * math.max(0, 1 - d * 1.7) ^ 1.4 + n * AMP * 0.12 + 4 if d < 0.1 then h = h - (0.1 - d) * AMP * 5 end" : ""}
		${cfg.canyon ? "local r = math.abs(math.noise(nx * 2.4, nz * 2.4, SEED + 29)) h = r < 0.07 and (WATER - 4 + r * 120) or (AMP * 0.75 + n * AMP * 0.3)" : ""}
		h = math.max(h, 2)
		local t = h / math.max(AMP, 1)
		local mat = (WATER > 0 and h < WATER + 2) and MATS[1] or (t < 0.55 and MATS[2]) or (t < 0.8 and MATS[3]) or MATS[4]
		${cfg.cone ? "if d < 0.13 and t > 0.45 then mat = Enum.Material.CrackedLava end" : ""}
		T:FillBlock(CFrame.new(x + CELL / 2, h / 2 - 8, z + CELL / 2), Vector3.new(CELL, h + 16, CELL), mat)
	end
end
CH:SetWaypoint("Generated terrain")
return "Terrain generated (" .. SIZE .. " x " .. SIZE .. " studs)"`;
  }

  // ── script library: ready-made systems dropped straight into Studio ────────
  // Parts opt in by name or by CollectionService tag (e.g. a part named KillBrick).
  const EACH = `local CS = game:GetService("CollectionService")
local function each(tag, fn)
	local function try(d) if d:IsA("BasePart") and (d.Name == tag or CS:HasTag(d, tag)) then task.spawn(fn, d) end end
	for _, d in workspace:GetDescendants() do try(d) end
	workspace.DescendantAdded:Connect(try)
	CS:GetInstanceAddedSignal(tag):Connect(try)
end
`;
  const SNIPPETS = [
    { id: "data", name: "Leaderstats + saving", icon: ICON.shop, where: "ServerScriptService", kind: "Script", desc: "Coins and Wins that save with DataStore",
      code: `local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("PlayerData_v1")
local STATS = { Coins = 0, Wins = 0 }

local function load(player)
	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	for name, default in STATS do
		local v = Instance.new("IntValue")
		v.Name = name
		v.Value = default
		v.Parent = ls
	end
	ls.Parent = player
	local ok, data = pcall(store.GetAsync, store, "u" .. player.UserId)
	if ok and type(data) == "table" then
		for name, value in data do
			local v = ls:FindFirstChild(name)
			if v then v.Value = value end
		end
	end
	player:SetAttribute("Loaded", ok)
end

local function save(player)
	local ls = player:FindFirstChild("leaderstats")
	if not ls or not player:GetAttribute("Loaded") then return end
	local data = {}
	for _, v in ls:GetChildren() do data[v.Name] = v.Value end
	for i = 1, 3 do
		if pcall(store.SetAsync, store, "u" .. player.UserId, data) then return end
		task.wait(i)
	end
end

Players.PlayerAdded:Connect(load)
Players.PlayerRemoving:Connect(save)
for _, p in Players:GetPlayers() do task.spawn(load, p) end
game:BindToClose(function()
	for _, p in Players:GetPlayers() do task.spawn(save, p) end
	task.wait(3)
end)` },
    { id: "kill", name: "Kill bricks", icon: ICON.fix, where: "ServerScriptService", kind: "Script", desc: "parts named KillBrick reset you",
      code: EACH + `each("KillBrick", function(part)
	part.Touched:Connect(function(hit)
		local hum = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
		if hum and hum.Health > 0 then hum.Health = 0 end
	end)
end)` },
    { id: "coin", name: "Coin pickups", icon: ICON.sim, where: "ServerScriptService", kind: "Script", desc: "parts named Coin spin and give +1 Coins",
      code: EACH + `local Players = game:GetService("Players")
local RESPAWN = 8
each("Coin", function(part)
	part.Anchored, part.CanCollide = true, false
	local base = part.CFrame
	task.spawn(function()
		local t = 0
		while part.Parent do
			t += task.wait()
			part.CFrame = base * CFrame.new(0, math.sin(t * 2) * 0.4, 0) * CFrame.Angles(0, t * 2, 0)
		end
	end)
	local taken = false
	part.Touched:Connect(function(hit)
		local player = Players:GetPlayerFromCharacter(hit.Parent)
		if taken or not player then return end
		local coins = player:FindFirstChild("leaderstats") and player.leaderstats:FindFirstChild("Coins")
		if not coins then return end
		taken = true
		coins.Value += 1
		part.Transparency = 1
		task.wait(RESPAWN)
		part.Transparency = 0
		taken = false
	end)
end)` },
    { id: "door", name: "Prompt doors", icon: ICON.haunted, where: "ServerScriptService", kind: "Script", desc: "parts named Door open with E",
      code: EACH + `local TweenService = game:GetService("TweenService")
each("Door", function(door)
	door.Anchored = true
	local closed = door.CFrame
	local open = closed * CFrame.new(-door.Size.X / 2, 0, 0) * CFrame.Angles(0, math.rad(90), 0) * CFrame.new(door.Size.X / 2, 0, 0)
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText, prompt.ObjectText, prompt.MaxActivationDistance = "Open", "Door", 10
	prompt.Parent = door
	local isOpen = false
	prompt.Triggered:Connect(function()
		isOpen = not isOpen
		prompt.ActionText = isOpen and "Close" or "Open"
		TweenService:Create(door, TweenInfo.new(0.5, Enum.EasingStyle.Quad), { CFrame = isOpen and open or closed }):Play()
	end)
end)` },
    { id: "jump", name: "Jump pads", icon: ICON.doublejump, where: "ServerScriptService", kind: "Script", desc: "parts named JumpPad launch you up",
      code: EACH + `local POWER = 120
each("JumpPad", function(pad)
	local busy = {}
	pad.Touched:Connect(function(hit)
		local root = hit.Parent and hit.Parent:FindFirstChild("HumanoidRootPart")
		if not root or busy[root] then return end
		busy[root] = true
		root.AssemblyLinearVelocity = Vector3.new(root.AssemblyLinearVelocity.X, POWER, root.AssemblyLinearVelocity.Z)
		task.wait(0.4)
		busy[root] = nil
	end)
end)` },
    { id: "moving", name: "Moving platforms", icon: ICON.obby, where: "ServerScriptService", kind: "Script", desc: "parts named MovingPlatform glide back and forth",
      code: EACH + `local TweenService = game:GetService("TweenService")
each("MovingPlatform", function(part)
	part.Anchored = true
	local offset = part:GetAttribute("Offset") or Vector3.new(0, 0, 20)
	local time = part:GetAttribute("Time") or 3
	local tween = TweenService:Create(part, TweenInfo.new(time, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true), { CFrame = part.CFrame + offset })
	tween:Play()
end)` },
    { id: "spin", name: "Spinners", icon: ICON.rounds, where: "ServerScriptService", kind: "Script", desc: "parts named Spinner rotate and knock you off",
      code: EACH + `local RunService = game:GetService("RunService")
local parts = {}
each("Spinner", function(part)
	part.Anchored = true
	parts[part] = part:GetAttribute("Speed") or 90
end)
RunService.Heartbeat:Connect(function(dt)
	for part, speed in parts do
		if part.Parent then part.CFrame *= CFrame.Angles(0, math.rad(speed) * dt, 0) else parts[part] = nil end
	end
end)` },
    { id: "checkpoints", name: "Checkpoints", icon: ICON.lb, where: "ServerScriptService", kind: "Script", desc: "parts named Checkpoint1, 2, 3… save your stage",
      code: `local Players = game:GetService("Players")
local checkpoints = {}
for _, d in workspace:GetDescendants() do
	local n = d:IsA("BasePart") and tonumber(d.Name:match("^Checkpoint(%d+)$"))
	if n then checkpoints[n] = d end
end

Players.PlayerAdded:Connect(function(player)
	local ls = player:FindFirstChild("leaderstats") or Instance.new("Folder")
	ls.Name = "leaderstats"
	ls.Parent = player
	local stage = ls:FindFirstChild("Stage") or Instance.new("IntValue")
	stage.Name = "Stage"
	stage.Parent = ls
	player.CharacterAdded:Connect(function(char)
		local cp = checkpoints[stage.Value]
		if cp then
			local root = char:WaitForChild("HumanoidRootPart", 5)
			if root then task.defer(function() root.CFrame = cp.CFrame + Vector3.new(0, 4, 0) end) end
		end
	end)
end)

for n, part in checkpoints do
	part.Touched:Connect(function(hit)
		local player = Players:GetPlayerFromCharacter(hit.Parent)
		local stage = player and player:FindFirstChild("leaderstats") and player.leaderstats:FindFirstChild("Stage")
		if stage and stage.Value == n - 1 then stage.Value = n end
	end)
end` },
    { id: "sprint", name: "Sprint + stamina", icon: ICON.sprint, where: "StarterPlayerScripts", kind: "LocalScript", desc: "hold Shift to run, stamina drains",
      code: `local Players = game:GetService("Players")
local UIS = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local WALK, RUN, MAX = 16, 26, 100
local stamina, running = MAX, false
local player = Players.LocalPlayer

local gui = Instance.new("ScreenGui")
gui.Name, gui.ResetOnSpawn = "Stamina", false
local bar = Instance.new("Frame")
bar.AnchorPoint, bar.Position, bar.Size = Vector2.new(0.5, 1), UDim2.new(0.5, 0, 1, -24), UDim2.fromOffset(220, 8)
bar.BackgroundColor3, bar.BorderSizePixel = Color3.fromRGB(30, 30, 36), 0
Instance.new("UICorner", bar).CornerRadius = UDim.new(1, 0)
local fill = Instance.new("Frame")
fill.Size, fill.BackgroundColor3, fill.BorderSizePixel = UDim2.fromScale(1, 1), Color3.fromRGB(90, 200, 255), 0
Instance.new("UICorner", fill).CornerRadius = UDim.new(1, 0)
fill.Parent = bar
bar.Parent = gui
gui.Parent = player:WaitForChild("PlayerGui")

UIS.InputBegan:Connect(function(input, typing)
	if not typing and input.KeyCode == Enum.KeyCode.LeftShift then running = true end
end)
UIS.InputEnded:Connect(function(input)
	if input.KeyCode == Enum.KeyCode.LeftShift then running = false end
end)
RunService.RenderStepped:Connect(function(dt)
	local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if not hum then return end
	local moving = hum.MoveDirection.Magnitude > 0
	if running and moving and stamina > 0 then
		stamina = math.max(0, stamina - 25 * dt)
		hum.WalkSpeed = RUN
	else
		stamina = math.min(MAX, stamina + 15 * dt)
		hum.WalkSpeed = WALK
	end
	fill.Size = UDim2.fromScale(stamina / MAX, 1)
	bar.Visible = stamina < MAX
end)` },
    { id: "djump", name: "Double jump", icon: ICON.doublejump, where: "StarterPlayerScripts", kind: "LocalScript", desc: "jump again in mid-air",
      code: `local Players = game:GetService("Players")
local UIS = game:GetService("UserInputService")
local player = Players.LocalPlayer
local used = false

local function hook(char)
	local hum = char:WaitForChild("Humanoid")
	hum.StateChanged:Connect(function(_, new)
		if new == Enum.HumanoidStateType.Landed then used = false end
	end)
end
if player.Character then hook(player.Character) end
player.CharacterAdded:Connect(hook)

UIS.JumpRequest:Connect(function()
	local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if not hum or used then return end
	if hum:GetState() == Enum.HumanoidStateType.Freefall then
		used = true
		hum:ChangeState(Enum.HumanoidStateType.Jumping)
	end
end)` },
    { id: "daynight", name: "Day / night cycle", icon: ICON.daynight, where: "ServerScriptService", kind: "Script", desc: "a full day every 10 minutes",
      code: `local Lighting = game:GetService("Lighting")
local DAY_MINUTES = 10
while true do
	Lighting.ClockTime = (Lighting.ClockTime + 24 / (DAY_MINUTES * 60) * task.wait(1)) % 24
end` },
    { id: "fall", name: "Fall damage", icon: ICON.mountains, where: "ServerScriptService", kind: "Script", desc: "big drops hurt",
      code: `local Players = game:GetService("Players")
local SAFE, PER_STUD = 18, 2.5
Players.PlayerAdded:Connect(function(player)
	player.CharacterAdded:Connect(function(char)
		local hum = char:WaitForChild("Humanoid")
		local root = char:WaitForChild("HumanoidRootPart")
		local top
		hum.StateChanged:Connect(function(_, new)
			if new == Enum.HumanoidStateType.Freefall then
				top = root.Position.Y
			elseif new == Enum.HumanoidStateType.Landed and top then
				local drop = top - root.Position.Y
				top = nil
				if drop > SAFE then hum:TakeDamage((drop - SAFE) * PER_STUD) end
			end
		end)
	end)
end)` },
    { id: "speedcheck", name: "Anti speed-hack", icon: ICON.security, where: "ServerScriptService", kind: "Script", desc: "pulls back players moving too fast",
      code: `local Players = game:GetService("Players")
local MAX_SPEED = 60
Players.PlayerAdded:Connect(function(player)
	player.CharacterAdded:Connect(function(char)
		local root = char:WaitForChild("HumanoidRootPart")
		local last = root.Position
		while char.Parent do
			task.wait(1)
			local flat = (root.Position - last) * Vector3.new(1, 0, 1)
			if flat.Magnitude > MAX_SPEED then
				root.CFrame = CFrame.new(last)
			else
				last = root.Position
			end
		end
	end)
end)` },
    { id: "ratelimit", name: "Remote rate limiter", icon: ICON.admin, where: "ReplicatedStorage", kind: "ModuleScript", desc: "stop RemoteEvent spam (module)",
      code: `-- local limit = require(ReplicatedStorage.RateLimit)(5, 1)  -- 5 calls per second
-- remote.OnServerEvent:Connect(function(player, ...) if not limit(player) then return end ... end)
return function(count, per)
	local hits = {}
	return function(player)
		local now = os.clock()
		local h = hits[player]
		if not h or now - h.t > per then
			hits[player] = { t = now, n = 1 }
			return true
		end
		h.n += 1
		return h.n <= count
	end
end` },
    { id: "shake", name: "Camera shake", icon: ICON.perf, where: "ReplicatedStorage", kind: "ModuleScript", desc: "require it and call Shake(power, time)",
      code: `local RunService = game:GetService("RunService")
local M = {}
function M.Shake(power, duration)
	local cam = workspace.CurrentCamera
	local t = 0
	local conn
	conn = RunService.RenderStepped:Connect(function(dt)
		t += dt
		if t >= duration then conn:Disconnect() return end
		local f = power * (1 - t / duration)
		cam.CFrame *= CFrame.Angles(math.rad((math.random() - 0.5) * f), math.rad((math.random() - 0.5) * f), 0)
	end)
end
return M` },
    { id: "chatcmds", name: "Admin commands", icon: ICON.admin, where: "ServerScriptService", kind: "Script", desc: ":speed :jump :heal :tp :kick for admins",
      code: `local Players = game:GetService("Players")
local ADMINS = { [game.CreatorId] = true } -- add more UserIds here

local function find(name)
	name = name and name:lower()
	for _, p in Players:GetPlayers() do
		if name and p.Name:lower():sub(1, #name) == name then return p end
	end
end
local CMDS = {
	speed = function(p, n) local h = p.Character and p.Character:FindFirstChildOfClass("Humanoid") if h then h.WalkSpeed = tonumber(n) or 16 end end,
	jump = function(p, n) local h = p.Character and p.Character:FindFirstChildOfClass("Humanoid") if h then h.UseJumpPower = true h.JumpPower = tonumber(n) or 50 end end,
	heal = function(p) local h = p.Character and p.Character:FindFirstChildOfClass("Humanoid") if h then h.Health = h.MaxHealth end end,
	tp = function(p, target) local t = find(target) if t and t.Character and p.Character then p.Character:PivotTo(t.Character:GetPivot()) end end,
	kick = function(_, target) local t = find(target) if t and not ADMINS[t.UserId] then t:Kick("Kicked by an admin") end end,
}
Players.PlayerAdded:Connect(function(player)
	if not ADMINS[player.UserId] then return end
	player.Chatted:Connect(function(msg)
		local cmd, a = msg:match("^:(%w+)%s*(%S*)")
		if cmd and CMDS[cmd:lower()] then CMDS[cmd:lower()](player, a ~= "" and a or nil) end
	end)
end)` },
    { id: "teleport", name: "Teleport pads", icon: ICON.sprint, where: "ServerScriptService", kind: "Script", desc: "parts named TeleportA / TeleportB swap you between them",
      code: `local Players = game:GetService("Players")
-- Pads come in pairs by name: TeleportA <-> TeleportB, TeleportA2 <-> TeleportB2, ...
local pads = {}
for _, d in workspace:GetDescendants() do
	local side, tag = d:IsA("BasePart") and d.Name:match("^Teleport([AB])(%w*)$")
	if side then pads[d.Name] = d end
end
local cooldown = {}
for name, pad in pads do
	local other = pads[name:gsub("^TeleportA", "TeleportX"):gsub("^TeleportB", "TeleportA"):gsub("^TeleportX", "TeleportB")]
	if other then
		pad.Touched:Connect(function(hit)
			local player = Players:GetPlayerFromCharacter(hit.Parent)
			if not player or (cooldown[player] and os.clock() - cooldown[player] < 2) then return end
			cooldown[player] = os.clock()
			player.Character:PivotTo(other.CFrame + Vector3.new(0, 4, 0))
		end)
	end
end
Players.PlayerRemoving:Connect(function(p) cooldown[p] = nil end)` },
    { id: "speedpad", name: "Speed pads", icon: ICON.sim, where: "ServerScriptService", kind: "Script", desc: "parts named SpeedPad give a short speed boost",
      code: EACH + `local BOOST, TIME = 50, 3
each("SpeedPad", function(pad)
	local boosted = {}
	pad.Touched:Connect(function(hit)
		local hum = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
		if not hum or boosted[hum] then return end
		boosted[hum] = true
		local normal = hum.WalkSpeed
		hum.WalkSpeed = pad:GetAttribute("Speed") or BOOST
		task.wait(pad:GetAttribute("Time") or TIME)
		if hum.Parent then hum.WalkSpeed = normal end
		boosted[hum] = nil
	end)
end)` },
    { id: "heal", name: "Healing pads", icon: ICON.fix, where: "ServerScriptService", kind: "Script", desc: "parts named HealPad heal you while you stand on them",
      code: EACH + `local PER_SECOND = 15
each("HealPad", function(pad)
	local standing = {}
	pad.Touched:Connect(function(hit)
		local hum = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
		if hum then standing[hum] = os.clock() end
	end)
	task.spawn(function()
		while pad.Parent do
			for hum, t in standing do
				if os.clock() - t > 0.6 or not hum.Parent then standing[hum] = nil
				elseif hum.Health > 0 then hum.Health = math.min(hum.MaxHealth, hum.Health + PER_SECOND * 0.25) end
			end
			task.wait(0.25)
		end
	end)
end)` },
    { id: "toolgiver", name: "Tool givers", icon: ICON.shop, where: "ServerScriptService", kind: "Script", desc: "parts named ToolGiver give the tool named in their Tool attribute",
      code: EACH + `local Players = game:GetService("Players")
local ServerStorage = game:GetService("ServerStorage")
-- Put tools in ServerStorage; set the pad's "Tool" attribute to a tool's name.
each("ToolGiver", function(pad)
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText, prompt.ObjectText = "Take", pad:GetAttribute("Tool") or "Tool"
	prompt.Parent = pad
	prompt.Triggered:Connect(function(player)
		local tool = ServerStorage:FindFirstChild(pad:GetAttribute("Tool") or "")
		if not tool or not tool:IsA("Tool") then return end
		local backpack = player:FindFirstChildOfClass("Backpack")
		local has = (backpack and backpack:FindFirstChild(tool.Name)) or (player.Character and player.Character:FindFirstChild(tool.Name))
		if backpack and not has then tool:Clone().Parent = backpack end
	end)
end)` },
    { id: "teams", name: "Auto teams", icon: ICON.rounds, where: "ServerScriptService", kind: "Script", desc: "Red and Blue teams, players split evenly",
      code: `local Players = game:GetService("Players")
local Teams = game:GetService("Teams")
local function team(name, color)
	local t = Teams:FindFirstChild(name) or Instance.new("Team")
	t.Name, t.TeamColor, t.AutoAssignable = name, BrickColor.new(color), false
	t.Parent = Teams
	return t
end
local red, blue = team("Red", "Bright red"), team("Blue", "Bright blue")
Players.PlayerAdded:Connect(function(player)
	player.Team = #red:GetPlayers() <= #blue:GetPlayers() and red or blue
end)` },
  ];
  function snippetLuau(s) {
    const parent = s.where === "StarterPlayerScripts" ? `game:GetService("StarterPlayer"):WaitForChild("StarterPlayerScripts")` : `game:GetService("${s.where}")`;
    const name = "VS_" + s.name.replace(/[^A-Za-z0-9]+/g, "");
    return `local CH = game:GetService("ChangeHistoryService")
CH:SetWaypoint("Before ${s.name}")
local parent = ${parent}
local old = parent:FindFirstChild("${name}")
if old then old:Destroy() end
local s = Instance.new("${s.kind}")
s.Name = "${name}"
s.Source = [==[${s.code}]==]
s.Parent = parent
CH:SetWaypoint("Added ${s.name}")
return "Added ${name} to ${s.where}"`;
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

  return { TEMPLATES, TOOLS, HEALTH_LUAU, report, fixPrompt, LIGHTING, lightingLuau, TERRAIN, terrainLuau, SNIPPETS, snippetLuau, ICON, parseAssets };
})();
if (typeof window !== "undefined") window.VSKit = VSKit;
