// SPDX-License-Identifier: GPL-3.0-or-later
// workshop.js - the Workshop page: small tools that build and check things in
// the open place. Each tool reads what's selected in Studio, shows its settings
// here, and changes the place with one Luau script wrapped in an undo waypoint
// (one Ctrl+Z in Studio). Uses stLuau / luaStr from studiotools.js.
"use strict";

// ── shared bits ─────────────────────────────────────────────────────────────
// The selection, with an index path for each thing so later edits find it again.
const WK_SEL = `local HS = game:GetService("HttpService")
local function idx(o)
	local p = {}
	while o and o.Parent ~= game do table.insert(p, 1, table.find(o.Parent:GetChildren(), o)) o = o.Parent end
	if not o then return nil end
	table.insert(p, 1, o.ClassName)
	return p
end
local out = {}
for i, o in game:GetService("Selection"):Get() do
	if i > 60 then break end
	table.insert(out, { n = o.Name, c = o.ClassName, f = o:GetFullName(), p = idx(o), part = o:IsA("BasePart"), hum = o:FindFirstChildWhichIsA("Humanoid") ~= nil })
end
return HS:JSONEncode({ sel = out })`;
const WK_RESOLVE = `local HS = game:GetService("HttpService")
local function resolve(p)
	if not p then return nil end
	local ok, n = pcall(game.GetService, game, p[1])
	if not ok then return nil end
	for i = 2, #p do n = n and n:GetChildren()[p[i]] end
	return n
end
`;
// A Lua string literal that's also safe inside a [==[ ]==] block.
const lq = (s) => JSON.stringify(String(s == null ? "" : s).replace(/\]=*\]/g, "] ]"));
const lnum = (v, d, lo, hi) => { let n = Number(v); if (!Number.isFinite(n)) n = d; if (lo != null) n = Math.max(lo, n); if (hi != null) n = Math.min(hi, n); return n; };
const val = (id) => ($(id) ? $(id).value : "");
const chk = (id) => !!($(id) && $(id).checked);
// A script's source inside a Luau long string (the leading newline is eaten by Lua).
const longStr = (src) => `[==[\n${String(src).replace(/\]==\]/g, "] ==]")}]==]`;
async function wkSel() {
  const r = stJSON(await stLuau(WK_SEL));
  return r.sel || [];
}
const assetId = (s) => { const m = String(s || "").match(/\d{3,}/); return m ? "rbxassetid://" + m[0] : ""; };
async function wkRun(label, body, btn, okNote) {
  const was = btn && btn.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "Working…"; }
  try {
    const out = await stLuau(stUndoable(label, body), 90000);
    toast(out + (okNote === false ? "" : ". Ctrl+Z in Studio undoes it."), 5000); sfx("done");
    return out;
  } catch (e) {
    toast(/timed out|timeout/i.test(errText(e)) ? "Studio didn't answer in time - check Studio before trying again, it may have done it." : errText(e), 7000);
    sfx("error");
    return null;
  } finally { if (btn) { btn.disabled = false; btn.textContent = was; } }
}
const fld = (label, input, hint) => `<label class="wk-f"><span>${label}${hint ? ` <em>${hint}</em>` : ""}</span>${input}</label>`;
const seg = (id, opts, on) => `<div class="seg sm" id="${id}">${opts.map(([v, t]) => `<button data-v="${v}" class="${v === on ? "on" : ""}">${t}</button>`).join("")}</div>`;
const segVal = (id) => { const b = $(id) && $(id).querySelector("button.on"); return b ? b.dataset.v : ""; };
document.addEventListener("click", (e) => {
  const b = e.target.closest("#wk-panel .seg button");
  if (!b) return;
  b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  const t = WK_TOOLS[wk.tool];
  if (t && t.onSeg) t.onSeg(b.parentElement.id, b.dataset.v);
});
const wk = { tool: "interact" };

// ════════════════════════════════════════════════════════════════════════════
const WK_TOOLS = {};

// ── Interaction builder ─────────────────────────────────────────────────────
const IX_DEF = { door: "Open", chest: "Open", button: "Press", npc: "Talk" };
const IX_SCRIPTS = {
  door: (o) => `-- VoidScript interaction: door. Change the settings below.
local SETTINGS = { cooldown = ${o.cooldown}, mode = ${lq(o.mode)}, openFor = ${o.openFor} }
local TweenService = game:GetService("TweenService")
local door = script.Parent
local host = door:IsA("BasePart") and door or door:FindFirstChildWhichIsA("BasePart", true)
local prompt = host:WaitForChild("VSPrompt")
local sound = host:FindFirstChild("VSSound")
local closed = door:GetPivot()
local size = door:IsA("Model") and door:GetExtentsSize() or door.Size
local isOpen, busy = false, false
local function move(to)
	local v = Instance.new("CFrameValue")
	v.Value = door:GetPivot()
	v.Changed:Connect(function(c) door:PivotTo(c) end)
	local t = TweenService:Create(v, TweenInfo.new(0.6, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Value = to })
	t:Play()
	t.Completed:Wait()
	v:Destroy()
end
local function openAt()
	if SETTINGS.mode == "slide" then return closed * CFrame.new(size.X * 0.95, 0, 0) end
	local hinge = closed * CFrame.new(-size.X / 2, 0, 0)
	return hinge * CFrame.Angles(0, math.rad(90), 0) * CFrame.new(size.X / 2, 0, 0)
end
local function set(open)
	isOpen = open
	prompt.ActionText = open and "Close" or "Open"
	if sound then sound:Play() end
	move(open and openAt() or closed)
end
prompt.Triggered:Connect(function()
	if busy then return end
	busy = true
	set(not isOpen)
	if isOpen and SETTINGS.openFor > 0 then
		task.delay(SETTINGS.openFor, function() if isOpen and not busy then set(false) end end)
	end
	task.wait(SETTINGS.cooldown)
	busy = false
end)
`,
  chest: (o) => `-- VoidScript interaction: chest that gives a reward. Change the settings below.
local SETTINGS = { cooldown = ${o.cooldown}, reward = ${o.reward}, stat = ${lq(o.stat)}, oncePerPlayer = ${o.once} }
local Players = game:GetService("Players")
local chest = script.Parent
local host = chest:IsA("BasePart") and chest or chest:FindFirstChildWhichIsA("BasePart", true)
local prompt = host:WaitForChild("VSPrompt")
local sound = host:FindFirstChild("VSSound")
local last, claimed = {}, {}
prompt.Triggered:Connect(function(player)
	local id = player.UserId
	if SETTINGS.oncePerPlayer and claimed[id] then return end
	if last[id] and os.clock() - last[id] < SETTINGS.cooldown then return end
	last[id], claimed[id] = os.clock(), true
	local stats = player:FindFirstChild("leaderstats")
	if not stats then stats = Instance.new("Folder") stats.Name = "leaderstats" stats.Parent = player end
	local v = stats:FindFirstChild(SETTINGS.stat)
	if not v then v = Instance.new("IntValue") v.Name = SETTINGS.stat v.Parent = stats end
	v.Value += SETTINGS.reward
	if sound then sound:Play() end
end)
Players.PlayerRemoving:Connect(function(p) last[p.UserId] = nil end)
`,
  button: (o) => `-- VoidScript interaction: button. Other scripts listen with
-- game.ReplicatedStorage.VSEvents.${o.event}.Event:Connect(function(player, button) ... end)
local SETTINGS = { cooldown = ${o.cooldown}, event = ${lq(o.event)} }
local TweenService = game:GetService("TweenService")
local button = script.Parent
local host = button:IsA("BasePart") and button or button:FindFirstChildWhichIsA("BasePart", true)
local prompt = host:WaitForChild("VSPrompt")
local sound = host:FindFirstChild("VSSound")
local event = game:GetService("ReplicatedStorage"):WaitForChild("VSEvents"):WaitForChild(SETTINGS.event)
local busy = false
prompt.Triggered:Connect(function(player)
	if busy then return end
	busy = true
	if sound then sound:Play() end
	local up = host.CFrame
	TweenService:Create(host, TweenInfo.new(0.08), { CFrame = up * CFrame.new(0, -0.15, 0) }):Play()
	task.delay(0.15, function() TweenService:Create(host, TweenInfo.new(0.12), { CFrame = up }):Play() end)
	event:Fire(player, button)
	task.wait(SETTINGS.cooldown)
	busy = false
end)
`,
  npc: (o) => `-- VoidScript interaction: talking NPC. Change the lines below.
local SETTINGS = { cooldown = ${o.cooldown}, secondsPerLine = ${o.secs}, lines = { ${o.lines.map(lq).join(", ")} } }
local npc = script.Parent
local host = npc:IsA("BasePart") and npc or npc:FindFirstChildWhichIsA("BasePart", true)
local head = npc:FindFirstChild("Head") or host
local prompt = host:WaitForChild("VSPrompt")
local sound = host:FindFirstChild("VSSound")
local busy = false
prompt.Triggered:Connect(function()
	if busy then return end
	busy = true
	prompt.Enabled = false
	if sound then sound:Play() end
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(280, 76)
	gui.StudsOffset = Vector3.new(0, 3.2, 0)
	gui.MaxDistance = 70
	gui.Adornee = head
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundColor3 = Color3.new(1, 1, 1)
	label.TextColor3 = Color3.fromRGB(25, 25, 30)
	label.Font = Enum.Font.GothamMedium
	label.TextScaled = true
	label.TextWrapped = true
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft, pad.PaddingRight, pad.PaddingTop, pad.PaddingBottom = UDim.new(0, 10), UDim.new(0, 10), UDim.new(0, 6), UDim.new(0, 6)
	pad.Parent = label
	Instance.new("UICorner").Parent = label
	label.Parent = gui
	gui.Parent = head
	for _, line in SETTINGS.lines do
		label.Text = line
		task.wait(SETTINGS.secondsPerLine)
	end
	gui:Destroy()
	task.wait(SETTINGS.cooldown)
	prompt.Enabled = true
	busy = false
end)
`,
};
WK_TOOLS.interact = {
  name: "Interactions", group: "Build", desc: "Turn the selected door, chest, button or NPC into something players can use, with a prompt, cooldown and sound.",
  html: () => `
    ${fld("What is it", seg("ix-type", [["door", "Door"], ["chest", "Chest"], ["button", "Button"], ["npc", "NPC"]], "door"))}
    <div class="wk-grid">
      ${fld("Prompt text", `<input class="input" id="ix-text" value="Open" maxlength="30" />`)}
      ${fld("Hold for", `<input class="input" id="ix-hold" type="number" min="0" max="10" step="0.1" value="0" />`, "seconds")}
      ${fld("Cooldown", `<input class="input" id="ix-cd" type="number" min="0" max="3600" step="0.5" value="1" />`, "seconds")}
      ${fld("Reach", `<input class="input" id="ix-reach" type="number" min="4" max="60" value="10" />`, "studs")}
      ${fld("Sound", `<input class="input" id="ix-sound" placeholder="rbxassetid://… (optional)" />`)}
    </div>
    <div class="wk-sub" data-ix="door">${fld("Opens by", seg("ix-mode", [["swing", "Swinging"], ["slide", "Sliding"]], "swing"))}${fld("Closes again after", `<input class="input" id="ix-open" type="number" min="0" max="600" value="4" />`, "seconds, 0 = stays open")}</div>
    <div class="wk-sub" data-ix="chest" hidden><div class="wk-grid">${fld("Reward", `<input class="input" id="ix-reward" type="number" min="1" value="50" />`)}${fld("Leaderstat", `<input class="input" id="ix-stat" value="Coins" maxlength="30" />`)}</div><label class="chk"><input type="checkbox" id="ix-once" checked /> Each player can open it once</label></div>
    <div class="wk-sub" data-ix="button" hidden>${fld("Event name", `<input class="input" id="ix-event" value="ButtonPressed" maxlength="40" />`, "other scripts listen to ReplicatedStorage.VSEvents.&lt;name&gt;")}</div>
    <div class="wk-sub" data-ix="npc" hidden>${fld("What they say", `<textarea class="input" id="ix-lines" rows="3">Hi there, traveller!\nThe castle is past the bridge.</textarea>`, "one line each")}${fld("Seconds per line", `<input class="input" id="ix-secs" type="number" min="1" max="15" value="3" />`)}</div>
    <div class="row"><button class="btn primary" data-act="add">Add to the selected thing</button></div>
    <p class="muted small-p">Adds a ProximityPrompt and a Script called VSInteraction to it. Running it again replaces the old one.</p>`,
  onSeg(id, v) {
    if (id !== "ix-type") return;
    document.querySelectorAll("[data-ix]").forEach((x) => { x.hidden = x.dataset.ix !== v; });
    $("ix-text").value = IX_DEF[v];
  },
  async act(a, btn) {
    if (a !== "add") return;
    const type = segVal("ix-type");
    const sel = await wkSel().catch((e) => { toast(errText(e)); return null; });
    if (!sel) return;
    if (!sel.length) { toast("Select the door, chest, button or NPC in Studio first."); return; }
    const o = {
      cooldown: lnum(val("ix-cd"), 1, 0, 3600), mode: segVal("ix-mode") || "swing", openFor: lnum(val("ix-open"), 4, 0, 600),
      reward: Math.round(lnum(val("ix-reward"), 50, 1)), stat: val("ix-stat").trim().replace(/[^\w ]/g, "") || "Coins", once: chk("ix-once"),
      event: val("ix-event").trim().replace(/[^\w]/g, "") || "ButtonPressed",
      lines: val("ix-lines").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 12), secs: lnum(val("ix-secs"), 3, 1, 15),
    };
    if (type === "npc" && !o.lines.length) { toast("Give the NPC something to say."); return; }
    const src = IX_SCRIPTS[type](o);
    await wkRun("Interaction", `${WK_RESOLVE}
local target = resolve(HS:JSONDecode(${lq(JSON.stringify(sel[0].p))}))
if not target then return "ERR:It moved - select it again." end
local host = target:IsA("BasePart") and target or target:FindFirstChildWhichIsA("BasePart", true)
if not host then return "ERR:Select a part, or a model with parts in it." end
for _, name in { "VSPrompt", "VSSound" } do local old = host:FindFirstChild(name) if old then old.Parent = nil end end
local oldScript = target:FindFirstChild("VSInteraction") if oldScript then oldScript.Parent = nil end
local pr = Instance.new("ProximityPrompt")
pr.Name = "VSPrompt"
pr.ActionText = ${lq(val("ix-text").trim() || IX_DEF[type])}
pr.ObjectText = target.Name
pr.HoldDuration = ${lnum(val("ix-hold"), 0, 0, 10)}
pr.MaxActivationDistance = ${lnum(val("ix-reach"), 10, 4, 60)}
pr.RequiresLineOfSight = false
pr.Parent = host
local snd = ${lq(assetId(val("ix-sound")))}
if snd ~= "" then local s = Instance.new("Sound") s.Name = "VSSound" s.SoundId = snd s.Parent = host end
${type === "button" ? `local RS = game:GetService("ReplicatedStorage")
local f = RS:FindFirstChild("VSEvents") or Instance.new("Folder")
f.Name = "VSEvents" f.Parent = RS
if not f:FindFirstChild(${lq(o.event)}) then local ev = Instance.new("BindableEvent") ev.Name = ${lq(o.event)} ev.Parent = f end` : ""}
${type === "door" ? `if target:IsA("BasePart") then target.Anchored = true end` : ""}
local sc = Instance.new("Script")
sc.Name = "VSInteraction"
sc.Source = ${longStr(src)}
sc.Parent = target
return "Made " .. target.Name .. " a ${type === "npc" ? "talking NPC" : type}"`, btn);
  },
};

