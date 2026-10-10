// SPDX-License-Identifier: GPL-3.0-or-later
// workshop5.js - Workshop: Monetization and Badges; chat commands /selection,
// /errors and /test.
"use strict";

// ── Monetization: gamepasses and dev products, granted safely ───────────────
const MO_PERKS = { coins2x: "2× coins", speed: "Faster walking", jump: "Higher jumps", tool: "A tool from ServerStorage", vip: "VIP tag" };
let moRows = [];
try { moRows = JSON.parse(lsGet("vs-mo-rows") || "[]"); } catch {}
if (!moRows.length) moRows = [{ kind: "pass", id: "", name: "VIP", perk: "vip", value: "" }, { kind: "product", id: "", name: "100 Coins", perk: "", value: "100" }];
const moSave = () => lsSet("vs-mo-rows", JSON.stringify(moRows));
function moRowHtml(r, i) {
  const perk = r.kind === "pass"
    ? `<select class="input sm" data-k="perk">${Object.entries(MO_PERKS).map(([k, t]) => `<option value="${k}"${r.perk === k ? " selected" : ""}>${t}</option>`).join("")}</select>
       <input class="input sm" data-k="value" value="${esc(r.value)}" placeholder="${r.perk === "speed" ? "walk speed, e.g. 24" : r.perk === "jump" ? "jump power, e.g. 75" : r.perk === "tool" ? "tool name in ServerStorage" : r.perk === "vip" ? "(no setting)" : "(no setting)"}" ${["coins2x", "vip"].includes(r.perk) ? "disabled" : ""} />`
    : `<span class="muted">gives</span><input class="input sm" data-k="value" value="${esc(r.value)}" placeholder="100" /><span class="muted">of the currency</span>`;
  return `<div class="mo-row" data-i="${i}"><select class="input sm" data-k="kind"><option value="pass"${r.kind === "pass" ? " selected" : ""}>Gamepass</option><option value="product"${r.kind === "product" ? " selected" : ""}>Dev product</option></select>
    <input class="input sm mo-id" data-k="id" value="${esc(r.id)}" placeholder="ID" inputmode="numeric" />
    <input class="input sm" data-k="name" value="${esc(r.name)}" placeholder="Name" />${perk}
    <button class="link" data-act="del" data-i="${i}" aria-label="Remove">×</button></div>`;
}
WK_TOOLS.money = {
  name: "Monetization", group: "Build", desc: "Gamepasses and dev products done right: perks given on join and on purchase, dev products never granted twice, and a helper your shop buttons can call.",
  html: () => `
    ${fld("Currency (leaderstat)", `<input class="input" id="mo-stat" value="${esc(lsGet("vs-mo-stat") || "Coins")}" maxlength="30" />`)}
    <div class="mo-list" id="mo-list">${moRows.map(moRowHtml).join("")}</div>
    <div class="row"><button class="btn sm" data-act="addrow">Add a gamepass or product</button><span class="grow"></span><button class="btn primary" data-act="make">Write the scripts</button></div>
    <p class="muted small-p">Makes <b>VSMonetization</b> (a Script in ServerScriptService) and <b>Shop</b> (a ModuleScript in ReplicatedStorage): from a LocalScript, <code>require(game.ReplicatedStorage.Shop).buyPass(id)</code> or <code>.buyProduct(id)</code>. Coins only last between visits if your game saves them (Toolkit › Leaderstats + saving).</p>`,
  mount() {
    const box = $("mo-list");
    const onEdit = (e) => {
      const row = e.target.closest(".mo-row"), k = e.target.dataset.k;
      if (!row || !k) return;
      moRows[Number(row.dataset.i)][k] = e.target.value;
      moSave();
      if (k === "kind" || k === "perk") wkShow("money");
    };
    box.addEventListener("input", onEdit);
    box.addEventListener("change", onEdit);
    $("mo-stat").onchange = (e) => lsSet("vs-mo-stat", e.target.value.trim() || "Coins");
  },
  async act(a, btn) {
    if (a === "addrow") { moRows.push({ kind: "pass", id: "", name: "", perk: "coins2x", value: "" }); moSave(); wkShow("money"); return; }
    if (a === "del") { moRows.splice(Number(btn.dataset.i), 1); moSave(); wkShow("money"); return; }
    const rows = moRows.filter((r) => /^\d+$/.test(String(r.id).trim()));
    if (!rows.length) { toast("Add at least one gamepass or product ID (the number from the Creator Dashboard)."); return; }
    const stat = (val("mo-stat").trim() || "Coins").replace(/[^\w ]/g, "");
    const passes = rows.filter((r) => r.kind === "pass").map((r) => `	[${r.id.trim()}] = { name = ${lq(r.name || "Pass " + r.id)}, perk = ${lq(r.perk)}, value = ${r.perk === "tool" ? lq(r.value) : lnum(r.value, r.perk === "jump" ? 75 : 24)} },`).join("\n");
    const products = rows.filter((r) => r.kind === "product").map((r) => `	[${r.id.trim()}] = { name = ${lq(r.name || "Product " + r.id)}, amount = ${Math.round(lnum(r.value, 100, 1))} },`).join("\n");
    const server = `-- VoidScript monetization. Edit the lists below; IDs come from the Creator Dashboard.
-- perk: "coins2x", "speed" (value = walk speed), "jump" (value = jump power),
--       "tool" (value = name of a Tool in ServerStorage), "vip" (adds a [VIP] tag)
local PASSES = {
${passes}
}
local PRODUCTS = {
${products}
}
local CURRENCY = ${lq(stat)}

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local history = DataStoreService:GetDataStore("VSPurchaseHistory")

local function currency(player)
	local stats = player:FindFirstChild("leaderstats") or Instance.new("Folder")
	stats.Name = "leaderstats"
	stats.Parent = player
	local v = stats:FindFirstChild(CURRENCY)
	if not v then v = Instance.new("IntValue") v.Name = CURRENCY v.Parent = stats end
	return v
end

local function onCharacter(player, fn)
	if player.Character then task.spawn(fn, player.Character) end
	player.CharacterAdded:Connect(fn)
end

local function givePerk(player, pass)
	if player:GetAttribute("Pass_" .. pass.name) then return end
	player:SetAttribute("Pass_" .. pass.name, true)
	if pass.perk == "coins2x" then
		player:SetAttribute("CoinMultiplier", 2) -- multiply rewards by this in your own scripts
	elseif pass.perk == "speed" then
		onCharacter(player, function(c) c:WaitForChild("Humanoid").WalkSpeed = pass.value end)
	elseif pass.perk == "jump" then
		onCharacter(player, function(c) local h = c:WaitForChild("Humanoid") h.UseJumpPower = true h.JumpPower = pass.value end)
	elseif pass.perk == "tool" then
		local tool = game:GetService("ServerStorage"):FindFirstChild(pass.value)
		if tool then
			onCharacter(player, function()
				local bp = player:WaitForChild("Backpack")
				if not bp:FindFirstChild(tool.Name) then tool:Clone().Parent = bp end
			end)
		else warn("Monetization: no tool called " .. tostring(pass.value) .. " in ServerStorage") end
	elseif pass.perk == "vip" then
		player:SetAttribute("VIP", true)
	end
end

Players.PlayerAdded:Connect(function(player)
	for id, pass in PASSES do
		task.spawn(function()
			local ok, owns = pcall(MarketplaceService.UserOwnsGamePassAsync, MarketplaceService, player.UserId, id)
			if ok and owns then givePerk(player, pass) end
		end)
	end
end)

MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, id, bought)
	if bought and PASSES[id] then givePerk(player, PASSES[id]) end
end)

-- Dev products: Roblox may call this more than once for the same purchase, so
-- each purchase is written down and never granted twice.
MarketplaceService.ProcessReceipt = function(info)
	local key = info.PlayerId .. "_" .. info.PurchaseId
	local ok, done = pcall(history.GetAsync, history, key)
	if ok and done then return Enum.ProductPurchaseDecision.PurchaseGranted end
	if not ok then return Enum.ProductPurchaseDecision.NotProcessedYet end
	local player = Players:GetPlayerByUserId(info.PlayerId)
	local product = PRODUCTS[info.ProductId]
	if not player or not product then return Enum.ProductPurchaseDecision.NotProcessedYet end
	local saved = pcall(history.SetAsync, history, key, true)
	if not saved then return Enum.ProductPurchaseDecision.NotProcessedYet end
	currency(player).Value += product.amount
	return Enum.ProductPurchaseDecision.PurchaseGranted
end
`;
    const shop = `-- From any LocalScript:
--   local Shop = require(game.ReplicatedStorage.Shop)
--   buyButton.Activated:Connect(function() Shop.buyPass(123456) end)
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local Shop = {}
function Shop.buyPass(id) MarketplaceService:PromptGamePassPurchase(Players.LocalPlayer, id) end
function Shop.buyProduct(id) MarketplaceService:PromptProductPurchase(Players.LocalPlayer, id) end
function Shop.owns(name) return Players.LocalPlayer:GetAttribute("Pass_" .. name) == true end
return Shop
`;
    await wkRun("Monetization", `local SSS, RS = game:GetService("ServerScriptService"), game:GetService("ReplicatedStorage")
local s = SSS:FindFirstChild("VSMonetization") or Instance.new("Script")
s.Name = "VSMonetization"
s.Source = ${longStr(server)}
s.Parent = SSS
local m = RS:FindFirstChild("Shop") or Instance.new("ModuleScript")
m.Name = "Shop"
m.Source = ${longStr(shop)}
m.Parent = RS
return "Wrote VSMonetization and the Shop module - turn on Game Settings › Security › Enable Studio Access to API Services to test dev products in Studio"`, btn);
  },
};

