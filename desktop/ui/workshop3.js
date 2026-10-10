// SPDX-License-Identifier: GPL-3.0-or-later
// workshop3.js - Workshop: GUI kit, Physics check and Bookmarks.
"use strict";

// ── GUI kit: editable components with their behaviour in a separate script ──
const GK_SRC = {
  Button: `-- Hover and press feel. Put what the button does in Activated.
local button = script.Parent
local TweenService = game:GetService("TweenService")
local scale = button:FindFirstChildOfClass("UIScale") or Instance.new("UIScale")
scale.Parent = button
local function to(s) TweenService:Create(scale, TweenInfo.new(0.12, Enum.EasingStyle.Quad), { Scale = s }):Play() end
button.MouseEnter:Connect(function() to(1.05) end)
button.MouseLeave:Connect(function() to(1) end)
button.MouseButton1Down:Connect(function() to(0.95) end)
button.MouseButton1Up:Connect(function() to(1.05) end)
button.Activated:Connect(function()
	-- what happens when it's clicked
end)
`,
  Toggle: `-- The "On" attribute is the state. Other scripts can read it or listen:
-- toggle:GetAttributeChangedSignal("On"):Connect(function() ... end)
local toggle = script.Parent
local knob = toggle:WaitForChild("Knob")
local TweenService = game:GetService("TweenService")
local onColor, offColor = toggle:GetAttribute("OnColor"), toggle.BackgroundColor3
local function draw(animate)
	local on = toggle:GetAttribute("On")
	local info = TweenInfo.new(animate and 0.15 or 0, Enum.EasingStyle.Quad)
	TweenService:Create(knob, info, { Position = on and UDim2.fromScale(0.94, 0.5) or UDim2.fromScale(0.06, 0.5), AnchorPoint = on and Vector2.new(1, 0.5) or Vector2.new(0, 0.5) }):Play()
	TweenService:Create(toggle, info, { BackgroundColor3 = on and onColor or offColor }):Play()
end
toggle.Activated:Connect(function() toggle:SetAttribute("On", not toggle:GetAttribute("On")) end)
toggle:GetAttributeChangedSignal("On"):Connect(function() draw(true) end)
draw(false)
`,
  Slider: `-- The "Value" attribute (0 to 1) is the position. Listen with
-- slider:GetAttributeChangedSignal("Value"):Connect(function() ... end)
local slider = script.Parent
local fill, knob = slider:WaitForChild("Fill"), slider:WaitForChild("Knob")
local UserInputService = game:GetService("UserInputService")
local dragging = false
local function draw()
	local v = math.clamp(slider:GetAttribute("Value") or 0, 0, 1)
	fill.Size = UDim2.fromScale(v, 1)
	knob.Position = UDim2.fromScale(v, 0.5)
end
local function setFrom(x)
	slider:SetAttribute("Value", math.clamp((x - slider.AbsolutePosition.X) / slider.AbsoluteSize.X, 0, 1))
end
local function press(i) return i.UserInputType == Enum.UserInputType.MouseButton1 or i.UserInputType == Enum.UserInputType.Touch end
slider.InputBegan:Connect(function(i) if press(i) then dragging = true setFrom(i.Position.X) end end)
UserInputService.InputChanged:Connect(function(i)
	if dragging and (i.UserInputType == Enum.UserInputType.MouseMovement or i.UserInputType == Enum.UserInputType.Touch) then setFrom(i.Position.X) end
end)
UserInputService.InputEnded:Connect(function(i) if press(i) then dragging = false end end)
slider:GetAttributeChangedSignal("Value"):Connect(draw)
draw()
`,
  Progress: `-- Set the "Value" attribute (0 to 1) from any script and the bar follows.
local bar = script.Parent
local fill = bar:WaitForChild("Fill")
local TweenService = game:GetService("TweenService")
local function draw()
	TweenService:Create(fill, TweenInfo.new(0.25, Enum.EasingStyle.Quad), { Size = UDim2.fromScale(math.clamp(bar:GetAttribute("Value") or 0, 0, 1), 1) }):Play()
end
bar:GetAttributeChangedSignal("Value"):Connect(draw)
draw()
`,
  Health: `-- Follows the player's health.
local bar = script.Parent
local fill, label = bar:WaitForChild("Fill"), bar:WaitForChild("Label")
local TweenService = game:GetService("TweenService")
local player = game:GetService("Players").LocalPlayer
local function watch(char)
	local hum = char:WaitForChild("Humanoid")
	local function draw()
		local k = hum.MaxHealth > 0 and math.clamp(hum.Health / hum.MaxHealth, 0, 1) or 0
		TweenService:Create(fill, TweenInfo.new(0.2), { Size = UDim2.fromScale(k, 1), BackgroundColor3 = Color3.fromRGB(242, 85, 85):Lerp(Color3.fromRGB(63, 207, 142), k) }):Play()
		label.Text = math.ceil(hum.Health) .. " / " .. math.ceil(hum.MaxHealth)
	end
	hum.HealthChanged:Connect(draw)
	hum:GetPropertyChangedSignal("MaxHealth"):Connect(draw)
	draw()
end
if player.Character then watch(player.Character) end
player.CharacterAdded:Connect(watch)
`,
  Notify: `-- Show a message from any LocalScript:
-- notify.Show:Fire("Saved!", 3)
local box = script.Parent
local label = box:WaitForChild("Label")
local TweenService = game:GetService("TweenService")
local hidden, shown = UDim2.new(0.5, 0, 0, -120), UDim2.new(0.5, 0, 0.03, 0)
box.Position = hidden
local token = 0
box:WaitForChild("Show").Event:Connect(function(text, seconds)
	token += 1
	local mine = token
	label.Text = tostring(text)
	TweenService:Create(box, TweenInfo.new(0.3, Enum.EasingStyle.Back), { Position = shown }):Play()
	task.wait(seconds or 3)
	if mine == token then TweenService:Create(box, TweenInfo.new(0.25, Enum.EasingStyle.Quad), { Position = hidden }):Play() end
end)
`,
  Popup: `-- Open it from any LocalScript with popup.Open:Fire(), or set Visible.
local popup = script.Parent
local panel = popup:WaitForChild("Panel")
local TweenService = game:GetService("TweenService")
local scale = panel:FindFirstChildOfClass("UIScale") or Instance.new("UIScale")
scale.Parent = panel
local function open()
	popup.Visible = true
	scale.Scale = 0.85
	TweenService:Create(scale, TweenInfo.new(0.2, Enum.EasingStyle.Back), { Scale = 1 }):Play()
end
popup:WaitForChild("Open").Event:Connect(open)
panel:WaitForChild("Close").Activated:Connect(function() popup.Visible = false end)
`,
  Tabs: `-- Each tab button shows the page with the same number.
local root = script.Parent
local bar, pages = root:WaitForChild("Bar"), root:WaitForChild("Pages")
local active, idle = root:GetAttribute("ActiveColor"), root:GetAttribute("IdleColor")
local function show(n)
	for _, b in bar:GetChildren() do
		if b:IsA("TextButton") then b.BackgroundColor3 = b.Name == "Tab" .. n and active or idle end
	end
	for _, p in pages:GetChildren() do
		if p:IsA("GuiObject") then p.Visible = p.Name == "Page" .. n end
	end
end
for _, b in bar:GetChildren() do
	if b:IsA("TextButton") then b.Activated:Connect(function() show(tonumber(string.match(b.Name, "%d+"))) end) end
end
show(1)
`,
};
const GK_BUILD = {
  Button: `local b = make("TextButton", { Name = "Button", Size = UDim2.fromScale(0.18, 0.08), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5),
	BackgroundColor3 = ACC, Text = TEXT ~= "" and TEXT or "Play", TextColor3 = Color3.new(1, 1, 1), Font = FONT, TextScaled = true, AutoButtonColor = false }, parent)
round(b, RAD)
make("UIStroke", { Color = ACC:Lerp(Color3.new(0, 0, 0), 0.35), Thickness = 2, ApplyStrokeMode = Enum.ApplyStrokeMode.Border }, b)
make("UIPadding", { PaddingTop = UDim.new(0.2, 0), PaddingBottom = UDim.new(0.2, 0) }, b)
make("UIAspectRatioConstraint", { AspectRatio = 3.2 }, b)
return b`,
  Toggle: `local t = make("TextButton", { Name = "Toggle", Text = "", AutoButtonColor = false, Size = UDim2.fromScale(0.07, 0.05), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5), BackgroundColor3 = MUTE }, parent)
round(t, UDim.new(1, 0))
make("UIAspectRatioConstraint", { AspectRatio = 1.9 }, t)
local k = make("Frame", { Name = "Knob", Size = UDim2.fromScale(0.42, 0.8), AnchorPoint = Vector2.new(0, 0.5), Position = UDim2.fromScale(0.06, 0.5), BackgroundColor3 = Color3.new(1, 1, 1) }, t)
round(k, UDim.new(1, 0))
make("UIAspectRatioConstraint", { AspectRatio = 1 }, k)
t:SetAttribute("On", false)
t:SetAttribute("OnColor", ACC)
return t`,
  Slider: `local s = make("TextButton", { Name = "Slider", Text = "", AutoButtonColor = false, Size = UDim2.fromScale(0.25, 0.025), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5), BackgroundColor3 = MUTE }, parent)
round(s, UDim.new(1, 0))
make("UIAspectRatioConstraint", { AspectRatio = 14 }, s)
local f = make("Frame", { Name = "Fill", Size = UDim2.fromScale(0.5, 1), BackgroundColor3 = ACC }, s)
round(f, UDim.new(1, 0))
local k = make("Frame", { Name = "Knob", Size = UDim2.fromScale(2.2, 2.2), SizeConstraint = Enum.SizeConstraint.RelativeYY, AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), BackgroundColor3 = Color3.new(1, 1, 1), ZIndex = 2 }, s)
round(k, UDim.new(1, 0))
make("UIStroke", { Color = ACC, Thickness = 2 }, k)
s:SetAttribute("Value", 0.5)
return s`,
  Progress: `local b = make("Frame", { Name = "ProgressBar", Size = UDim2.fromScale(0.3, 0.035), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5), BackgroundColor3 = MUTE }, parent)
round(b, UDim.new(1, 0))
make("UIAspectRatioConstraint", { AspectRatio = 12 }, b)
local f = make("Frame", { Name = "Fill", Size = UDim2.fromScale(0.4, 1), BackgroundColor3 = ACC }, b)
round(f, UDim.new(1, 0))
b:SetAttribute("Value", 0.4)
return b`,
  Health: `local b = make("Frame", { Name = "HealthBar", Size = UDim2.fromScale(0.22, 0.04), Position = UDim2.new(0.02, 0, 0.94, 0), AnchorPoint = Vector2.new(0, 1), BackgroundColor3 = BG }, parent)
round(b, RAD)
make("UIStroke", { Color = Color3.new(0, 0, 0), Transparency = 0.6, Thickness = 2 }, b)
make("UIAspectRatioConstraint", { AspectRatio = 8 }, b)
local f = make("Frame", { Name = "Fill", Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(63, 207, 142) }, b)
round(f, RAD)
make("TextLabel", { Name = "Label", Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Text = "100 / 100", TextColor3 = Color3.new(1, 1, 1), TextScaled = true, Font = FONT, ZIndex = 2 }, b)
make("UIPadding", { PaddingTop = UDim.new(0.18, 0), PaddingBottom = UDim.new(0.18, 0) }, b.Label)
return b`,
  Notify: `local n = make("Frame", { Name = "Notify", Size = UDim2.fromScale(0.3, 0.07), AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0.03, 0), BackgroundColor3 = BG }, parent)
round(n, RAD)
make("UIStroke", { Color = ACC, Thickness = 2 }, n)
make("UIAspectRatioConstraint", { AspectRatio = 6 }, n)
local l = make("TextLabel", { Name = "Label", Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Text = TEXT ~= "" and TEXT or "Saved!", TextColor3 = FG, TextScaled = true, Font = FONT }, n)
make("UIPadding", { PaddingTop = UDim.new(0.22, 0), PaddingBottom = UDim.new(0.22, 0), PaddingLeft = UDim.new(0.05, 0), PaddingRight = UDim.new(0.05, 0) }, l)
make("BindableEvent", { Name = "Show" }, n)
return n`,
  Popup: `local p = make("Frame", { Name = "Popup", Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.new(0, 0, 0), BackgroundTransparency = 0.45, Visible = true, ZIndex = 10 }, parent)
local panel = make("Frame", { Name = "Panel", Size = UDim2.fromScale(0.42, 0.5), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5), BackgroundColor3 = BG, ZIndex = 11 }, p)
round(panel, RAD)
make("UIAspectRatioConstraint", { AspectRatio = 1.5 }, panel)
make("TextLabel", { Name = "Title", Size = UDim2.fromScale(0.8, 0.16), Position = UDim2.fromScale(0.06, 0.06), BackgroundTransparency = 1, Text = TEXT ~= "" and TEXT or "Welcome!", TextColor3 = FG, TextScaled = true, Font = FONT, TextXAlignment = Enum.TextXAlignment.Left, ZIndex = 12 }, panel)
make("TextLabel", { Name = "Body", Size = UDim2.fromScale(0.88, 0.5), Position = UDim2.fromScale(0.06, 0.28), BackgroundTransparency = 1, Text = "Your text here.", TextColor3 = FG, TextTransparency = 0.25, TextScaled = true, TextWrapped = true, Font = Enum.Font.Gotham, TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top, ZIndex = 12 }, panel)
local c = make("TextButton", { Name = "Close", Size = UDim2.fromScale(0.1, 0.1), SizeConstraint = Enum.SizeConstraint.RelativeXX, Position = UDim2.fromScale(0.97, 0.03), AnchorPoint = Vector2.new(1, 0), BackgroundColor3 = ACC, Text = "X", TextColor3 = Color3.new(1, 1, 1), TextScaled = true, Font = FONT, ZIndex = 12 }, panel)
round(c, RAD)
make("BindableEvent", { Name = "Open" }, p)
return p`,
  Tabs: `local r = make("Frame", { Name = "Tabs", Size = UDim2.fromScale(0.5, 0.55), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5), BackgroundColor3 = BG }, parent)
round(r, RAD)
make("UIAspectRatioConstraint", { AspectRatio = 1.5 }, r)
r:SetAttribute("ActiveColor", ACC)
r:SetAttribute("IdleColor", MUTE)
local bar = make("Frame", { Name = "Bar", Size = UDim2.fromScale(0.92, 0.13), Position = UDim2.fromScale(0.04, 0.04), BackgroundTransparency = 1 }, r)
make("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0.02, 0), SortOrder = Enum.SortOrder.Name }, bar)
local pages = make("Frame", { Name = "Pages", Size = UDim2.fromScale(0.92, 0.75), Position = UDim2.fromScale(0.04, 0.21), BackgroundTransparency = 1 }, r)
for i = 1, 3 do
	local t = make("TextButton", { Name = "Tab" .. i, Size = UDim2.fromScale(0.32, 1), BackgroundColor3 = i == 1 and ACC or MUTE, Text = "Tab " .. i, TextColor3 = Color3.new(1, 1, 1), TextScaled = true, Font = FONT, AutoButtonColor = false }, bar)
	round(t, RAD)
	make("UIPadding", { PaddingTop = UDim.new(0.2, 0), PaddingBottom = UDim.new(0.2, 0) }, t)
	make("TextLabel", { Name = "Page" .. i, Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Text = "Page " .. i, TextColor3 = FG, TextScaled = true, Font = FONT, Visible = i == 1 }, pages)
end
return r`,
};
const GK_NAMES = { Button: "Button", Toggle: "Toggle switch", Slider: "Slider", Progress: "Progress bar", Health: "Health bar", Notify: "Notification", Popup: "Popup", Tabs: "Tabs" };
const gk = { pick: "Button" };
WK_TOOLS.guikit = {
  name: "GUI kit", group: "Build", desc: "Drop ready-made GUI pieces into your game - buttons, toggles, sliders, bars, popups, tabs. They're normal, editable instances, sized for phones too, with the behaviour in its own LocalScript.",
  html: () => `
    <div class="gk-grid">${Object.entries(GK_NAMES).map(([k, t]) => `<button class="gk-card${gk.pick === k ? " on" : ""}" data-act="pick" data-k="${k}"><span class="gk-pv gk-${k.toLowerCase()}"><i></i><b></b></span>${t}</button>`).join("")}</div>
    <div class="wk-grid">
      ${fld("Text", `<input class="input" id="gk-text" placeholder="(default)" maxlength="40" />`)}
      ${fld("Accent", `<input type="color" id="gk-acc" value="#3a86ff" />`)}
      ${fld("Look", seg("gk-theme", [["dark", "Dark"], ["light", "Light"]], "dark"))}
      ${fld("Corners", `<input class="input" id="gk-rad" type="number" min="0" max="40" value="10" />`, "pixels")}
      ${fld("Font", `<select class="input" id="gk-font">${["GothamBold", "FredokaOne", "LuckiestGuy", "Bangers", "SourceSansBold", "Arcade", "Cartoon"].map((f) => `<option>${f}</option>`).join("")}</select>`)}
    </div>
    <div class="row"><button class="btn primary" data-act="add">Add ${esc(GK_NAMES[gk.pick])}</button></div>
    <p class="muted small-p">Goes inside the selected ScreenGui or frame, or a new ScreenGui called VSGui in StarterGui.</p>`,
  async act(a, btn) {
    if (a === "pick") { gk.pick = btn.dataset.k; wkShow("guikit"); return; }
    const dark = segVal("gk-theme") !== "light", k = gk.pick;
    await wkRun("GUI kit", `local SG = game:GetService("StarterGui")
local s0 = sel[1]
local parent = s0 and (s0:IsA("GuiObject") or s0:IsA("LayerCollector")) and s0 or nil
if not parent then
	parent = SG:FindFirstChild("VSGui")
	if not parent then
		parent = Instance.new("ScreenGui")
		parent.Name = "VSGui"
		parent.ResetOnSpawn = false
		parent.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
		parent.Parent = SG
	end
end
local ACC = Color3.fromHex(${lq(val("gk-acc").replace("#", "") || "3a86ff")})
local BG, FG, MUTE = Color3.fromHex(${lq(dark ? "1c1f26" : "f4f5f8")}), Color3.fromHex(${lq(dark ? "f2f3f5" : "1c1f26")}), Color3.fromHex(${lq(dark ? "3a3f4b" : "c9ced8")})
local RAD = UDim.new(0, ${Math.round(lnum(val("gk-rad"), 10, 0, 40))})
local okF, FONT = pcall(function() return Enum.Font[${lq(val("gk-font"))}] end)
if not okF then FONT = Enum.Font.GothamBold end
local TEXT = ${luaExact(val("gk-text").trim())}
local function make(cls, props, par)
	local o = Instance.new(cls)
	for key, v in props do o[key] = v end
	o.Parent = par
	return o
end
local function round(o, r) make("UICorner", { CornerRadius = r }, o) end
local function build()
${GK_BUILD[k]}
end
local root = build()
local ls = Instance.new("LocalScript")
ls.Name = "Behaviour"
ls.Source = ${longStr(GK_SRC[k])}
ls.Parent = root
game:GetService("Selection"):Set({ root })
return "Added a ${GK_NAMES[k]} to " .. parent:GetFullName()`, btn);
  },
};