// ── Sequencer: GUI transitions, moving parts, camera shots, effects ─────────
const SQ_KINDS = {
  move: ["Move by (studs)", "0, 5, 0"], turn: ["Turn (degrees)", "90"], fade: ["Fade to", "1"], color: ["Colour to", "#ff4d4d"],
  guimove: ["Slide GUI to (scale x, y)", "0.5, 0.5"], camera: ["Camera to this", ""], camback: ["Camera back to player", ""], effect: ["Effects", "on"],
};
const sq = { steps: [], trigger: "start", event: "PlayCutscene", name: "Sequence" };
function sqTotal() { return Math.max(1, ...sq.steps.map((s) => Number(s.t) + Number(s.d))); }
function sqRender() {
  const box = $("sq-steps");
  if (!box) return;
  const total = sqTotal();
  box.innerHTML = sq.steps.length ? sq.steps.map((s, i) => `
    <div class="sq-step" data-i="${i}">
      <div class="sq-row">
        <b title="${esc(s.path)}">${esc(s.name)}</b>
        <select class="input sm" data-k="kind">${Object.entries(SQ_KINDS).filter(([k]) => (s.gui ? !["move", "turn", "camera"].includes(k) : k !== "guimove")).map(([k, [t]]) => `<option value="${k}"${k === s.kind ? " selected" : ""}>${t}</option>`).join("")}</select>
        <input class="input sm" data-k="v" value="${esc(s.v)}" ${["camera", "camback"].includes(s.kind) ? "hidden" : ""} />
        <label>at <input class="input sm num" type="number" min="0" step="0.1" data-k="t" value="${s.t}" />s</label>
        <label>for <input class="input sm num" type="number" min="0" step="0.1" data-k="d" value="${s.d}" />s</label>
        <select class="input sm" data-k="ease">${["Quad", "Sine", "Linear", "Back", "Bounce", "Elastic", "Exponential"].map((e) => `<option${e === s.ease ? " selected" : ""}>${e}</option>`).join("")}</select>
        <button class="link" data-act="del" data-i="${i}" aria-label="Remove step">×</button>
      </div>
      <div class="sq-bar"><i style="left:${(s.t / total) * 100}%;width:${Math.max(1.5, (s.d / total) * 100)}%"></i></div>
    </div>`).join("") + `<div class="sq-ruler">${Array.from({ length: Math.min(11, Math.ceil(total) + 1) }, (_, k) => `<span style="left:${((k * total) / Math.min(10, Math.ceil(total))) / total * 100}%">${Math.round((k * total) / Math.min(10, Math.ceil(total)) * 10) / 10}s</span>`).join("")}</div>`
    : '<p class="muted small-p">Select a part, model, GUI element or effect in Studio and press Add step.</p>';
}
WK_TOOLS.sequence = {
  name: "Sequencer", group: "Build", desc: "Line up GUI transitions, moving parts, camera shots and effects on a timeline, then get the script that plays it.",
  html: () => `
    <div class="row"><button class="btn" data-act="addstep">Add step for selection</button><span class="grow"></span>
      ${seg("sq-trig", [["start", "When the game starts"], ["event", "On an event"], ["loop", "Loop forever"]], sq.trigger)}</div>
    <div class="wk-grid">${fld("Name", `<input class="input" id="sq-name" value="${esc(sq.name)}" maxlength="30" />`)}${fld("Event name", `<input class="input" id="sq-event" value="${esc(sq.event)}" maxlength="40" />`, "for On an event: fire ReplicatedStorage.VSEvents.&lt;name&gt; (a Workshop button does)")}</div>
    <div id="sq-steps" class="sq-steps"></div>
    <div class="row"><button class="btn primary" data-act="insert">Insert the script</button><button class="btn" data-act="clear">Clear</button></div>
    <p class="muted small-p">GUI and camera steps make a LocalScript in StarterPlayerScripts (players see it on their own screen); otherwise a Script in ServerScriptService.</p>`,
  mount() { sqRender(); $("sq-steps").addEventListener("input", sqEdit); $("sq-steps").addEventListener("change", sqEdit); },
  onSeg(id, v) { if (id === "sq-trig") sq.trigger = v; },
  async act(a, btn) {
    sq.name = val("sq-name").trim() || "Sequence"; sq.event = val("sq-event").trim().replace(/[^\w]/g, "") || "PlayCutscene";
    if (a === "del") { sq.steps.splice(Number(btn.dataset.i), 1); sqRender(); return; }
    if (a === "clear") { sq.steps = []; sqRender(); return; }
    if (a === "addstep") {
      const sel = await wkSel().catch((e) => { toast(errText(e)); return null; });
      if (!sel) return;
      if (!sel.length) { toast("Select something in Studio first."); return; }
      const t = sq.steps.length ? Math.max(...sq.steps.map((s) => s.t + s.d)) : 0;
      for (const o of sel.slice(0, 8)) {
        const gui = /Gui|Frame|Label|Button|TextBox|Image|ScrollingFrame/.test(o.c) && !/^(Surface|Billboard)Gui$/.test(o.c);
        const fx = /ParticleEmitter|Light$|Beam|Trail|Fire|Smoke|Sparkles/.test(o.c);
        const kind = fx ? "effect" : gui ? "guimove" : "move";
        sq.steps.push({ path: o.f, name: o.n, gui, kind, v: SQ_KINDS[kind][1], t: Math.round(t * 10) / 10, d: 1, ease: "Quad" });
      }
      sqRender();
      return;
    }
    if (a === "insert") {
      if (!sq.steps.length) { toast("Add a step first."); return; }
      const client = sq.steps.some((s) => s.gui || s.kind === "camera" || s.kind === "camback");
      const steps = sq.steps.map((s) => {
        let v = s.v;
        if (s.kind === "move" || s.kind === "guimove") v = `{ ${String(s.v).split(",").map((x) => lnum(x, 0)).concat([0, 0, 0]).slice(0, s.kind === "move" ? 3 : 2).join(", ")} }`;
        else if (s.kind === "turn" || s.kind === "fade") v = String(lnum(s.v, s.kind === "fade" ? 1 : 90));
        else v = lq(s.kind === "color" ? String(s.v).replace("#", "") : s.v);
        return `	{ path = ${lq(s.path)}, kind = ${lq(s.kind)}, v = ${v}, t = ${lnum(s.t, 0, 0)}, d = ${lnum(s.d, 1, 0)}, ease = ${lq(s.ease)} },`;
      }).join("\n");
      const src = `-- VoidScript sequence "${sq.name.replace(/[^\w ]/g, "")}" - made in the Workshop. Edit the steps below.
-- t = when it starts (seconds), d = how long it takes.
local STEPS = {
${steps}
}
local TRIGGER = ${lq(sq.trigger)} -- "start", "event" or "loop"
local EVENT = ${lq(sq.event)}
local TweenService = game:GetService("TweenService")
local Players = game:GetService("Players")
local function find(path)
	local segs = string.split(path, ".")
	local node, first = game, 1
	if segs[1] == "StarterGui" and Players.LocalPlayer then node, first = Players.LocalPlayer:WaitForChild("PlayerGui"), 2 end
	for k = first, #segs do node = node and node:WaitForChild(segs[k], 10) end
	return node
end
local function play(s)
	local o = find(s.path)
	if not o then warn("Sequence: can't find " .. s.path) return end
	local info = TweenInfo.new(s.d, Enum.EasingStyle[s.ease] or Enum.EasingStyle.Quad, Enum.EasingDirection.InOut)
	if s.kind == "move" or s.kind == "turn" then
		local from = o:GetPivot()
		local to = s.kind == "move" and from + Vector3.new(s.v[1], s.v[2], s.v[3]) or from * CFrame.Angles(0, math.rad(s.v), 0)
		local cv = Instance.new("CFrameValue")
		cv.Value = from
		cv.Changed:Connect(function(c) o:PivotTo(c) end)
		local tw = TweenService:Create(cv, info, { Value = to })
		tw.Completed:Once(function() cv:Destroy() end)
		tw:Play()
	elseif s.kind == "fade" then
		if o:IsA("BasePart") then TweenService:Create(o, info, { Transparency = s.v }):Play()
		elseif o:IsA("GuiObject") then
			local goal = { BackgroundTransparency = s.v }
			if o:IsA("TextLabel") or o:IsA("TextButton") or o:IsA("TextBox") then goal.TextTransparency = s.v end
			if o:IsA("ImageLabel") or o:IsA("ImageButton") then goal.ImageTransparency = s.v end
			TweenService:Create(o, info, goal):Play()
		end
	elseif s.kind == "color" then
		local c = Color3.fromHex(s.v)
		if o:IsA("BasePart") then TweenService:Create(o, info, { Color = c }):Play()
		elseif o:IsA("GuiObject") then TweenService:Create(o, info, { BackgroundColor3 = c }):Play() end
	elseif s.kind == "guimove" then
		TweenService:Create(o, info, { Position = UDim2.fromScale(s.v[1], s.v[2]) }):Play()
	elseif s.kind == "camera" then
		local cam = workspace.CurrentCamera
		cam.CameraType = Enum.CameraType.Scriptable
		TweenService:Create(cam, info, { CFrame = o:IsA("BasePart") and o.CFrame or o:GetPivot() }):Play()
	elseif s.kind == "camback" then
		workspace.CurrentCamera.CameraType = Enum.CameraType.Custom
	elseif s.kind == "effect" then
		local list = o:GetDescendants()
		table.insert(list, o)
		for _, e in list do
			if e:IsA("ParticleEmitter") and s.v == "burst" then e:Emit(25)
			elseif e:IsA("ParticleEmitter") or e:IsA("Light") or e:IsA("Beam") or e:IsA("Trail") or e:IsA("Fire") or e:IsA("Smoke") or e:IsA("Sparkles") then
				e.Enabled = s.v ~= "off"
			end
		end
	end
end
local length = 0
for _, s in STEPS do length = math.max(length, s.t + s.d) end
local function run()
	for _, s in STEPS do task.delay(s.t, play, s) end
	task.wait(length)
end
if TRIGGER == "event" then
	local RS = game:GetService("ReplicatedStorage")
	local f = RS:WaitForChild("VSEvents")
	local ev = f:WaitForChild(EVENT)
	ev.Event:Connect(run)
elseif TRIGGER == "loop" then
	while true do run() task.wait(0.1) end
else
	run()
end
`;
      await wkRun("Sequence", `local holder = ${client ? `game:GetService("StarterPlayer"):FindFirstChildOfClass("StarterPlayerScripts")` : `game:GetService("ServerScriptService")`}
local name = ${lq("VSSequence_" + sq.name.replace(/[^\w]/g, ""))}
local old = holder:FindFirstChild(name) if old then old.Parent = nil end
${sq.trigger === "event" ? `local RS = game:GetService("ReplicatedStorage")
local f = RS:FindFirstChild("VSEvents") or Instance.new("Folder") f.Name = "VSEvents" f.Parent = RS
if not f:FindFirstChild(${lq(sq.event)}) then local ev = Instance.new("BindableEvent") ev.Name = ${lq(sq.event)} ev.Parent = f end` : ""}
local sc = Instance.new(${client ? '"LocalScript"' : '"Script"'})
sc.Name = name
sc.Source = ${longStr(src)}
sc.Parent = holder
return "Added " .. name .. " to " .. holder.Name`, btn);
    }
  },
};
function sqEdit(e) {
  const row = e.target.closest(".sq-step"), k = e.target.dataset.k;
  if (!row || !k) return;
  const s = sq.steps[Number(row.dataset.i)];
  s[k] = k === "t" || k === "d" ? lnum(e.target.value, 0, 0) : e.target.value;
  if (k === "kind") { s.v = SQ_KINDS[s.kind][1]; sqRender(); return; }
  if (k === "t" || k === "d") {
    const total = sqTotal();
    document.querySelectorAll(".sq-step").forEach((el, i) => { const x = sq.steps[i], bar = el.querySelector(".sq-bar i"); bar.style.left = (x.t / total) * 100 + "%"; bar.style.width = Math.max(1.5, (x.d / total) * 100) + "%"; });
  }
}

