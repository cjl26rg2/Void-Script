// SPDX-License-Identifier: GPL-3.0-or-later
// workshop6.js - Workshop game systems: Codes, Daily rewards and Quests. Each
// writes a server Script, the remotes it needs, and a real (editable) ScreenGui
// whose LocalScript only talks to the server - the server checks everything.
"use strict";

// Shared Luau for building GUIs in Studio.
const GS_UI = (accent) => `local SG = game:GetService("StarterGui")
local ACC, BG, FG, MUTE = Color3.fromHex(${lq(accent.replace("#", ""))}), Color3.fromRGB(28, 31, 38), Color3.fromRGB(242, 243, 245), Color3.fromRGB(58, 63, 75)
local function make(cls, props, par)
	local o = Instance.new(cls)
	for k, v in props do o[k] = v end
	o.Parent = par
	return o
end
local function round(o, r) make("UICorner", { CornerRadius = r or UDim.new(0, 10) }, o) end
local function screen(name)
	local old = SG:FindFirstChild(name) if old then old.Parent = nil end
	return make("ScreenGui", { Name = name, ResetOnSpawn = false, ZIndexBehavior = Enum.ZIndexBehavior.Sibling }, SG)
end
local function label(props, par)
	props.BackgroundTransparency = 1 props.TextColor3 = props.TextColor3 or FG props.Font = props.Font or Enum.Font.GothamBold props.TextScaled = true
	return make("TextLabel", props, par)
end
local function button(props, par)
	props.BackgroundColor3 = props.BackgroundColor3 or ACC props.TextColor3 = Color3.new(1, 1, 1) props.Font = Enum.Font.GothamBold props.TextScaled = true props.AutoButtonColor = true
	local b = make("TextButton", props, par)
	round(b)
	make("UIPadding", { PaddingTop = UDim.new(0.2, 0), PaddingBottom = UDim.new(0.2, 0) }, b)
	return b
end
local RS = game:GetService("ReplicatedStorage")
local function remote(cls, name)
	local r = RS:FindFirstChild(name) or Instance.new(cls)
	r.Name = name
	r.Parent = RS
	return r
end
local function script(cls, name, parent, src)
	local s = parent:FindFirstChild(name) or Instance.new(cls)
	s.Name = name
	s.Source = src
	s.Parent = parent
	return s
end
`;
const GS_CURRENCY = `local function currency(player)
	local stats = player:FindFirstChild("leaderstats") or Instance.new("Folder")
	stats.Name = "leaderstats"
	stats.Parent = player
	local v = stats:FindFirstChild(CURRENCY)
	if not v then v = Instance.new("IntValue") v.Name = CURRENCY v.Parent = stats end
	return v
end`;
const gsField = (id, label, value, hint) => fld(label, `<input class="input" id="${id}" value="${esc(value)}" maxlength="40" />`, hint);
const gsList = (key, def) => { let v = []; try { v = JSON.parse(lsGet(key) || "[]"); } catch {} return v.length ? v : def; };