// ── Badges ──────────────────────────────────────────────────────────────────
let bgRows = [];
try { bgRows = JSON.parse(lsGet("vs-bg-rows") || "[]"); } catch {}
if (!bgRows.length) bgRows = [{ id: "", when: "join", n: "", path: "", stat: "Coins" }];
const bgSave = () => lsSet("vs-bg-rows", JSON.stringify(bgRows));
const BG_WHEN = { join: "joins the game", touch: "touches a part", minutes: "plays for minutes", stat: "reaches a stat" };
WK_TOOLS.badges = {
  name: "Badges", group: "Build", desc: "Award badges when a player joins, touches a part (a finish line, a secret room), plays for a while, or reaches a stat.",
  html: () => `
    <div class="mo-list" id="bg-list">${bgRows.map((r, i) => `<div class="mo-row" data-i="${i}">
      <input class="input sm mo-id" data-k="id" value="${esc(r.id)}" placeholder="Badge ID" inputmode="numeric" />
      <span class="muted">when the player</span>
      <select class="input sm" data-k="when">${Object.entries(BG_WHEN).map(([k, t]) => `<option value="${k}"${r.when === k ? " selected" : ""}>${t}</option>`).join("")}</select>
      ${r.when === "touch" ? `<span class="muted mo-path" title="${esc(r.path)}">${r.path ? esc(r.path.split(".").pop()) : "no part yet"}</span><button class="btn sm" data-act="pick" data-i="${i}">Use selected part</button>` : ""}
      ${r.when === "minutes" ? `<input class="input sm" data-k="n" value="${esc(r.n)}" placeholder="10" /><span class="muted">min</span>` : ""}
      ${r.when === "stat" ? `<input class="input sm" data-k="stat" value="${esc(r.stat)}" placeholder="Coins" /><span class="muted">≥</span><input class="input sm" data-k="n" value="${esc(r.n)}" placeholder="1000" />` : ""}
      <button class="link" data-act="del" data-i="${i}" aria-label="Remove">×</button></div>`).join("")}</div>
    <div class="row"><button class="btn sm" data-act="addrow">Add a badge</button><span class="grow"></span><button class="btn primary" data-act="make">Write the script</button></div>
    <p class="muted small-p">Makes <b>VSBadges</b> in ServerScriptService. Players who already own a badge aren't given it again.</p>`,
  mount() {
    const onEdit = (e) => {
      const row = e.target.closest(".mo-row"), k = e.target.dataset.k;
      if (!row || !k) return;
      bgRows[Number(row.dataset.i)][k] = e.target.value;
      bgSave();
      if (k === "when") wkShow("badges");
    };
    $("bg-list").addEventListener("input", onEdit);
    $("bg-list").addEventListener("change", onEdit);
  },
  async act(a, btn) {
    if (a === "addrow") { bgRows.push({ id: "", when: "join", n: "", path: "", stat: "Coins" }); bgSave(); wkShow("badges"); return; }
    if (a === "del") { bgRows.splice(Number(btn.dataset.i), 1); bgSave(); wkShow("badges"); return; }
    if (a === "pick") {
      try {
        const sel = await wkSel();
        const p = sel.find((o) => o.part);
        if (!p) { toast("Select the part in Studio first."); return; }
        bgRows[Number(btn.dataset.i)].path = p.f;
        bgSave(); wkShow("badges");
      } catch (e) { toast(errText(e)); }
      return;
    }
    const rows = bgRows.filter((r) => /^\d+$/.test(String(r.id).trim()));
    if (!rows.length) { toast("Add at least one badge ID."); return; }
    if (rows.some((r) => r.when === "touch" && !r.path)) { toast("Pick the part for each \"touches a part\" badge."); return; }
    const list = rows.map((r) => `	{ id = ${r.id.trim()}, when = ${lq(r.when)}${r.when === "touch" ? `, part = ${lq(r.path)}` : ""}${r.when === "minutes" ? `, minutes = ${lnum(r.n, 10, 0.1)}` : ""}${r.when === "stat" ? `, stat = ${lq(r.stat || "Coins")}, at = ${lnum(r.n, 1000)}` : ""} },`).join("\n");
    const src = `-- VoidScript badges. when: "join", "touch" (part = its path), "minutes", "stat" (stat + at).
local BADGES = {
${list}
}
local BadgeService = game:GetService("BadgeService")
local Players = game:GetService("Players")
local given = {}
local function award(player, id)
	local key = player.UserId .. ":" .. id
	if given[key] then return end
	given[key] = true
	task.spawn(function()
		local ok, has = pcall(BadgeService.UserHasBadgeAsync, BadgeService, player.UserId, id)
		if ok and not has then
			local awarded, err = pcall(BadgeService.AwardBadge, BadgeService, player.UserId, id)
			if not awarded then warn("Badge " .. id .. " wasn't awarded: " .. tostring(err)) given[key] = nil end
		end
	end)
end
local function find(path)
	local node = game
	for _, seg in string.split(path, ".") do node = node and node:FindFirstChild(seg) end
	return node ~= game and node or nil
end
for _, b in BADGES do
	if b.when == "touch" then
		local part = find(b.part)
		if part and part:IsA("BasePart") then
			part.Touched:Connect(function(hit)
				local player = Players:GetPlayerFromCharacter(hit.Parent)
				if player then award(player, b.id) end
			end)
		else warn("Badges: can't find " .. b.part) end
	end
end
Players.PlayerAdded:Connect(function(player)
	for _, b in BADGES do
		if b.when == "join" then award(player, b.id)
		elseif b.when == "minutes" then
			task.delay(b.minutes * 60, function() if player.Parent then award(player, b.id) end end)
		elseif b.when == "stat" then
			task.spawn(function()
				local v = player:WaitForChild("leaderstats", 30)
				v = v and v:WaitForChild(b.stat, 30)
				if not v then return end
				local function check() if v.Value >= b.at then award(player, b.id) end end
				v.Changed:Connect(check)
				check()
			end)
		end
	end
end)
Players.PlayerRemoving:Connect(function(player)
	for key in given do if string.sub(key, 1, #tostring(player.UserId) + 1) == player.UserId .. ":" then given[key] = nil end end
end)
`;
    await wkRun("Badges", `local SSS = game:GetService("ServerScriptService")
local s = SSS:FindFirstChild("VSBadges") or Instance.new("Script")
s.Name = "VSBadges"
s.Source = ${longStr(src)}
s.Parent = SSS
return "Wrote VSBadges with ${rows.length} badge(s)"`, btn);
  },
};