// ── Scatter ─────────────────────────────────────────────────────────────────
const sc = { templates: [], area: null };
WK_TOOLS.scatter = {
  name: "Scatter", group: "Build", desc: "Fill an area with trees, rocks and props: density, random turn and size, slope limit and spacing.",
  html: () => `
    <div class="wk-grid">
      <div class="wk-pick"><b>What to place</b><span id="sc-t">${sc.templates.length ? sc.templates.map((t) => esc(t.n)).join(", ") : "Nothing yet"}</span><button class="btn sm" data-act="templates">Use selection</button></div>
      <div class="wk-pick"><b>Where</b><span id="sc-a">${sc.area ? esc(sc.area.n) : "Nothing yet"}</span><button class="btn sm" data-act="area">Use selected part</button></div>
    </div>
    <div class="wk-grid">
      ${fld("How many", `<input class="input" id="sc-n" type="number" min="1" max="1500" value="60" />`)}
      ${fld("Space between", `<input class="input" id="sc-gap" type="number" min="0" max="200" value="6" />`, "studs")}
      ${fld("Steepest slope", `<input class="input" id="sc-slope" type="number" min="0" max="89" value="35" />`, "degrees")}
      ${fld("Size from", `<input class="input" id="sc-s0" type="number" min="0.1" max="10" step="0.05" value="0.8" />`)}
      ${fld("Size to", `<input class="input" id="sc-s1" type="number" min="0.1" max="10" step="0.05" value="1.25" />`)}
      ${fld("Sink into ground", `<input class="input" id="sc-sink" type="number" min="0" max="10" step="0.1" value="0.2" />`, "studs")}
    </div>
    <div class="row"><label class="chk"><input type="checkbox" id="sc-turn" checked /> Random turn</label><label class="chk"><input type="checkbox" id="sc-tilt" /> Lean with the slope</label></div>
    <div class="row"><button class="btn primary" data-act="go">Scatter</button></div>
    <p class="muted small-p">Lands on terrain and parts inside the area, never on what it already placed. Everything goes in one folder in Workspace.</p>`,
  async act(a, btn) {
    if (a === "templates" || a === "area") {
      const sel = await wkSel().catch((e) => { toast(errText(e)); return null; });
      if (!sel) return;
      if (a === "templates") {
        sc.templates = sel.filter((o) => o.part || /Model/.test(o.c)).slice(0, 20);
        $("sc-t").textContent = sc.templates.length ? sc.templates.map((t) => t.n).join(", ") : "Select models or parts to place";
      } else {
        const p = sel.find((o) => o.part);
        sc.area = p || null;
        $("sc-a").textContent = p ? p.n : "Select one part that covers the area";
      }
      return;
    }
    if (!sc.templates.length || !sc.area) { toast("Pick what to place and the area first."); return; }
    await wkRun("Scatter", `${WK_RESOLVE}
local area = resolve(HS:JSONDecode(${lq(JSON.stringify(sc.area.p))}))
if not area or not area:IsA("BasePart") then return "ERR:The area part moved - pick it again." end
local templates = {}
for _, p in HS:JSONDecode(${lq(JSON.stringify(sc.templates.map((t) => t.p)))}) do local t = resolve(p) if t then table.insert(templates, t) end end
if #templates == 0 then return "ERR:The things to place moved - pick them again." end
local N, GAP, SLOPE = ${Math.round(lnum(val("sc-n"), 60, 1, 1500))}, ${lnum(val("sc-gap"), 6, 0, 200)}, ${lnum(val("sc-slope"), 35, 0, 89)}
local S0, S1, SINK = ${lnum(val("sc-s0"), 0.8, 0.1, 10)}, ${lnum(val("sc-s1"), 1.25, 0.1, 10)}, ${lnum(val("sc-sink"), 0.2, 0, 10)}
local TURN, TILT = ${chk("sc-turn")}, ${chk("sc-tilt")}
local folder = Instance.new("Folder")
folder.Name = "Scatter_" .. area.Name
folder.Parent = workspace
local params = RaycastParams.new()
params.FilterType = Enum.RaycastFilterType.Exclude
local skip = { folder, area }
for _, t in templates do table.insert(skip, t) end
params.FilterDescendantsInstances = skip
local rng = Random.new()
local placed, cell = {}, {}
local function near(pos)
	if GAP <= 0 then return false end
	local cx, cz = math.floor(pos.X / GAP), math.floor(pos.Z / GAP)
	for dx = -1, 1 do for dz = -1, 1 do
		for _, q in cell[(cx + dx) .. ":" .. (cz + dz)] or {} do
			if (Vector2.new(q.X, q.Z) - Vector2.new(pos.X, pos.Z)).Magnitude < GAP then return true end
		end
	end end
	return false
end
local count, tries = 0, 0
local size, cf = area.Size, area.CFrame
while count < N and tries < N * 25 do
	tries += 1
	local local0 = Vector3.new(rng:NextNumber(-0.5, 0.5) * size.X, size.Y / 2, rng:NextNumber(-0.5, 0.5) * size.Z)
	local top = cf:PointToWorldSpace(local0)
	local hit = workspace:Raycast(top + Vector3.new(0, 400, 0), Vector3.new(0, -900, 0), params)
	if hit and not near(hit.Position) then
		local up = hit.Normal
		if math.deg(math.acos(math.clamp(up.Y, -1, 1))) <= SLOPE then
			local t = templates[rng:NextInteger(1, #templates)]:Clone()
			local scale = rng:NextNumber(math.min(S0, S1), math.max(S0, S1))
			if t:IsA("Model") then pcall(function() t:ScaleTo(t:GetScale() * scale) end) elseif t:IsA("BasePart") then t.Size *= scale end
			local h = t:IsA("Model") and t:GetExtentsSize().Y or t.Size.Y
			local rot = CFrame.Angles(0, TURN and rng:NextNumber(0, math.pi * 2) or 0, 0)
			local base = CFrame.new(hit.Position)
			if TILT then
				local axis = Vector3.yAxis:Cross(up)
				if axis.Magnitude > 1e-3 then base = base * CFrame.fromAxisAngle(axis.Unit, math.acos(math.clamp(up.Y, -1, 1))) end
			end
			local pivotOffset = t:IsA("Model") and (t:GetPivot():PointToObjectSpace(t:GetBoundingBox().Position).Y - h / 2) or (-h / 2)
			t:PivotTo(base * rot * CFrame.new(0, -pivotOffset - SINK, 0))
			if t:IsA("BasePart") then t.Anchored = true else for _, d in t:GetDescendants() do if d:IsA("BasePart") then d.Anchored = true end end end
			t.Parent = folder
			count += 1
			if GAP > 0 then
				local key = math.floor(hit.Position.X / GAP) .. ":" .. math.floor(hit.Position.Z / GAP)
				cell[key] = cell[key] or {}
				table.insert(cell[key], hit.Position)
			end
		end
	end
end
if count == 0 then folder.Parent = nil return "ERR:Nothing landed - the area needs ground (terrain or parts) under it, or loosen the slope and spacing." end
return "Placed " .. count .. " things in " .. folder.Name .. (count < N and " (ran out of room for the rest)" or "")`, btn);
  },
};