// ── Codes ───────────────────────────────────────────────────────────────────
let cdRows = gsList("vs-cd-rows", [{ code: "RELEASE", reward: "100", expires: "" }, { code: "THANKS", reward: "50", expires: "" }]);
const cdSave = () => lsSet("vs-cd-rows", JSON.stringify(cdRows));
WK_TOOLS.codes = {
  name: "Codes", group: "Build", desc: "The \"Enter a code\" box every game has: your codes, their rewards and expiry dates. Each player can use a code once, and the server checks everything.",
  html: () => `
    <div class="wk-grid">${gsField("cd-cur", "Currency (leaderstat)", lsGet("vs-gs-cur") || "Coins")}${fld("Accent", `<input type="color" id="cd-acc" value="#3a86ff" />`)}</div>
    <div class="mo-list" id="cd-list">${cdRows.map((r, i) => `<div class="mo-row" data-i="${i}"><input class="input sm mo-id" data-k="code" value="${esc(r.code)}" placeholder="CODE" />
      <span class="muted">gives</span><input class="input sm" data-k="reward" value="${esc(r.reward)}" placeholder="100" />
      <span class="muted">until</span><input class="input sm" type="date" data-k="expires" value="${esc(r.expires)}" title="Leave empty to never expire" />
      <button class="link" data-act="del" data-i="${i}" aria-label="Remove">×</button></div>`).join("")}</div>
    <div class="row"><button class="btn sm" data-act="addrow">Add a code</button><span class="grow"></span><button class="btn primary" data-act="make">Build it</button></div>
    <p class="muted small-p">Makes VSCodes (server), a VSRedeem RemoteFunction and a CodesGui with a Codes button. Codes aren't case sensitive. Redeemed codes are saved, so test with Studio API access turned on.</p>`,
  mount() { gsRows("cd-list", cdRows, cdSave); },
  async act(a, btn) {
    if (a === "addrow") { cdRows.push({ code: "", reward: "100", expires: "" }); cdSave(); wkShow("codes"); return; }
    if (a === "del") { cdRows.splice(Number(btn.dataset.i), 1); cdSave(); wkShow("codes"); return; }
    const rows = cdRows.filter((r) => String(r.code).trim());
    if (!rows.length) { toast("Add at least one code."); return; }
    const cur = gsCur("cd-cur");
    const list = rows.map((r) => `	[${lq(String(r.code).toUpperCase().replace(/\s+/g, ""))}] = { reward = ${Math.round(lnum(r.reward, 100, 1))}, expires = ${r.expires ? Math.floor(new Date(r.expires + "T23:59:59Z").getTime() / 1000) : 0} },`).join("\n");
    const server = `-- VoidScript codes. Add codes below; expires is a Unix time (0 = never).
local CODES = {
${list}
}
local CURRENCY = ${lq(cur)}
local DataStoreService = game:GetService("DataStoreService")
local used = DataStoreService:GetDataStore("VSCodes")
local redeem = game:GetService("ReplicatedStorage"):WaitForChild("VSRedeem")
${GS_CURRENCY}
local last = {}
redeem.OnServerInvoke = function(player, code)
	if typeof(code) ~= "string" or #code > 40 then return false, "That's not a code." end
	if last[player] and os.clock() - last[player] < 2 then return false, "Slow down a little." end
	last[player] = os.clock()
	code = string.upper((string.gsub(code, "%s", "")))
	local c = CODES[code]
	if not c then return false, "That code doesn't exist." end
	if c.expires > 0 and os.time() > c.expires then return false, "That code has expired." end
	local key = player.UserId .. "_" .. code
	local ok, done = pcall(used.GetAsync, used, key)
	if not ok then return false, "Couldn't check right now - try again." end
	if done then return false, "You've already used that code." end
	if not pcall(used.SetAsync, used, key, true) then return false, "Couldn't save right now - try again." end
	currency(player).Value += c.reward
	return true, "+" .. c.reward .. " " .. CURRENCY .. "!"
end
game:GetService("Players").PlayerRemoving:Connect(function(p) last[p] = nil end)
`;
    const client = `-- Opens and closes the Codes panel and sends a code to the server.
local gui = script.Parent
local open, panel = gui:WaitForChild("Open"), gui:WaitForChild("Panel")
local box, go, msg = panel:WaitForChild("Box"), panel:WaitForChild("Redeem"), panel:WaitForChild("Message")
local redeem = game:GetService("ReplicatedStorage"):WaitForChild("VSRedeem")
open.Activated:Connect(function() panel.Visible = not panel.Visible msg.Text = "" end)
panel:WaitForChild("Close").Activated:Connect(function() panel.Visible = false end)
local busy = false
local function send()
	if busy or box.Text == "" then return end
	busy = true
	msg.Text = "..."
	local ok, good, text = pcall(redeem.InvokeServer, redeem, box.Text)
	msg.TextColor3 = (ok and good) and Color3.fromRGB(63, 207, 142) or Color3.fromRGB(242, 99, 122)
	msg.Text = ok and text or "Something went wrong - try again."
	if ok and good then box.Text = "" end
	busy = false
end
go.Activated:Connect(send)
box.FocusLost:Connect(function(enter) if enter then send() end end)
`;
    await wkRun("Codes", `${GS_UI(val("cd-acc") || "#3a86ff")}
remote("RemoteFunction", "VSRedeem")
script("Script", "VSCodes", game:GetService("ServerScriptService"), ${longStr(server)})
local g = screen("CodesGui")
button({ Name = "Open", Text = "Codes", Size = UDim2.fromScale(0.09, 0.06), Position = UDim2.fromScale(0.01, 0.5), AnchorPoint = Vector2.new(0, 0.5) }, g)
make("UIAspectRatioConstraint", { AspectRatio = 2.4 }, g.Open)
local p = make("Frame", { Name = "Panel", Size = UDim2.fromScale(0.34, 0.32), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5), BackgroundColor3 = BG, Visible = false }, g)
round(p, UDim.new(0, 14))
make("UIAspectRatioConstraint", { AspectRatio = 1.8 }, p)
make("UIStroke", { Color = ACC, Thickness = 2 }, p)
label({ Name = "Title", Text = "Codes", Size = UDim2.fromScale(0.6, 0.18), Position = UDim2.fromScale(0.06, 0.06), TextXAlignment = Enum.TextXAlignment.Left }, p)
local box = make("TextBox", { Name = "Box", PlaceholderText = "Enter a code", Text = "", Size = UDim2.fromScale(0.88, 0.22), Position = UDim2.fromScale(0.06, 0.32), BackgroundColor3 = MUTE, TextColor3 = FG, PlaceholderColor3 = Color3.fromRGB(150, 155, 165), Font = Enum.Font.Gotham, TextScaled = true, ClearTextOnFocus = false }, p)
round(box)
make("UIPadding", { PaddingTop = UDim.new(0.2, 0), PaddingBottom = UDim.new(0.2, 0), PaddingLeft = UDim.new(0.04, 0) }, box)
button({ Name = "Redeem", Text = "Redeem", Size = UDim2.fromScale(0.4, 0.2), Position = UDim2.fromScale(0.06, 0.62) }, p)
label({ Name = "Message", Text = "", Size = UDim2.fromScale(0.44, 0.16), Position = UDim2.fromScale(0.5, 0.64), Font = Enum.Font.Gotham, TextXAlignment = Enum.TextXAlignment.Left }, p)
button({ Name = "Close", Text = "X", Size = UDim2.fromScale(0.09, 0.16), Position = UDim2.fromScale(0.97, 0.05), AnchorPoint = Vector2.new(1, 0), BackgroundColor3 = MUTE }, p)
script("LocalScript", "Behaviour", g, ${longStr(client)})
game:GetService("Selection"):Set({ g })
return "Built the codes system with ${rows.length} code(s)"`, btn);
  },
};