// ── chat: /selection, /errors, /test ────────────────────────────────────────
function chatAppend(text) {
  go("chat");
  input.value = (input.value.trim() ? input.value.trim() + "\n\n" : "") + text;
  grow();
  input.focus();
}
const SEL_CTX = `local sel = game:GetService("Selection"):Get()
if #sel == 0 then return "ERR:Select something in Studio first." end
local out = {}
for i, o in sel do
	if i > 8 then table.insert(out, "...and " .. (#sel - 8) .. " more") break end
	local parts, scripts = 0, 0
	local list = o:GetDescendants()
	table.insert(list, o)
	for _, d in list do if d:IsA("BasePart") then parts += 1 elseif d:IsA("LuaSourceContainer") then scripts += 1 end end
	local size = ""
	if o:IsA("Model") then local s = o:GetExtentsSize() size = string.format(", %.0f x %.0f x %.0f studs", s.X, s.Y, s.Z)
	elseif o:IsA("BasePart") then size = string.format(", %.1f x %.1f x %.1f studs", o.Size.X, o.Size.Y, o.Size.Z) end
	table.insert(out, "- " .. o:GetFullName() .. " (" .. o.ClassName .. (parts > 1 and (", " .. parts .. " parts") or "") .. (scripts > 0 and (", " .. scripts .. " scripts") or "") .. size .. ")")
end
return table.concat(out, "\\n")`;
SLASH.push(
  ["/selection", "Add what's selected in Studio to your message", async () => {
    try { chatAppend("Work on what I have selected in Roblox Studio:\n" + (await stLuau(SEL_CTX))); } catch (e) { toast(errText(e), 5000); }
  }],
  ["/errors", "Add Studio's latest errors to your message", async () => {
    try {
      const out = String(await callTool("get_console_output", {}, 20000));
      const errs = [...new Set(out.split("\n").map((l) => l.trim()).filter((l) => ptKind(l) === "err"))].slice(-15);
      if (!errs.length) { toast("No errors in Studio's Output."); return; }
      chatAppend("These errors are in Roblox Studio's Output. Find the cause and fix them:\n" + errs.join("\n"));
    } catch (e) { toast(errText(e), 5000); }
  }],
  ["/test", "Play for 10 seconds and add any new errors", async () => {
    const n = pt.runs.length;
    await ptTest();
    const r = pt.runs[0];
    if (pt.runs.length > n && r.errors.length) chatAppend(`I played the game for ${r.secs} seconds and got these errors. Find the cause and fix them:\n` + r.errors.join("\n"));
    else go("chat");
  }],
);

if (WK_TOOLS[lsGet("vs-wk-tool")]) wkShow(lsGet("vs-wk-tool")); else wkNav();