// ── Lighting presets ────────────────────────────────────────────────────────
const LT_PRESETS = {
  Day: { L: { ClockTime: 14, Brightness: 2, Ambient: "#4b4b55", OutdoorAmbient: "#808080", ColorShift_Top: "#000000", FogColor: "#c0d8f0", FogStart: 0, FogEnd: 100000, ExposureCompensation: 0 }, A: { Density: 0.3, Offset: 0.25, Color: "#c7d6e8", Decay: "#6a7d96", Glare: 0, Haze: 0 }, G: null },
  Sunset: { L: { ClockTime: 17.8, Brightness: 2.2, Ambient: "#5a4a50", OutdoorAmbient: "#a07a6a", ColorShift_Top: "#ff9a5a", FogColor: "#f0a070", FogStart: 0, FogEnd: 100000, ExposureCompensation: 0.1 }, A: { Density: 0.38, Offset: 0.2, Color: "#f4b98a", Decay: "#a0504a", Glare: 0.6, Haze: 1.5 }, G: { Brightness: 0, Contrast: 0.08, Saturation: 0.15, TintColor: "#fff0e0" } },
  Night: { L: { ClockTime: 0, Brightness: 1, Ambient: "#2a2f45", OutdoorAmbient: "#3a4060", ColorShift_Top: "#000000", FogColor: "#101830", FogStart: 0, FogEnd: 100000, ExposureCompensation: -0.3 }, A: { Density: 0.35, Offset: 0.1, Color: "#3a4a70", Decay: "#101830", Glare: 0, Haze: 1 }, G: { Brightness: 0, Contrast: 0.1, Saturation: -0.2, TintColor: "#d8e0ff" } },
  Horror: { L: { ClockTime: 0.5, Brightness: 0.5, Ambient: "#1a1414", OutdoorAmbient: "#2a2020", ColorShift_Top: "#000000", FogColor: "#0a0a0a", FogStart: 0, FogEnd: 120, ExposureCompensation: -0.6 }, A: { Density: 0.6, Offset: 0, Color: "#3a3a3a", Decay: "#101010", Glare: 0, Haze: 2.5 }, G: { Brightness: -0.05, Contrast: 0.25, Saturation: -0.6, TintColor: "#ffd8d8" } },
  Winter: { L: { ClockTime: 12, Brightness: 2.6, Ambient: "#7a8aa0", OutdoorAmbient: "#b0c4dc", ColorShift_Top: "#dbe8ff", FogColor: "#dce8f5", FogStart: 50, FogEnd: 600, ExposureCompensation: 0.2 }, A: { Density: 0.45, Offset: 0.3, Color: "#e4eef8", Decay: "#a8bcd8", Glare: 0, Haze: 1.8 }, G: { Brightness: 0.02, Contrast: 0.05, Saturation: -0.25, TintColor: "#eef4ff" } },
  Overcast: { L: { ClockTime: 13, Brightness: 1.2, Ambient: "#60646c", OutdoorAmbient: "#8a8e96", ColorShift_Top: "#000000", FogColor: "#9aa0a8", FogStart: 0, FogEnd: 800, ExposureCompensation: -0.1 }, A: { Density: 0.5, Offset: 0.2, Color: "#a0a6ae", Decay: "#70767e", Glare: 0, Haze: 2 }, G: { Brightness: 0, Contrast: 0, Saturation: -0.3, TintColor: "#f2f4f8" } },
};
const LT_LUA = (want) => `local HS = game:GetService("HttpService")
local want = HS:JSONDecode(${lq(JSON.stringify(want || {}))})
local L = game:GetService("Lighting")
local LK = { "ClockTime", "Brightness", "Ambient", "OutdoorAmbient", "ColorShift_Top", "FogColor", "FogStart", "FogEnd", "ExposureCompensation" }
local AK = { "Density", "Offset", "Color", "Decay", "Glare", "Haze" }
local GK = { "Brightness", "Contrast", "Saturation", "TintColor" }
local function enc(v) return typeof(v) == "Color3" and "#" .. v:ToHex() or v end
local function put(obj, k, v) if typeof(obj[k]) == "Color3" then obj[k] = Color3.fromHex(v) else obj[k] = v end end
local function grab()
	local a, g = L:FindFirstChildOfClass("Atmosphere"), L:FindFirstChild("VSGrade")
	local out = { L = {} }
	for _, k in LK do out.L[k] = enc(L[k]) end
	if a then out.A = {} for _, k in AK do out.A[k] = enc(a[k]) end end
	if g then out.G = {} for _, k in GK do out.G[k] = enc(g[k]) end end
	return out
end
local before = grab()
if want.L then
	local CH = game:GetService("ChangeHistoryService")
	CH:SetWaypoint("Before lighting")
	for k, v in want.L do put(L, k, v) end
	local a = L:FindFirstChildOfClass("Atmosphere")
	if want.A then
		if not a then a = Instance.new("Atmosphere") a.Parent = L end
		for k, v in want.A do put(a, k, v) end
	elseif a then a.Parent = nil end
	local g = L:FindFirstChild("VSGrade")
	if want.G then
		if not g then g = Instance.new("ColorCorrectionEffect") g.Name = "VSGrade" g.Parent = L end
		for k, v in want.G do put(g, k, v) end
	elseif g then g.Parent = nil end
	CH:SetWaypoint("Lighting")
end
return HS:JSONEncode(before)`;
const lt = { before: null, tried: "" };
let ltMine = {};
try { ltMine = JSON.parse(lsGet("vs-lighting") || "{}"); } catch {}
// A little sky-and-ground swatch, so you see the look before it touches Studio.
const ltSwatch = (p) => {
  const L = p.L, A = p.A || {}, G = p.G || {};
  const sky = A.Color || L.FogColor, low = L.FogColor, ground = L.OutdoorAmbient, sun = L.ColorShift_Top !== "#000000" ? L.ColorShift_Top : "#fff6d8";
  const dark = Math.max(0.42, Math.min(1, (L.Brightness || 1) / 2.4 + 0.25 + (L.ExposureCompensation || 0) * 0.25));
  const t = L.ClockTime, sunY = 85 - Math.max(0, Math.sin(((t - 6) / 12) * Math.PI)) * 70;
  return `<div class="lt-sw" style="filter:brightness(${dark.toFixed(2)}) saturate(${(1 + (G.Saturation || 0)).toFixed(2)}) contrast(${(1 + (G.Contrast || 0)).toFixed(2)});background:linear-gradient(180deg, ${A.Decay || sky} 0%, ${sky} 45%, ${low} 68%, ${ground} 70%, ${L.Ambient} 100%)">
    ${t > 5.5 && t < 18.5 ? `<i class="sun" style="top:${sunY}%;background:${sun}"></i>` : '<i class="moon"></i>'}</div>`;
};
WK_TOOLS.lighting = {
  name: "Lighting", group: "Build", desc: "Day, sunset, night, horror, winter and your own saved looks. See them here, try one in Studio, keep it or undo.",
  html: () => `
    <div class="lt-grid">${Object.entries({ ...LT_PRESETS, ...ltMine }).map(([n, p]) => `<button class="lt-card${lt.tried === n ? " on" : ""}" data-act="try" data-n="${esc(n)}">${ltSwatch(p)}<b>${esc(n)}</b>${ltMine[n] ? `<span class="link" data-act="forget" data-n="${esc(n)}">Delete</span>` : ""}</button>`).join("")}</div>
    <div class="row" id="lt-keep" ${lt.before ? "" : "hidden"}><span class="muted">Trying <b>${esc(lt.tried)}</b> in Studio.</span><span class="grow"></span><button class="btn primary" data-act="keep">Keep it</button><button class="btn" data-act="undo">Put it back</button></div>
    <div class="row"><input class="input grow" id="lt-name" placeholder="Name for your current Studio lighting" maxlength="24" /><button class="btn" data-act="save">Save current look</button></div>`,
  async act(a, btn) {
    if (a === "forget") { delete ltMine[btn.dataset.n]; lsSet("vs-lighting", JSON.stringify(ltMine)); wkShow("lighting"); return; }
    if (a === "try") {
      const p = LT_PRESETS[btn.dataset.n] || ltMine[btn.dataset.n];
      try {
        const before = JSON.parse(await stLuau(LT_LUA(p)));
        if (!lt.before) lt.before = before; // keep the look from before the first try
        lt.tried = btn.dataset.n;
        wkShow("lighting");
      } catch (e) { toast(errText(e), 5000); }
      return;
    }
    if (a === "keep") { lt.before = null; lt.tried = ""; wkShow("lighting"); toast("Kept. Ctrl+Z in Studio still undoes it."); return; }
    if (a === "undo") {
      try { await stLuau(LT_LUA(lt.before)); lt.before = null; lt.tried = ""; wkShow("lighting"); toast("Put back how it was."); } catch (e) { toast(errText(e), 5000); }
      return;
    }
    if (a === "save") {
      const name = val("lt-name").trim().slice(0, 24);
      if (!name) { toast("Give it a name first."); $("lt-name").focus(); return; }
      try { ltMine[name] = JSON.parse(await stLuau(LT_LUA(null))); lsSet("vs-lighting", JSON.stringify(ltMine)); wkShow("lighting"); toast("Saved - it's in your presets now."); }
      catch (e) { toast(errText(e), 5000); }
    }
  },
};