// ── Daily rewards ───────────────────────────────────────────────────────────
WK_TOOLS.daily = {
  name: "Daily rewards", group: "Build", desc: "A 7-day login streak: a popup shows the week, players claim today's reward, and missing a day starts the streak again.",
  html: () => `
    <div class="wk-grid">${gsField("dy-cur", "Currency (leaderstat)", lsGet("vs-gs-cur") || "Coins")}${fld("Accent", `<input type="color" id="dy-acc" value="#f0b440" />`)}</div>
    ${fld("Rewards for day 1 to 7", `<input class="input" id="dy-list" value="${esc(lsGet("vs-dy-list") || "50, 75, 100, 150, 200, 300, 500")}" />`, "comma separated; after day 7 it loops")}
    <div class="row"><span class="grow"></span><button class="btn primary" data-act="make">Build it</button></div>
    <p class="muted small-p">Makes VSDaily (server), two remotes and a DailyGui that pops up when there's something to claim. Days follow UTC.</p>`,
  async act(a, btn) {
    const rewards = val("dy-list").split(/[,\s]+/).map((x) => Math.round(lnum(x, 0, 0))).filter((x) => x > 0).slice(0, 14);
    if (!rewards.length) { toast("Add at least one reward."); return; }
    lsSet("vs-dy-list", rewards.join(", "));
    const cur = gsCur("dy-cur");
    const server = `-- VoidScript daily rewards. REWARDS[n] is day n of the streak; it loops after the last day.
local REWARDS = { ${rewards.join(", ")} }
local CURRENCY = ${lq(cur)}
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("VSDaily")
local RS = game:GetService("ReplicatedStorage")
local show, claim = RS:WaitForChild("VSDailyShow"), RS:WaitForChild("VSDailyClaim")
${GS_CURRENCY}
local state = {}
local today = function() return math.floor(os.time() / 86400) end
local function streakFor(s)
	if not s.last then return 1 end
	if s.last == today() then return s.streak end
	if s.last == today() - 1 then return s.streak + 1 end
	return 1
end
game:GetService("Players").PlayerAdded:Connect(function(player)
	local ok, s = pcall(store.GetAsync, store, tostring(player.UserId))
	s = ok and s or {}
	state[player] = s
	if s.last ~= today() then
		task.wait(3)
		if player.Parent then show:FireClient(player, streakFor(s), REWARDS) end
	end
end)
claim.OnServerInvoke = function(player)
	local s = state[player]
	if not s then return false end
	if s.last == today() then return false end
	local streak = streakFor(s)
	local reward = REWARDS[(streak - 1) % #REWARDS + 1]
	local new = { last = today(), streak = streak }
	if not pcall(store.SetAsync, store, tostring(player.UserId), new) then return false end
	state[player] = new
	currency(player).Value += reward
	return true, reward
end
game:GetService("Players").PlayerRemoving:Connect(function(p) state[p] = nil end)
`;
    const client = `-- Shows the week and claims today's reward.
local gui = script.Parent
local panel = gui:WaitForChild("Panel")
local days, claimBtn = panel:WaitForChild("Days"), panel:WaitForChild("Claim")
local RS = game:GetService("ReplicatedStorage")
local show, claim = RS:WaitForChild("VSDailyShow"), RS:WaitForChild("VSDailyClaim")
local current = 1
show.OnClientEvent:Connect(function(streak, rewards)
	current = (streak - 1) % #rewards + 1
	for i, tile in days:GetChildren() do
		if tile:IsA("Frame") then
			local n = tonumber(string.match(tile.Name, "%d+"))
			tile.Visible = n ~= nil and n <= #rewards
			if n and rewards[n] then tile.Amount.Text = tostring(rewards[n]) end
			tile.BackgroundTransparency = n == current and 0 or 0.55
		end
	end
	panel.Title.Text = "Day " .. streak .. " reward"
	claimBtn.Text = "Claim"
	claimBtn.Active = true
	panel.Visible = true
end)
claimBtn.Activated:Connect(function()
	if not claimBtn.Active then return end
	claimBtn.Active = false
	local ok, good, amount = pcall(claim.InvokeServer, claim)
	claimBtn.Text = (ok and good) and ("+" .. amount .. "!") or "Try later"
	task.wait(1.5)
	panel.Visible = false
end)
panel:WaitForChild("Close").Activated:Connect(function() panel.Visible = false end)
`;
    await wkRun("Daily rewards", `${GS_UI(val("dy-acc") || "#f0b440")}
remote("RemoteEvent", "VSDailyShow")
remote("RemoteFunction", "VSDailyClaim")
script("Script", "VSDaily", game:GetService("ServerScriptService"), ${longStr(server)})
local g = screen("DailyGui")
local p = make("Frame", { Name = "Panel", Size = UDim2.fromScale(0.5, 0.42), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5), BackgroundColor3 = BG, Visible = false }, g)
round(p, UDim.new(0, 16))
make("UIAspectRatioConstraint", { AspectRatio = 2 }, p)
make("UIStroke", { Color = ACC, Thickness = 2 }, p)
label({ Name = "Title", Text = "Daily reward", Size = UDim2.fromScale(0.7, 0.14), Position = UDim2.fromScale(0.05, 0.06), TextXAlignment = Enum.TextXAlignment.Left }, p)
local d = make("Frame", { Name = "Days", Size = UDim2.fromScale(0.9, 0.42), Position = UDim2.fromScale(0.05, 0.26), BackgroundTransparency = 1 }, p)
make("UIGridLayout", { CellSize = UDim2.fromScale(0.13, 0.95), CellPadding = UDim2.fromScale(0.012, 0), SortOrder = Enum.SortOrder.LayoutOrder }, d)
for i = 1, ${rewards.length} do
	local t = make("Frame", { Name = "Day" .. i, LayoutOrder = i, BackgroundColor3 = ACC, BackgroundTransparency = 0.55 }, d)
	round(t)
	label({ Name = "Label", Text = "Day " .. i, Size = UDim2.fromScale(0.9, 0.3), Position = UDim2.fromScale(0.05, 0.08), Font = Enum.Font.Gotham }, t)
	label({ Name = "Amount", Text = "0", Size = UDim2.fromScale(0.9, 0.4), Position = UDim2.fromScale(0.05, 0.48) }, t)
end
button({ Name = "Claim", Text = "Claim", Size = UDim2.fromScale(0.3, 0.16), Position = UDim2.fromScale(0.5, 0.76), AnchorPoint = Vector2.new(0.5, 0) }, p)
button({ Name = "Close", Text = "X", Size = UDim2.fromScale(0.06, 0.12), Position = UDim2.fromScale(0.97, 0.05), AnchorPoint = Vector2.new(1, 0), BackgroundColor3 = MUTE }, p)
script("LocalScript", "Behaviour", g, ${longStr(client)})
game:GetService("Selection"):Set({ g })
return "Built daily rewards (${rewards.length}-day streak)"`, btn);
  },
};