// ── Physics check: what falls or flies apart when you press Play ────────────
const PH_SCAN = (act) => `local HS = game:GetService("HttpService")
local groups, order = {}, {}
for _, p in workspace:GetDescendants() do
	if p:IsA("BasePart") and not p.Anchored and not p:IsA("Terrain") then
		local m = p:FindFirstAncestorWhichIsA("Model")
		if not (m and m:FindFirstChildWhichIsA("Humanoid")) and not p:FindFirstAncestorWhichIsA("Tool") and not p:FindFirstAncestorWhichIsA("Accessory") then
			local ok, grounded = pcall(function() return p:IsGrounded() end)
			if ok and not grounded then
				local root = p.AssemblyRootPart or p
				if not groups[root] then groups[root] = { parts = {} } table.insert(order, root) end
				table.insert(groups[root].parts, p)
			end
		end
	end
end
${act === "anchor" ? `local n = 0
for _, r in order do for _, p in groups[r].parts do p.Anchored = true n += 1 end end
return "Anchored " .. n .. " loose parts"` : act === "select" ? `local list = {}
for _, r in order do table.insert(list, r:FindFirstAncestorWhichIsA("Model") or r) end
game:GetService("Selection"):Set(list)
return "Selected " .. #list .. " loose things in Studio"` : `local out = {}
for i, r in order do
	if i > 60 then break end
	local m = r:FindFirstAncestorWhichIsA("Model")
	local seat = m and m:FindFirstChildWhichIsA("VehicleSeat", true)
	table.insert(out, { name = (m or r):GetFullName(), n = #groups[r].parts, seat = seat ~= nil })
end
return HS:JSONEncode({ groups = out, total = #order })`}`;
const ph = { data: null };
WK_TOOLS.physics = {
  name: "Physics check", group: "Check", desc: "Finds everything that isn't anchored and isn't attached to anything anchored - it falls, rolls or flies apart the moment you press Play.",
  html: () => `<div class="row"><button class="btn primary" data-act="scan">Check</button>${ph.data && ph.data.total ? '<button class="btn" data-act="select">Select them</button><button class="btn" data-act="anchor">Anchor them all</button>' : ""}</div>
    <div id="ph-out">${ph.data ? (ph.data.total ? `<p class="muted small-p">${ph.data.total} loose thing${ph.data.total === 1 ? "" : "s"}. Props, vehicles and physics toys are meant to move - anchor only what should stay put.</p>` + ph.data.groups.map((g) => `<div class="tg-row"><code class="co-n">${esc(g.name)}</code><span class="tag">${g.n} part${g.n === 1 ? "" : "s"}</span>${g.seat ? '<span class="nav-b">vehicle</span>' : ""}</div>`).join("") : '<p class="uc-good">Everything is anchored or attached to something anchored.</p>') : '<p class="muted small-p">Characters, tools and accessories are skipped.</p>'}</div>`,
  async act(a, btn) {
    if (a === "scan") {
      btn.disabled = true; btn.textContent = "Checking…";
      try { ph.data = JSON.parse(await stLuau(PH_SCAN(null), 60000)); wkShow("physics"); } catch (e) { toast(errText(e), 5000); }
      finally { btn.disabled = false; btn.textContent = "Check"; }
      return;
    }
    if (a === "select") { try { toast(await stLuau(PH_SCAN("select"), 60000)); } catch (e) { toast(errText(e)); } return; }
    if (a === "anchor" && await wkRun("Anchor loose parts", PH_SCAN("anchor"), btn)) { ph.data = null; wkShow("physics"); }
  },
};

// ── Bookmarks: camera views and selections to jump back to ─────────────────
let bm = [];
try { bm = JSON.parse(lsGet("vs-bookmarks") || "[]"); } catch {}
const bmSave = () => lsSet("vs-bookmarks", JSON.stringify(bm.slice(0, 60)));
WK_TOOLS.bookmarks = {
  name: "Bookmarks", group: "Plan", desc: "Save where the Studio camera is, or what you have selected, and jump straight back to it later.",
  html: () => `<div class="row"><input class="input grow" id="bm-name" placeholder="Name (e.g. Shop area, Boss room)" maxlength="40" /><button class="btn" data-act="view">Save camera view</button><button class="btn" data-act="sel">Save selection</button></div>
    <div class="bm-list">${bm.length ? bm.map((b, i) => `<div class="tg-row"><span class="nav-b">${b.kind === "view" ? "view" : "selection"}</span><b>${esc(b.name)}</b><span class="muted">${esc(b.place || "")}${b.kind === "sel" ? ` · ${b.paths.length} thing${b.paths.length === 1 ? "" : "s"}` : ""}</span><span class="grow"></span>
      <button class="btn sm primary" data-act="go" data-i="${i}">${b.kind === "view" ? "Go there" : "Select"}</button><button class="link" data-act="del" data-i="${i}">Delete</button></div>`).join("") : '<p class="muted small-p">Nothing saved yet.</p>'}</div>`,
  async act(a, btn) {
    if (a === "del") { bm.splice(Number(btn.dataset.i), 1); bmSave(); wkShow("bookmarks"); return; }
    if (a === "view" || a === "sel") {
      try {
        const r = JSON.parse(await stLuau(`local HS = game:GetService("HttpService")
${WK_IDX}local cf = workspace.CurrentCamera.CFrame
local paths = {}
for _, o in game:GetService("Selection"):Get() do table.insert(paths, idx(o)) end
return HS:JSONEncode({ place = game.Name, cf = { cf:GetComponents() }, paths = paths })`));
        if (a === "sel" && !r.paths.length) { toast("Select something in Studio first."); return; }
        bm.unshift({ kind: a, name: val("bm-name").trim() || (a === "view" ? "View" : "Selection") + " " + (bm.length + 1), place: r.place, cf: r.cf, paths: a === "sel" ? r.paths : [] });
        bmSave(); wkShow("bookmarks"); toast("Saved.");
      } catch (e) { toast(errText(e), 5000); }
      return;
    }
    if (a === "go") {
      const b = bm[Number(btn.dataset.i)];
      try {
        toast(await stLuau(b.kind === "view" ? `workspace.CurrentCamera.CFrame = CFrame.new(${b.cf.map(Number).join(", ")}) return "Moved the camera to ${b.name.replace(/"/g, "")}"`
          : `${WK_RESOLVE}local list = {}
for _, p in HS:JSONDecode(${luaExact(JSON.stringify(b.paths))}) do local o = resolve(p) if o then table.insert(list, o) end end
game:GetService("Selection"):Set(list)
return "Selected " .. #list .. " of ${b.paths.length}" .. (#list < ${b.paths.length} and " (the rest moved or were deleted)" or "")`));
      } catch (e) { toast(errText(e), 5000); }
    }
  },
};

if (WK_TOOLS[lsGet("vs-wk-tool")]) wkShow(lsGet("vs-wk-tool")); else wkNav();