// ── NPC routes ──────────────────────────────────────────────────────────────
const nr = { npc: null, count: 0 };
const NR_INFO = (p) => `${WK_RESOLVE}
local npc = resolve(HS:JSONDecode(${lq(JSON.stringify(p))}))
if not npc then return "ERR:The NPC moved - pick it again." end
local route = npc:FindFirstChild("VSRoute")
local hum = npc:FindFirstChildWhichIsA("Humanoid")
local root = npc:FindFirstChild("HumanoidRootPart") or npc.PrimaryPart`;
WK_TOOLS.route = {
  name: "NPC routes", group: "Build", desc: "Place waypoints for an NPC, see the route as a line in Studio, and get a patrol script.",
  html: () => `
    <div class="wk-pick"><b>NPC</b><span id="nr-npc">${nr.npc ? `${esc(nr.npc.n)} · ${nr.count} waypoints` : "Nothing yet"}</span><button class="btn sm" data-act="pick">Use selected NPC</button></div>
    <div class="row"><button class="btn" data-act="add">Add waypoint where the camera looks</button><button class="btn" data-act="addsel">Add at selected parts</button><button class="btn ghost" data-act="pop">Remove last</button><button class="btn ghost" data-act="clear">Clear route</button></div>
    <div class="wk-grid">
      ${fld("Walk", seg("nr-mode", [["loop", "In a loop"], ["pingpong", "Back and forth"]], "loop"))}
      ${fld("Wait at each", `<input class="input" id="nr-wait" type="number" min="0" max="120" step="0.5" value="1.5" />`, "seconds")}
      ${fld("Walk speed", `<input class="input" id="nr-speed" type="number" min="1" max="60" value="10" />`)}
    </div>
    <label class="chk"><input type="checkbox" id="nr-path" checked /> Walk around obstacles (pathfinding)</label>
    <div class="row"><button class="btn primary" data-act="script">Write the patrol script</button></div>
    <p class="muted small-p">Waypoints are small glowing balls in a VSRoute folder inside the NPC, joined by a line. The patrol script hides them when the game runs.</p>`,
  async act(a, btn) {
    if (a === "pick") {
      const sel = await wkSel().catch((e) => { toast(errText(e)); return null; });
      if (!sel) return;
      const n = sel.find((o) => o.hum);
      if (!n) { toast("Select a model that has a Humanoid (the NPC)."); return; }
      nr.npc = n;
      try { nr.count = Number(await stLuau(`${NR_INFO(n.p)}\nreturn tostring(route and #route:GetChildren() or 0)`)) || 0; } catch { nr.count = 0; }
      $("nr-npc").textContent = `${n.n} · ${nr.count} waypoints`;
      return;
    }
    if (!nr.npc) { toast("Pick the NPC first."); return; }
    const add = (where) => `${NR_INFO(nr.npc.p)}
if not route then route = Instance.new("Folder") route.Name = "VSRoute" route.Parent = npc end
local function addAt(pos)
	local n = #route:GetChildren() + 1
	local p = Instance.new("Part")
	p.Name = tostring(n)
	p.Shape = Enum.PartType.Ball
	p.Size = Vector3.new(1.2, 1.2, 1.2)
	p.Anchored, p.CanCollide, p.CanQuery, p.CanTouch = true, false, false, false
	p.Material = Enum.Material.Neon
	p.Color = Color3.fromRGB(255, 179, 71)
	p.Position = pos + Vector3.new(0, 0.6, 0)
	local att = Instance.new("Attachment") att.Parent = p
	local prev = route:FindFirstChild(tostring(n - 1))
	if prev and prev:FindFirstChildOfClass("Attachment") then
		local b = Instance.new("Beam")
		b.Attachment0, b.Attachment1 = prev:FindFirstChildOfClass("Attachment"), att
		b.Width0, b.Width1, b.FaceCamera = 0.25, 0.25, true
		b.Color = ColorSequence.new(Color3.fromRGB(255, 179, 71))
		b.Parent = p
	end
	p.Parent = route
end
${where}
return tostring(#route:GetChildren())`;
    const way = async (label, code) => {
      const was = btn.textContent;
      btn.disabled = true; btn.textContent = "Working…";
      try { return await stLuau(stUndoable(label, code), 30000); }
      catch (e) { toast(errText(e), 5000); return null; }
      finally { btn.disabled = false; btn.textContent = was; }
    };
    let n = null;
    if (a === "add") n = await way("Waypoint", add(`local cam = workspace.CurrentCamera
local params = RaycastParams.new()
params.FilterType = Enum.RaycastFilterType.Exclude
params.FilterDescendantsInstances = { npc }
local hit = workspace:Raycast(cam.CFrame.Position, cam.CFrame.LookVector * 2000, params)
if not hit then return "ERR:Point the Studio camera at the ground where the NPC should walk." end
addAt(hit.Position)`));
    if (a === "addsel") n = await way("Waypoints", add(`local added = 0
for _, o in game:GetService("Selection"):Get() do
	if o:IsA("BasePart") and not o:IsDescendantOf(npc) then addAt(o.Position) added += 1 end
end
if added == 0 then return "ERR:Select parts where the NPC should walk (the NPC stays picked)." end`));
    if (a === "pop" || a === "clear") n = await way("Route", `${NR_INFO(nr.npc.p)}
if not route then return "0" end
${a === "clear" ? "route.Parent = nil return \"0\"" : "local last = route:FindFirstChild(tostring(#route:GetChildren())) if last then last.Parent = nil end return tostring(#route:GetChildren())"}`);
    if (n != null && /^\d+$/.test(n)) {
      nr.count = Number(n);
      $("nr-npc").textContent = `${nr.npc.n} · ${nr.count} waypoints`;
      toast(a === "clear" ? "Route cleared." : a === "pop" ? `Removed the last waypoint - ${nr.count} left.` : `${nr.count} waypoints now. Ctrl+Z in Studio undoes it.`, 3000);
    }
    if (a === "script") {
      const src = `-- VoidScript NPC patrol. Waypoints are the parts in VSRoute (1, 2, 3…).
local SETTINGS = { mode = ${lq(segVal("nr-mode") || "loop")}, waitAt = ${lnum(val("nr-wait"), 1.5, 0, 120)}, speed = ${lnum(val("nr-speed"), 10, 1, 60)}, pathfinding = ${chk("nr-path")} }
local PathfindingService = game:GetService("PathfindingService")
local npc = script.Parent
local hum = npc:WaitForChild("Humanoid")
local root = npc:FindFirstChild("HumanoidRootPart") or npc.PrimaryPart
local route = npc:WaitForChild("VSRoute")
hum.WalkSpeed = SETTINGS.speed
local points = {}
for i = 1, #route:GetChildren() do
	local p = route:FindFirstChild(tostring(i))
	if p then
		table.insert(points, p.Position)
		p.Transparency = 1
		for _, b in p:GetChildren() do if b:IsA("Beam") then b.Enabled = false end end
	end
end
if #points < 2 then warn(npc.Name .. ": the route needs at least two waypoints") return end
local function walkTo(pos)
	if SETTINGS.pathfinding then
		local path = PathfindingService:CreatePath({ AgentCanJump = true })
		local ok = pcall(function() path:ComputeAsync(root.Position, pos) end)
		if ok and path.Status == Enum.PathStatus.Success then
			for _, w in path:GetWaypoints() do
				if w.Action == Enum.PathWaypointAction.Jump then hum.Jump = true end
				hum:MoveTo(w.Position)
				if not hum.MoveToFinished:Wait() then break end
			end
			return
		end
	end
	hum:MoveTo(pos)
	hum.MoveToFinished:Wait()
end
local i, step = 1, 1
while npc.Parent and hum.Health > 0 do
	walkTo(points[i])
	task.wait(SETTINGS.waitAt)
	if SETTINGS.mode == "pingpong" then
		if i + step > #points or i + step < 1 then step = -step end
		i += step
	else
		i = i % #points + 1
	end
end
`;
      await wkRun("Patrol script", `${NR_INFO(nr.npc.p)}
if not route or #route:GetChildren() < 2 then return "ERR:Add at least two waypoints first." end
if not hum then return "ERR:That model has no Humanoid." end
local old = npc:FindFirstChild("VSPatrol") if old then old.Parent = nil end
local sc = Instance.new("Script")
sc.Name = "VSPatrol"
sc.Source = ${longStr(src)}
sc.Parent = npc
local warnRoot = root and root.Anchored and " - its HumanoidRootPart is anchored, so unanchor it or it can't walk" or ""
return "Added the patrol script to " .. npc.Name .. warnRoot`, btn);
    }
  },
};

// ── Sound zones ─────────────────────────────────────────────────────────────
const SZ_RUNTIME = `-- VoidScript sound zones: every part tagged "VSSoundZone" plays its sound while
-- you're inside it, fading out over its falloff distance. Settings are the zone
-- part's attributes (VS_SoundId, VS_Volume, VS_Falloff, VS_Fade).
local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")
local player = game:GetService("Players").LocalPlayer
local sounds = {}
local function soundFor(zone)
	local s = sounds[zone]
	if s then return s end
	s = Instance.new("Sound")
	s.SoundId = zone:GetAttribute("VS_SoundId") or ""
	s.Looped = true
	s.Volume = 0
	s.Parent = script
	s:Play()
	sounds[zone] = s
	zone.Destroying:Once(function() s:Destroy() sounds[zone] = nil end)
	return s
end
RunService.RenderStepped:Connect(function(dt)
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	for _, zone in CollectionService:GetTagged("VSSoundZone") do
		if zone:IsA("BasePart") then
			local s = soundFor(zone)
			local want = 0
			if root then
				local p = zone.CFrame:PointToObjectSpace(root.Position)
				local h = zone.Size / 2
				local out = Vector3.new(math.max(math.abs(p.X) - h.X, 0), math.max(math.abs(p.Y) - h.Y, 0), math.max(math.abs(p.Z) - h.Z, 0)).Magnitude
				local fall = zone:GetAttribute("VS_Falloff") or 0
				local k = out == 0 and 1 or (fall > 0 and math.max(0, 1 - out / fall) or 0)
				want = (zone:GetAttribute("VS_Volume") or 0.5) * k
			end
			local fade = math.max(zone:GetAttribute("VS_Fade") or 1, 0.05)
			s.Volume += (want - s.Volume) * math.min(1, dt * 3 / fade)
		end
	end
end)
`;
WK_TOOLS.sound = {
  name: "Sound zones", group: "Build", desc: "Ambient sound for areas: select parts that cover each area, set the sound, volume and how far it fades.",
  html: () => `
    <div class="wk-grid">
      ${fld("Sound", `<input class="input" id="sz-id" placeholder="rbxassetid://…" />`)}
      ${fld("Volume", `<input class="input" id="sz-vol" type="number" min="0" max="3" step="0.05" value="0.5" />`)}
      ${fld("Fades out over", `<input class="input" id="sz-fall" type="number" min="0" max="500" value="20" />`, "studs outside the part")}
      ${fld("Fade speed", `<input class="input" id="sz-fade" type="number" min="0.05" max="10" step="0.05" value="1" />`, "seconds")}
    </div>
    <label class="chk"><input type="checkbox" id="sz-hide" checked /> Make the zone parts invisible and walk-through</label>
    <div class="row"><button class="btn primary" data-act="make">Make the selected parts sound zones</button><button class="btn ghost" data-act="remove">Remove sound zone</button></div>
    <p class="muted small-p">One LocalScript (VSSoundZones in StarterPlayerScripts) runs every zone. Zone settings are the part's attributes, so you can tweak them in Studio later.</p>`,
  async act(a, btn) {
    if (a === "remove") {
      await wkRun("Remove sound zone", `local CS = game:GetService("CollectionService")
local n = 0
for _, p in parts do if CS:HasTag(p, "VSSoundZone") then CS:RemoveTag(p, "VSSoundZone") for _, k in { "VS_SoundId", "VS_Volume", "VS_Falloff", "VS_Fade" } do p:SetAttribute(k, nil) end n += 1 end end
return "Removed " .. n .. " sound zone(s)"`, btn);
      return;
    }
    const id = assetId(val("sz-id"));
    if (!id) { toast("Paste the sound's asset id first."); $("sz-id").focus(); return; }
    await wkRun("Sound zones", `if #parts == 0 then return "ERR:Select the parts that cover each sound area." end
local CS = game:GetService("CollectionService")
for _, p in parts do
	CS:AddTag(p, "VSSoundZone")
	p:SetAttribute("VS_SoundId", ${lq(id)})
	p:SetAttribute("VS_Volume", ${lnum(val("sz-vol"), 0.5, 0, 3)})
	p:SetAttribute("VS_Falloff", ${lnum(val("sz-fall"), 20, 0, 500)})
	p:SetAttribute("VS_Fade", ${lnum(val("sz-fade"), 1, 0.05, 10)})
	${chk("sz-hide") ? "p.Transparency = 1 p.CanCollide = false p.CanQuery = false p.CanTouch = false p.Anchored = true" : ""}
end
local sps = game:GetService("StarterPlayer"):FindFirstChildOfClass("StarterPlayerScripts")
local ls = sps:FindFirstChild("VSSoundZones") or Instance.new("LocalScript")
ls.Name = "VSSoundZones"
ls.Source = ${longStr(SZ_RUNTIME)}
ls.Parent = sps
return "Made " .. #parts .. " sound zone(s)"`, btn);
  },
};