// ── Quests ──────────────────────────────────────────────────────────────────
const QS_KINDS = { stat: "Reach a stat", touch: "Reach a part", event: "An event fires" };
let qsRows = gsList("vs-qs-rows", [{ text: "Collect 100 Coins", kind: "stat", stat: "Coins", n: "100", path: "", event: "", reward: "50" }, { text: "Reach the top of the tower", kind: "touch", stat: "", n: "", path: "", event: "", reward: "100" }]);
const qsSave = () => lsSet("vs-qs-rows", JSON.stringify(qsRows));
WK_TOOLS.quests = {
  name: "Quests", group: "Build", desc: "A quest line: players collect a stat, reach a part or trigger an event, get a reward, and move on to the next. Progress is saved and shown in a tracker.",
  html: () => `
    <div class="wk-grid">${gsField("qs-cur", "Reward currency", lsGet("vs-gs-cur") || "Coins")}${fld("Accent", `<input type="color" id="qs-acc" value="#2fc58b" />`)}</div>
    <div class="mo-list" id="qs-list">${qsRows.map((r, i) => `<div class="mo-row" data-i="${i}"><b class="muted">${i + 1}</b>
      <input class="input sm" data-k="text" value="${esc(r.text)}" placeholder="What the player sees" style="flex-basis:200px" />
      <select class="input sm" data-k="kind">${Object.entries(QS_KINDS).map(([k, t]) => `<option value="${k}"${r.kind === k ? " selected" : ""}>${t}</option>`).join("")}</select>
      ${r.kind === "stat" ? `<input class="input sm" data-k="stat" value="${esc(r.stat)}" placeholder="Coins" /><span class="muted">≥</span><input class="input sm" data-k="n" value="${esc(r.n)}" placeholder="100" />` : ""}
      ${r.kind === "touch" ? `<span class="muted mo-path" title="${esc(r.path)}">${r.path ? esc(r.path.split(".").pop()) : "no part yet"}</span><button class="btn sm" data-act="pick" data-i="${i}">Use selected part</button>` : ""}
      ${r.kind === "event" ? `<input class="input sm" data-k="event" value="${esc(r.event)}" placeholder="ButtonPressed" title="Fire ReplicatedStorage.VSEvents.<name> with the player - Workshop buttons do" />` : ""}
      <span class="muted">reward</span><input class="input sm" data-k="reward" value="${esc(r.reward)}" placeholder="50" style="flex-basis:70px" />
      <button class="link" data-act="del" data-i="${i}" aria-label="Remove">×</button></div>`).join("")}</div>
    <div class="row"><button class="btn sm" data-act="addrow">Add a quest</button><span class="grow"></span><button class="btn primary" data-act="make">Build it</button></div>
    <p class="muted small-p">Makes VSQuests (server) and a QuestGui tracker. "An event fires" listens to ReplicatedStorage.VSEvents.&lt;name&gt; - Interactions buttons fire those, or fire one yourself with the player.</p>`,
  mount() { gsRows("qs-list", qsRows, qsSave, ["kind"], "quests"); },
  async act(a, btn) {
    if (a === "addrow") { qsRows.push({ text: "", kind: "stat", stat: "Coins", n: "100", path: "", event: "", reward: "50" }); qsSave(); wkShow("quests"); return; }
    if (a === "del") { qsRows.splice(Number(btn.dataset.i), 1); qsSave(); wkShow("quests"); return; }
    if (a === "pick") {
      try { const p = (await wkSel()).find((o) => o.part); if (!p) { toast("Select the part in Studio first."); return; } qsRows[Number(btn.dataset.i)].path = p.f; qsSave(); wkShow("quests"); } catch (e) { toast(errText(e)); }
      return;
    }
    const rows = qsRows.filter((r) => String(r.text).trim());
    if (!rows.length) { toast("Add at least one quest."); return; }
    if (rows.some((r) => r.kind === "touch" && !r.path)) { toast("Pick the part for each \"Reach a part\" quest."); return; }
    if (rows.some((r) => r.kind === "event" && !String(r.event).trim())) { toast("Name the event for each \"An event fires\" quest."); return; }
    const cur = gsCur("qs-cur");
    const list = rows.map((r) => `	{ text = ${lq(r.text)}, kind = ${lq(r.kind)}${r.kind === "stat" ? `, stat = ${lq(r.stat || "Coins")}, n = ${lnum(r.n, 100)}` : ""}${r.kind === "touch" ? `, part = ${lq(r.path)}` : ""}${r.kind === "event" ? `, event = ${lq(String(r.event).replace(/[^\w]/g, ""))}` : ""}, reward = ${Math.round(lnum(r.reward, 0, 0))} },`).join("\n");
    const server = `-- VoidScript quests, done in order. kind: "stat" (stat >= n), "touch" (part path),
-- "event" (ReplicatedStorage.VSEvents.<event>:Fire(player)). The player's quest is
-- shown through attributes: QuestText, QuestProgress, QuestNumber.
local QUESTS = {
${list}
}
local CURRENCY = ${lq(cur)}
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("VSQuests")
${GS_CURRENCY}
local at = {}
local function find(path)
	local node = game
	for _, seg in string.split(path, ".") do node = node and node:FindFirstChild(seg) end
	return node ~= game and node or nil
end
local function show(player)
	local q = QUESTS[at[player]]
	player:SetAttribute("QuestNumber", at[player])
	player:SetAttribute("QuestText", q and q.text or "All quests done!")
	local progress = ""
	if q and q.kind == "stat" then
		local stats = player:FindFirstChild("leaderstats")
		local v = stats and stats:FindFirstChild(q.stat)
		progress = (v and math.min(v.Value, q.n) or 0) .. " / " .. q.n
	end
	player:SetAttribute("QuestProgress", progress)
end
local function complete(player, i)
	if at[player] ~= i then return end
	local q = QUESTS[i]
	at[player] = i + 1
	if q.reward > 0 then currency(player).Value += q.reward end
	pcall(store.SetAsync, store, tostring(player.UserId), at[player])
	player:SetAttribute("QuestDone", q.text)
	show(player)
end
local function check(player)
	local i = at[player]
	local q = QUESTS[i]
	if q and q.kind == "stat" then
		local stats = player:FindFirstChild("leaderstats")
		local v = stats and stats:FindFirstChild(q.stat)
		if v and v.Value >= q.n then complete(player, i) check(player) return end
	end
	show(player)
end
Players.PlayerAdded:Connect(function(player)
	local ok, saved = pcall(store.GetAsync, store, tostring(player.UserId))
	at[player] = (ok and tonumber(saved)) or 1
	check(player) -- show the quest straight away
	-- stat quests: follow the leaderstats whenever they appear (another script makes them)
	local function watch(stats)
		local function hook(v) if v:IsA("ValueBase") then v.Changed:Connect(function() check(player) end) end end
		for _, v in stats:GetChildren() do hook(v) end
		stats.ChildAdded:Connect(function(v) hook(v) check(player) end)
		check(player)
	end
	local stats = player:FindFirstChild("leaderstats")
	if stats then watch(stats) end
	player.ChildAdded:Connect(function(c) if c.Name == "leaderstats" then watch(c) end end)
end)
Players.PlayerRemoving:Connect(function(p) at[p] = nil end)
for i, q in QUESTS do
	if q.kind == "touch" then
		local part = find(q.part)
		if part and part:IsA("BasePart") then
			part.Touched:Connect(function(hit)
				local player = Players:GetPlayerFromCharacter(hit.Parent)
				if player then complete(player, i) end
			end)
		else warn("Quests: can't find " .. q.part) end
	elseif q.kind == "event" then
		local RS = game:GetService("ReplicatedStorage")
		local folder = RS:WaitForChild("VSEvents")
		folder:WaitForChild(q.event).Event:Connect(function(player)
			if typeof(player) == "Instance" and player:IsA("Player") then complete(player, i) end
		end)
	end
end
`;
    const client = `-- Shows the current quest (from the player's attributes) and a short
-- "Quest complete" pop when one is done.
local gui = script.Parent
local box = gui:WaitForChild("Tracker")
local title, text, progress = box:WaitForChild("Title"), box:WaitForChild("Text"), box:WaitForChild("Progress")
local player = game:GetService("Players").LocalPlayer
local function draw()
	local n = player:GetAttribute("QuestNumber")
	title.Text = n and ("Quest " .. n) or "Quest"
	text.Text = player:GetAttribute("QuestText") or "..."
	progress.Text = player:GetAttribute("QuestProgress") or ""
end
for _, a in { "QuestText", "QuestProgress", "QuestNumber" } do player:GetAttributeChangedSignal(a):Connect(draw) end
player:GetAttributeChangedSignal("QuestDone"):Connect(function()
	title.Text = "Quest complete!"
	task.wait(2)
	draw()
end)
draw()
`;
    const needEvents = rows.filter((r) => r.kind === "event").map((r) => String(r.event).replace(/[^\w]/g, ""));
    await wkRun("Quests", `${GS_UI(val("qs-acc") || "#2fc58b")}
${needEvents.length ? `local ev = RS:FindFirstChild("VSEvents") or Instance.new("Folder")
ev.Name = "VSEvents" ev.Parent = RS
for _, n in { ${needEvents.map(lq).join(", ")} } do if not ev:FindFirstChild(n) then local b = Instance.new("BindableEvent") b.Name = n b.Parent = ev end end` : ""}
script("Script", "VSQuests", game:GetService("ServerScriptService"), ${longStr(server)})
local g = screen("QuestGui")
local t = make("Frame", { Name = "Tracker", Size = UDim2.fromScale(0.22, 0.13), Position = UDim2.fromScale(0.985, 0.2), AnchorPoint = Vector2.new(1, 0), BackgroundColor3 = BG, BackgroundTransparency = 0.15 }, g)
round(t, UDim.new(0, 12))
make("UIAspectRatioConstraint", { AspectRatio = 2.6 }, t)
make("UIStroke", { Color = ACC, Thickness = 2 }, t)
label({ Name = "Title", Text = "Quest 1", Size = UDim2.fromScale(0.9, 0.26), Position = UDim2.fromScale(0.05, 0.08), TextColor3 = ACC, TextXAlignment = Enum.TextXAlignment.Left }, t)
label({ Name = "Text", Text = "...", Size = UDim2.fromScale(0.9, 0.34), Position = UDim2.fromScale(0.05, 0.36), Font = Enum.Font.Gotham, TextXAlignment = Enum.TextXAlignment.Left }, t)
label({ Name = "Progress", Text = "", Size = UDim2.fromScale(0.9, 0.22), Position = UDim2.fromScale(0.05, 0.72), Font = Enum.Font.Gotham, TextXAlignment = Enum.TextXAlignment.Left, TextTransparency = 0.25 }, t)
script("LocalScript", "Behaviour", g, ${longStr(client)})
game:GetService("Selection"):Set({ g })
return "Built a ${rows.length}-quest line"`, btn);
  },
};

// shared row editing for the list tools
function gsRows(listId, rows, save, rerenderKeys, tool) {
  const onEdit = (e) => {
    const row = e.target.closest(".mo-row"), k = e.target.dataset.k;
    if (!row || !k) return;
    rows[Number(row.dataset.i)][k] = e.target.value;
    save();
    if (rerenderKeys && rerenderKeys.includes(k) && e.type === "change") wkShow(tool);
  };
  $(listId).addEventListener("input", onEdit);
  $(listId).addEventListener("change", onEdit);
}
function gsCur(id) {
  const c = (val(id).trim() || "Coins").replace(/[^\w ]/g, "");
  lsSet("vs-gs-cur", c);
  return c;
}

if (WK_TOOLS[lsGet("vs-wk-tool")]) wkShow(lsGet("vs-wk-tool")); else wkNav();