// ── Collision check ─────────────────────────────────────────────────────────
const CO_SCAN = (show) => `local HS = game:GetService("HttpService")
local old = workspace:FindFirstChild("VoidScript Highlights") if old then old:Destroy() end
local cats = { invisible = {}, tiny = {}, floor = {} }
local COLORS = { invisible = Color3.fromRGB(242, 99, 122), tiny = Color3.fromRGB(240, 180, 64), floor = Color3.fromRGB(127, 156, 255) }
local seen = 0
for _, p in workspace:GetDescendants() do
	if p:IsA("BasePart") and not p:IsA("Terrain") then
		seen += 1
		if seen > 40000 then break end
		local m = p:FindFirstAncestorWhichIsA("Model")
		local char = m and m:FindFirstChildWhichIsA("Humanoid")
		if not char and not p:FindFirstAncestorWhichIsA("Tool") and not p:FindFirstAncestorWhichIsA("Accessory") then
			local big = math.max(p.Size.X, p.Size.Y, p.Size.Z)
			if p.CanCollide and p.Transparency >= 0.95 then table.insert(cats.invisible, p)
			elseif p.CanCollide and big <= 1 then table.insert(cats.tiny, p)
			elseif not p.CanCollide and p.Transparency < 0.95 and p.Size.X >= 16 and p.Size.Z >= 16 and p.Size.Y <= 4 then table.insert(cats.floor, p) end
		end
	end
end
${show ? `local folder = Instance.new("Folder")
folder.Name = "VoidScript Highlights"
folder.Archivable = false
folder.Parent = workspace
local n = 0
for k, list in cats do
	for _, p in list do
		if n >= 400 then break end
		n += 1
		local b = Instance.new("SelectionBox")
		b.Adornee = p b.Color3 = COLORS[k] b.LineThickness = 0.06 b.SurfaceTransparency = 0.75 b.SurfaceColor3 = COLORS[k]
		b.Parent = folder
	end
end` : ""}
local out = {}
for k, list in cats do
	out[k] = { n = #list, names = {} }
	for i, p in list do if i > 30 then break end table.insert(out[k].names, p:GetFullName()) end
end
return HS:JSONEncode(out)`;
const CO_CAT = { invisible: ["Invisible walls", "Players bump into something they can't see."], tiny: ["Tiny parts with collision", "Players snag on them; decoration rarely needs collision."], floor: ["Floors players fall through", "Big flat parts with collision turned off."] };
const co = { data: null };
WK_TOOLS.collide = {
  name: "Collisions", group: "Check", desc: "Find invisible walls, tiny parts players snag on, and floors they fall through - and see them highlighted in Studio.",
  html: () => `
    <div class="row"><button class="btn primary" data-act="scan">Check and highlight</button><button class="btn" data-act="clear">Clear highlights</button></div>
    <div id="co-out">${co.data ? coList() : '<p class="muted small-p">Checks every part in Workspace (characters, tools and accessories are skipped).</p>'}</div>`,
  async act(a, btn) {
    if (a === "clear") { try { await stLuau('local f = workspace:FindFirstChild("VoidScript Highlights") if f then f:Destroy() end return "ok"'); toast("Highlights cleared."); } catch (e) { toast(errText(e)); } return; }
    if (a === "scan") {
      btn.disabled = true; btn.textContent = "Checking…";
      try { co.data = JSON.parse(await stLuau(CO_SCAN(true), 60000)); $("co-out").innerHTML = coList(); }
      catch (e) { toast(errText(e), 5000); }
      finally { btn.disabled = false; btn.textContent = "Check and highlight"; }
      return;
    }
    const k = btn.dataset.k;
    if (a === "select" || a === "fix") {
      await wkRun(a === "fix" ? "Collision fix" : "Select", `local HS = game:GetService("HttpService")
local want = ${lq(k)}
local list = {}
for _, p in workspace:GetDescendants() do
	if p:IsA("BasePart") and not p:IsA("Terrain") then
		local m = p:FindFirstAncestorWhichIsA("Model")
		if not (m and m:FindFirstChildWhichIsA("Humanoid")) and not p:FindFirstAncestorWhichIsA("Tool") and not p:FindFirstAncestorWhichIsA("Accessory") then
			local big = math.max(p.Size.X, p.Size.Y, p.Size.Z)
			local cat = (p.CanCollide and p.Transparency >= 0.95) and "invisible" or (p.CanCollide and big <= 1) and "tiny"
				or (not p.CanCollide and p.Transparency < 0.95 and p.Size.X >= 16 and p.Size.Z >= 16 and p.Size.Y <= 4) and "floor" or nil
			if cat == want then table.insert(list, p) end
		end
	end
end
${a === "fix" ? `for _, p in list do p.CanCollide = (want == "floor") end
return (want == "floor" and "Turned collisions on for " or "Turned collisions off on ") .. #list .. " parts"` : `game:GetService("Selection"):Set(list)
return "Selected " .. #list .. " parts in Studio"`}`, btn, a === "fix");
    }
  },
};
function coList() {
  const d = co.data;
  return Object.entries(CO_CAT).map(([k, [t, why]]) => `<div class="co-cat co-${k}"><div class="uc-gh"><b>${t}</b><span class="tag">${d[k].n}</span>
    ${d[k].n ? `<button class="btn sm" data-act="select" data-k="${k}">Select them</button>${k !== "invisible" ? `<button class="btn sm" data-act="fix" data-k="${k}">${k === "floor" ? "Turn collisions on" : "Turn collisions off"}</button>` : ""}` : ""}</div>
    <p class="muted small-p">${why}${k === "invisible" && d[k].n ? " Some are on purpose (barriers) - check before changing." : ""}</p>
    ${d[k].names.map((n) => `<div class="co-n">${esc(n)}</div>`).join("")}${d[k].n > d[k].names.length ? `<p class="muted small-p">…and ${d[k].n - d[k].names.length} more.</p>` : ""}</div>`).join("");
}

// ── Asset check ─────────────────────────────────────────────────────────────
const AS_SCAN = `local HS = game:GetService("HttpService")
local MS = game:GetService("MarketplaceService")
local PROPS = { Decal = { "Texture" }, Texture = { "Texture" }, ImageLabel = { "Image" }, ImageButton = { "Image" }, Sound = { "SoundId" },
	MeshPart = { "MeshId", "TextureID" }, SpecialMesh = { "MeshId", "TextureId" }, Animation = { "AnimationId" }, ParticleEmitter = { "Texture" },
	Beam = { "Texture" }, Trail = { "Texture" }, Shirt = { "ShirtTemplate" }, Pants = { "PantsTemplate" }, ShirtGraphic = { "Graphic" },
	Sky = { "SkyboxBk", "SkyboxDn", "SkyboxFt", "SkyboxLf", "SkyboxRt", "SkyboxUp", "SunTextureId", "MoonTextureId" } }
local uses, order = {}, {}
local function note(id, where)
	if not uses[id] then uses[id] = {} table.insert(order, id) end
	if #uses[id] < 10 then table.insert(uses[id], where) end
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
	local props = PROPS[d.ClassName]
	if props then
		for _, p in props do
			local ok, v = pcall(function() return d[p] end)
			if ok and type(v) == "string" and (string.find(v, "rbxasset") or string.find(v, "roblox.com")) then
				local id = string.match(v, "(%d%d%d%d+)")
				if id then note(id, d:GetFullName() .. " · " .. p) end
			end
		end
	elseif d:IsA("LuaSourceContainer") then
		local ok, src = pcall(function() return d.Source end)
		if ok and src then
			for ln, line in string.split(src, "\\n") do
				for id in string.gmatch(line, "rbxassetid://(%d+)") do note(id, d:GetFullName() .. ":" .. ln) end
			end
		end
	end
end
local res, pending = {}, 0
for i, id in order do
	if i > 150 then break end
	pending += 1
	task.spawn(function()
		local ok, info = pcall(function() return MS:GetProductInfo(tonumber(id), Enum.InfoType.Asset) end)
		res[id] = ok and { ok = true, name = info.Name, t = info.AssetTypeId } or { ok = false, err = tostring(info) }
		pending -= 1
	end)
end
local t0 = os.clock()
while pending > 0 and os.clock() - t0 < 40 do task.wait(0.1) end
local out = {}
for _, id in order do table.insert(out, { id = id, uses = uses[id], r = res[id] }) end
return HS:JSONEncode({ assets = out })`;
WK_TOOLS.assets = {
  name: "Asset check", group: "Check", desc: "Every image, sound, mesh and animation your place uses, which ones Roblox can't load, and exactly where each is used.",
  html: () => `<div class="row"><button class="btn primary" data-act="scan">Check assets</button></div><div id="as-out"><p class="muted small-p">Looks at images, sounds, meshes, animations, skies, clothing and rbxassetid:// in scripts. The first 150 are checked with Roblox.</p></div>`,
  async act(a, btn) {
    btn.disabled = true; btn.textContent = "Checking… (up to a minute)";
    try {
      const { assets } = JSON.parse(await stLuau(AS_SCAN, 120000));
      const checked = assets.filter((x) => x.r), bad = checked.filter((x) => !x.r.ok);
      // If every check failed the same way, it's the check that failed, not the assets.
      const sameErr = bad.length && bad.length === checked.length && new Set(bad.map((x) => x.r.err)).size === 1;
      const row = (x) => `<div class="as-row${x.r && !x.r.ok && !sameErr ? " bad" : ""}"><div><b>${x.r && x.r.ok ? esc(x.r.name) : "Asset " + esc(x.id)}</b><span class="muted">${esc(x.id)}</span>${x.r && !x.r.ok && !sameErr ? '<em>Roblox can\'t load this one</em>' : !x.r ? '<em class="muted">not checked</em>' : ""}</div>${x.uses.map((u) => `<code>${esc(u)}</code>`).join("")}</div>`;
      $("as-out").innerHTML = `<div class="nav-sum"><div><b>${assets.length}</b><span>assets used</span></div><div><b>${sameErr ? "?" : bad.length}</b><span>can't load</span></div></div>
        ${sameErr ? `<p class="st-notes">Couldn't check with Roblox from Studio (${esc(bad[0].r.err.slice(0, 120))}). Showing where each asset is used.</p>` : ""}
        ${(sameErr ? assets : bad.concat(assets.filter((x) => !bad.includes(x)))).map(row).join("")}
        <p class="muted small-p">Private audio and assets you don't own can still load here but fail in your game - test in a live server too.</p>`;
    } catch (e) { toast(errText(e), 6000); }
    finally { btn.disabled = false; btn.textContent = "Check assets"; }
  },
};

// ── Localization ────────────────────────────────────────────────────────────
const LO_SCAN = `local HS = game:GetService("HttpService")
local out, seen = {}, {}
local function add(text, where, kind)
	if #out >= 800 or not string.find(text, "%a") or #text > 300 then return end
	if string.match(text, "^%s*$") or string.match(text, "^[%d%s%p]+$") then return end
	local key = text .. "|" .. where
	if seen[key] then return end
	seen[key] = true
	table.insert(out, { s = text, w = where, k = kind })
end
for _, root in { game:GetService("StarterGui"), workspace, game:GetService("ReplicatedStorage"), game:GetService("StarterPack") } do
	for _, d in root:GetDescendants() do
		if d:IsA("TextLabel") or d:IsA("TextButton") or d:IsA("TextBox") then
			if d.Text ~= "" then add(d.Text, d:GetFullName(), "gui") end
			if d:IsA("TextBox") and d.PlaceholderText ~= "" then add(d.PlaceholderText, d:GetFullName() .. " (placeholder)", "gui") end
		elseif d:IsA("ProximityPrompt") then
			if d.ActionText ~= "" then add(d.ActionText, d:GetFullName() .. " (action)", "prompt") end
		end
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
	if d:IsA("LocalScript") or d:IsA("ModuleScript") or (d:IsA("Script") and d.RunContext == Enum.RunContext.Client) then
		local ok, src = pcall(function() return d.Source end)
		if ok and src then
			for ln, line in string.split(src, "\\n") do
				local t = string.match(line, "%.Text%s*=%s*\\"([^\\"]+)\\"") or string.match(line, "%.Text%s*=%s*'([^']+)'")
				if t and not string.find(t, "%.%.") then add(t, d:GetFullName() .. ":" .. ln, "script") end
			end
		end
	end
end
local done = {}
for _, t in game:GetService("LocalizationService"):GetDescendants() do
	if t:IsA("LocalizationTable") then for _, e in t:GetEntries() do done[e.Source] = true end end
end
for _, e in out do e.done = done[e.s] or nil end
return HS:JSONEncode({ texts = out })`;
const lo = { texts: null };
WK_TOOLS.locale = {
  name: "Translations", group: "Check", desc: "Find the text players see - in GUIs, prompts and scripts - and turn it into a translation table.",
  html: () => `<div class="row"><button class="btn primary" data-act="scan">Find player-facing text</button><span class="grow"></span><button class="btn" data-act="table" ${lo.texts ? "" : "disabled"}>Make translation table</button><button class="btn" data-act="csv" ${lo.texts ? "" : "disabled"}>Save as CSV</button></div><div id="lo-out">${lo.texts ? loList() : '<p class="muted small-p">GUI text is translated automatically once it\'s in a table. Text set from scripts needs a translator call in the script - those are marked "script".</p>'}</div>`,
  async act(a, btn) {
    if (a === "scan") {
      btn.disabled = true; btn.textContent = "Looking…";
      try { lo.texts = JSON.parse(await stLuau(LO_SCAN, 60000)).texts; wkShow("locale"); }
      catch (e) { toast(errText(e), 5000); }
      finally { btn.disabled = false; btn.textContent = "Find player-facing text"; }
      return;
    }
    const picked = lo.texts.filter((t, i) => { const c = document.querySelector(`#lo-out input[data-i="${i}"]`); return c && c.checked; });
    if (!picked.length) { toast("Tick the text to include first."); return; }
    if (a === "csv") {
      const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
      const csv = "Key,Context,Example,Source,es,pt,fr,de\n" + picked.map((t) => [q(""), q(t.w), q(""), q(t.s), "", "", "", ""].join(",")).join("\n");
      try { if (await invoke("save_text", { name: "translations.csv", content: csv })) toast("Saved. Upload it in the Localization tools or fill in the languages first."); } catch (e) { toast(errText(e)); }
      return;
    }
    const entries = picked.map((t) => ({ Key: "", Source: t.s, Context: t.w, Example: "", Values: {} }));
    await wkRun("Translation table", `local HS = game:GetService("HttpService")
local LS = game:GetService("LocalizationService")
local tbl = LS:FindFirstChild("VoidScript Strings") or Instance.new("LocalizationTable")
tbl.Name = "VoidScript Strings"
local have, list = {}, tbl:GetEntries()
for _, e in list do have[e.Source .. "|" .. e.Context] = true end
local added = 0
for _, e in HS:JSONDecode(${lq(JSON.stringify(entries))}) do
	if not have[e.Source .. "|" .. e.Context] then table.insert(list, e) added += 1 end
end
tbl:SetEntries(list)
tbl.Parent = LS
return "Added " .. added .. " lines to LocalizationService.VoidScript Strings - add languages in its editor"`, btn);
  },
};
function loList() {
  if (!lo.texts.length) return '<p class="muted">No player-facing text found.</p>';
  const left = lo.texts.filter((t) => !t.done).length;
  return `<p class="muted small-p">${lo.texts.length} found · ${left} not in a translation table yet</p>` + lo.texts.map((t, i) => `<label class="lo-row"><input type="checkbox" data-i="${i}" ${t.done ? "" : "checked"} /><span><b>${esc(t.s)}</b><em>${esc(t.k)} · ${esc(t.w)}${t.done ? " · already translated" : ""}</em></span></label>`).join("");
}

// ── Economy ─────────────────────────────────────────────────────────────────
WK_TOOLS.economy = {
  name: "Economy", group: "Plan", desc: "Tune prices, rewards and upgrade costs, and see how long each step takes a player - with the assumptions you choose.",
  html: () => `
    <div class="wk-grid">
      ${fld("Currency", `<input class="input" id="ec-cur" value="Coins" maxlength="20" />`)}
      ${fld("Upgrades", `<input class="input" id="ec-n" type="number" min="1" max="60" value="12" />`)}
      ${fld("First price", `<input class="input" id="ec-p0" type="number" min="1" value="100" />`)}
      ${fld("Each price ×", `<input class="input" id="ec-pg" type="number" min="1" max="10" step="0.05" value="1.6" />`)}
      ${fld("Earn at start", `<input class="input" id="ec-i0" type="number" min="0.01" step="0.1" value="5" />`, "per second")}
      ${fld("Each upgrade adds", `<input class="input" id="ec-ig" type="number" min="0" step="0.1" value="4" />`, "per second")}
      ${fld("Earn bonus ×", `<input class="input" id="ec-im" type="number" min="1" max="5" step="0.05" value="1.15" />`, "per upgrade, on top")}
      ${fld("Session length", `<input class="input" id="ec-sess" type="number" min="1" max="600" value="25" />`, "minutes")}
      ${fld("Time spent earning", `<input class="input" id="ec-act" type="number" min="5" max="100" value="70" />`, "% of play time")}
    </div>
    <div id="ec-out"></div>
    <div class="row"><button class="btn primary" data-act="export">Save as EconomyConfig module</button><button class="btn" data-act="copy">Copy table</button></div>`,
  mount() { ecCalc(); },
  async act(a, btn) {
    const r = ecCalc();
    if (a === "copy") {
      try { await navigator.clipboard.writeText("Upgrade\tPrice\tEarning/s\tTime\n" + r.rows.map((x) => `${x.i}\t${x.price}\t${x.inc}\t${fmtDur(x.secs)}`).join("\n")); toast("Copied - paste into a spreadsheet."); } catch { toast("Couldn't copy."); }
      return;
    }
    const src = `-- Economy made in the VoidScript Workshop. Tiers: what each upgrade costs and what you earn after buying it.
return {
	currency = ${lq(r.cur)},
	startIncome = ${r.i0},
	tiers = {
${r.rows.map((x) => `		{ price = ${x.price}, income = ${x.inc} },`).join("\n")}
	},
}
`;
    await wkRun("Economy config", `local RS = game:GetService("ReplicatedStorage")
local m = RS:FindFirstChild("EconomyConfig") or Instance.new("ModuleScript")
m.Name = "EconomyConfig"
m.Source = ${longStr(src)}
m.Parent = RS
return "Saved ReplicatedStorage.EconomyConfig (require it from your shop scripts)"`, btn);
  },
};
const fmtDur = (s) => (s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${(s / 3600).toFixed(1)}h` : `${(s / 86400).toFixed(1)} days`);
function ecCalc() {
  const n = Math.round(lnum(val("ec-n"), 12, 1, 60)), p0 = lnum(val("ec-p0"), 100, 1), pg = lnum(val("ec-pg"), 1.6, 1, 10);
  const i0 = lnum(val("ec-i0"), 5, 0.01), ig = lnum(val("ec-ig"), 4, 0), im = lnum(val("ec-im"), 1.15, 1, 5);
  const sess = lnum(val("ec-sess"), 25, 1, 600) * 60, act = lnum(val("ec-act"), 70, 5, 100) / 100, cur = val("ec-cur").trim() || "Coins";
  const rows = [];
  let inc = i0, total = 0;
  for (let i = 1; i <= n; i++) {
    const price = Math.round(p0 * Math.pow(pg, i - 1));
    const secs = price / (inc * act);
    total += secs;
    inc = Math.round((inc + ig) * im * 100) / 100;
    rows.push({ i, price, inc, secs, total });
  }
  const max = Math.max(...rows.map((x) => x.secs));
  const out = $("ec-out");
  if (out) out.innerHTML = `<div class="nav-sum"><div><b>${fmtDur(total)}</b><span>to buy everything</span></div><div><b>${Math.ceil(total / sess)}</b><span>sessions of ${Math.round(sess / 60)} min</span></div><div><b>${fmtDur(rows[0].secs)}</b><span>to the first upgrade</span></div></div>
    <div class="ec-table"><div class="ec-h"><span>#</span><span>Price</span><span>Earning after</span><span>Time to afford</span><span></span></div>
    ${rows.map((x) => `<div class="ec-r${x.secs > sess ? " slow" : ""}"><span>${x.i}</span><span>${x.price.toLocaleString()} ${esc(cur)}</span><span>${x.inc.toLocaleString()}/s</span><span>${fmtDur(x.secs)}</span><span class="ec-bar"><i style="width:${Math.max(2, (x.secs / max) * 100)}%"></i></span></div>`).join("")}</div>
    <p class="muted small-p">Rows in red take longer than one session to afford - most players won't wait that long without a reason.</p>`;
  return { rows, cur, i0 };
}

// ── Shelf: your own reusable components ─────────────────────────────────────
const SH_B64 = `local B = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local function enc(buf)
	local n, out = buffer.len(buf), {}
	for i = 0, n - 1, 3 do
		local a, b, c = buffer.readu8(buf, i), i + 1 < n and buffer.readu8(buf, i + 1) or 0, i + 2 < n and buffer.readu8(buf, i + 2) or 0
		local v = a * 65536 + b * 256 + c
		local function ch(k) local x = bit32.extract(v, k, 6) + 1 return string.sub(B, x, x) end
		table.insert(out, ch(18) .. ch(12) .. (i + 1 < n and ch(6) or "=") .. (i + 2 < n and ch(0) or "="))
	end
	return table.concat(out)
end
local function dec(s)
	s = string.gsub(s, "[^%w%+/=]", "")
	local pad = select(2, string.gsub(s, "=", ""))
	local buf = buffer.create(#s // 4 * 3 - pad)
	local look, o = {}, 0
	for i = 1, 64 do look[string.sub(B, i, i)] = i - 1 end
	for i = 1, #s, 4 do
		local v = 0
		for k = 0, 3 do v = v * 64 + (look[string.sub(s, i + k, i + k)] or 0) end
		for k = 2, 0, -1 do
			if o < buffer.len(buf) then buffer.writeu8(buf, o, bit32.extract(v, k * 8, 8)) o += 1 end
		end
	end
	return buf
end
`;
let shelf = [];
try { shelf = JSON.parse(lsGet("vs-shelf") || "[]"); } catch {}
const shSave = () => { try { localStorage.setItem("vs-shelf", JSON.stringify(shelf)); return true; } catch { toast("Not enough room to keep that - delete something from the shelf first."); return false; } };
WK_TOOLS.shelf = {
  name: "Shelf", group: "Plan", desc: "Keep your own doors, shops, NPCs and GUI pieces, and drop them into any place. Their Attributes become settings you fill in when you insert them.",
  html: () => `
    <div class="row"><input class="input grow" id="sh-name" placeholder="Name (defaults to the selected thing's name)" maxlength="40" /><button class="btn primary" data-act="save">Put the selected thing on the shelf</button></div>
    <div class="sh-list">${shelf.length ? shelf.map((c, i) => `<div class="sh-item">
      <div><b>${esc(c.name)}</b><span class="muted">${esc(c.cls)} · ${Math.round(c.data.length * 0.75 / 1024)} KB · ${esc(ago(c.t))}</span></div>
      ${Object.keys(c.attrs || {}).length ? `<div class="wk-grid sh-attrs">${Object.entries(c.attrs).map(([k, v]) => fld(esc(k), typeof v === "boolean" ? `<input type="checkbox" data-sh="${i}" data-k="${esc(k)}" ${v ? "checked" : ""} />` : `<input class="input sm" data-sh="${i}" data-k="${esc(k)}" value="${esc(v)}" />`)).join("")}</div>` : ""}
      <div class="row"><button class="btn sm primary" data-act="insert" data-i="${i}">Insert</button><button class="btn sm ghost" data-act="del" data-i="${i}">Delete</button></div></div>`).join("")
      : '<p class="muted small-p">Nothing on the shelf yet. Select a model, a GUI or a script setup in Studio and put it here.</p>'}</div>
    <p class="muted small-p">Uses Studio's own copy and paste of instances (SerializationService), so what you get back is exactly what you saved.</p>`,
  async act(a, btn) {
    if (a === "del") { shelf.splice(Number(btn.dataset.i), 1); shSave(); wkShow("shelf"); return; }
    if (a === "save") {
      btn.disabled = true; btn.textContent = "Copying…";
      try {
        const r = JSON.parse(await stLuau(`${SH_B64}
local HS = game:GetService("HttpService")
local o = game:GetService("Selection"):Get()[1]
if not o then return "ERR:Select the thing to keep in Studio first." end
local ok, buf = pcall(function() return game:GetService("SerializationService"):SerializeInstancesAsync({ o }) end)
if not ok then return "ERR:Studio wouldn't copy it: " .. tostring(buf) end
local attrs = {}
for k, v in o:GetAttributes() do
	if type(v) == "number" or type(v) == "string" or type(v) == "boolean" then attrs[k] = v end
end
return HS:JSONEncode({ name = o.Name, cls = o.ClassName, data = enc(buf), attrs = attrs })`, 120000));
        shelf.unshift({ name: val("sh-name").trim() || r.name, cls: r.cls, data: r.data, attrs: r.attrs, t: Date.now() });
        if (shSave()) { wkShow("shelf"); toast("On the shelf."); } else shelf.shift();
      } catch (e) { toast(errText(e), 6000); }
      finally { btn.disabled = false; btn.textContent = "Put the selected thing on the shelf"; }
      return;
    }
    if (a === "insert") {
      const i = Number(btn.dataset.i), c = shelf[i], attrs = {};
      document.querySelectorAll(`[data-sh="${i}"]`).forEach((el) => {
        const old = c.attrs[el.dataset.k];
        attrs[el.dataset.k] = el.type === "checkbox" ? el.checked : typeof old === "number" ? lnum(el.value, old) : el.value;
      });
      c.attrs = { ...c.attrs, ...attrs };
      shSave();
      await wkRun("Insert " + c.name, `${SH_B64}
local HS = game:GetService("HttpService")
local ok, list = pcall(function() return game:GetService("SerializationService"):DeserializeInstancesAsync(dec(${lq(c.data)})) end)
if not ok or not list or not list[1] then return "ERR:Studio couldn't rebuild it: " .. tostring(list) end
local o = list[1]
for k, v in HS:JSONDecode(${lq(JSON.stringify(attrs))}) do o:SetAttribute(k, v) end
local cls = o.ClassName
if o:IsA("LayerCollector") then o.Parent = game:GetService("StarterGui")
elseif o:IsA("GuiObject") then o.Parent = game:GetService("StarterGui"):FindFirstChildOfClass("ScreenGui") or game:GetService("StarterGui")
elseif o:IsA("Script") then o.Parent = game:GetService("ServerScriptService")
elseif o:IsA("LocalScript") then o.Parent = game:GetService("StarterPlayer"):FindFirstChildOfClass("StarterPlayerScripts")
elseif o:IsA("ModuleScript") then o.Parent = game:GetService("ReplicatedStorage")
else
	o.Parent = workspace
	if o:IsA("PVInstance") then
		local cam = workspace.CurrentCamera
		local spot = cam and (cam.CFrame.Position + cam.CFrame.LookVector * 30) or Vector3.zero
		local size = o:IsA("Model") and o:GetExtentsSize() or (o:IsA("BasePart") and o.Size or Vector3.zero)
		o:PivotTo(CFrame.new(spot.X, spot.Y - 4 + size.Y / 2, spot.Z))
	end
end
game:GetService("Selection"):Set({ o })
return "Inserted " .. o.Name .. " into " .. o.Parent:GetFullName()`, btn);
    }
  },
};

// ── Project handoff report ──────────────────────────────────────────────────
const HO_SCAN = `local HS = game:GetService("HttpService")
local CS = game:GetService("CollectionService")
local out = { place = game.Name, id = game.PlaceId, services = {}, scripts = {}, todos = {}, configs = {}, remotes = {}, parts = 0, tags = CS:GetAllTags() }
for _, name in { "Workspace", "ReplicatedStorage", "ReplicatedFirst", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams" } do
	local ok, svc = pcall(game.GetService, game, name)
	if ok then
		local kids = {}
		for _, c in svc:GetChildren() do
			if #kids < 40 and c.Name ~= "Camera" and not c:IsA("Terrain") then table.insert(kids, { n = c.Name, c = c.ClassName, k = #c:GetDescendants() }) end
		end
		out.services[name] = kids
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
	if d:IsA("BasePart") then out.parts += 1
	elseif d:IsA("RemoteEvent") or d:IsA("RemoteFunction") then if #out.remotes < 200 then table.insert(out.remotes, d:GetFullName()) end
	elseif d:IsA("LuaSourceContainer") then
		local ok, src = pcall(function() return d.Source end)
		if ok and src then
			local lines = string.split(src, "\\n")
			table.insert(out.scripts, { f = d:GetFullName(), c = d.ClassName, l = #lines, off = d:IsA("BaseScript") and (d.Disabled or not d.Enabled) or nil })
			for ln, line in lines do
				if #out.todos < 200 and (string.find(line, "TODO") or string.find(line, "FIXME") or string.find(line, "HACK")) then
					table.insert(out.todos, { f = d:GetFullName(), l = ln, t = string.sub(string.gsub(line, "^%s+", ""), 1, 160) })
				end
			end
			local low = string.lower(d.Name)
			if d:IsA("ModuleScript") and (string.find(low, "config") or string.find(low, "setting")) and #out.configs < 12 then
				table.insert(out.configs, { f = d:GetFullName(), src = string.sub(src, 1, 1800) })
			end
		end
	end
end
return HS:JSONEncode(out)`;
const ho = { md: "" };
function hoMarkdown(d) {
  const L = [];
  const by = {};
  for (const s of d.scripts) { const top = s.f.split(".").slice(0, 2).join("."); (by[top] = by[top] || []).push(s); }
  L.push(`# ${d.place} - project guide`, "", `Made by VoidScript on ${new Date().toLocaleDateString()}. Place id: ${d.id || "not published yet"}.`, "");
  const many = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;
  L.push("## At a glance", "", `- ${many(d.scripts.length, "script")} (${many(d.scripts.reduce((a, s) => a + s.l, 0), "line")})`, `- ${many(d.parts, "part")}`, `- ${many(d.remotes.length, "remote")}`, `- ${many(d.todos.length, "TODO / FIXME note")}`, d.tags.length ? `- Tags: ${d.tags.join(", ")}` : "- No CollectionService tags", "");
  L.push("## Where things live", "");
  for (const [svc, kids] of Object.entries(d.services)) {
    if (!kids.length) continue;
    L.push(`**${svc}**`, ...kids.map((k) => `- ${k.n} (${k.c}${k.k ? `, ${k.k} inside` : ""})`), "");
  }
  L.push("## Scripts", "");
  for (const [top, list] of Object.entries(by).sort()) {
    L.push(`**${top}**`, ...list.slice(0, 40).map((s) => `- ${s.f.split(".").slice(2).join(".") || s.f} - ${s.c}, ${s.l} lines${s.off ? " (disabled)" : ""}`), list.length > 40 ? `- …and ${list.length - 40} more` : "", "");
  }
  if (d.configs.length) {
    L.push("## Configuration", "");
    for (const c of d.configs) L.push(`**${c.f}**`, "```lua", c.src.trim(), "```", "");
  }
  if (d.remotes.length) L.push("## Networking", "", ...d.remotes.map((r) => `- ${r}`), "");
  L.push("## Unfinished", "");
  L.push(...(d.todos.length ? d.todos.map((t) => `- ${t.f}:${t.l} - ${t.t}`) : ["- No TODO, FIXME or HACK notes in the scripts."]), "");
  const off = d.scripts.filter((s) => s.off);
  if (off.length) L.push("## Disabled scripts", "", ...off.map((s) => `- ${s.f}`), "");
  return L.join("\n");
}
WK_TOOLS.handoff = {
  name: "Handoff report", group: "Plan", desc: "A readable guide to the game - folders, systems, settings, remotes and unfinished work - for a new teammate or future you.",
  html: () => `<div class="row"><button class="btn primary" data-act="make">Write the report</button><button class="btn" data-act="save" ${ho.md ? "" : "disabled"}>Save as .md</button><button class="btn" data-act="copy" ${ho.md ? "" : "disabled"}>Copy</button></div>
    <div class="ho-out" id="ho-out">${ho.md ? md(ho.md) : '<p class="muted small-p">Reads your place and writes it up. Nothing in the place changes.</p>'}</div>`,
  async act(a, btn) {
    if (a === "make") {
      btn.disabled = true; btn.textContent = "Reading the place…";
      try { ho.md = hoMarkdown(JSON.parse(await stLuau(HO_SCAN, 90000))); wkShow("handoff"); }
      catch (e) { toast(errText(e), 5000); }
      finally { btn.disabled = false; btn.textContent = "Write the report"; }
      return;
    }
    if (a === "copy") { try { await navigator.clipboard.writeText(ho.md); toast("Copied."); } catch { toast("Couldn't copy."); } return; }
    if (a === "save") { try { if (await invoke("save_text", { name: "project-guide.md", content: ho.md })) toast("Saved."); } catch (e) { toast(errText(e)); } }
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  page
// ════════════════════════════════════════════════════════════════════════════
const WK_GROUPS = ["Build", "Check", "Plan"];
function wkNav() {
  $("wk-nav").innerHTML = WK_GROUPS.map((g) => `<div class="wk-g">${g}</div>` + Object.entries(WK_TOOLS).filter(([, t]) => t.group === g)
    .map(([id, t]) => `<button class="wk-item${wk.tool === id ? " on" : ""}" data-tool="${id}">${esc(t.name)}</button>`).join("")).join("");
}
function wkShow(id) {
  wk.tool = id;
  lsSet("vs-wk-tool", id);
  const t = WK_TOOLS[id];
  wkNav();
  $("wk-panel").innerHTML = `<div class="wk-head"><h3>${esc(t.name)}</h3><p class="muted">${t.desc}</p></div>${t.html()}`;
  if (t.mount) t.mount();
}
$("wk-panel").addEventListener("input", (e) => { if (wk.tool === "economy" && e.target.id && e.target.id.startsWith("ec-")) ecCalc(); });
$("wk-nav").addEventListener("click", (e) => { const b = e.target.closest("[data-tool]"); if (b) wkShow(b.dataset.tool); });
$("wk-panel").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  e.preventDefault();
  const t = WK_TOOLS[wk.tool];
  if (!S.state.connected && !["del", "forget", "copy", "clear", "save", "csv", "view", "back", "delsnap", "load", "hist", "delsnip", "snip", "pick", "addrow"].includes(b.dataset.act) && wk.tool !== "economy") {
    toast("Start the bridge and open Roblox Studio first.", 3500); return;
  }
  Promise.resolve(t.act(b.dataset.act, b)).catch((err) => toast(errText(err), 6000));
});
wkShow(WK_TOOLS[lsGet("vs-wk-tool")] ? lsGet("vs-wk-tool") : "interact");
NAV_ORDER.splice(NAV_ORDER.indexOf("uicheck") + 1, 0, "workshop");
PAGES.splice(PAGES.findIndex((p) => p[0] === "uicheck") + 1, 0, ["workshop", "Workshop"]);
