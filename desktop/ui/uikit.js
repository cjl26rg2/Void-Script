// SPDX-License-Identifier: GPL-3.0-or-later
// uikit.js - the UI builder's shared core (desktop app + extension).
// The AI describes a ScreenGui as a flat list of elements (JSON); this previews
// it as HTML and turns it into the Luau that builds it in StarterGui.
"use strict";

const VSUI = (() => {
  const TYPES = ["Frame", "TextLabel", "TextButton", "TextBox", "ScrollingFrame"];
  const FONTS = ["Gotham", "GothamMedium", "GothamBold", "GothamBlack", "SourceSans", "SourceSansBold", "FredokaOne", "LuckiestGuy", "Arcade", "Cartoon", "Bangers", "Oswald"];
  const MAX = 150;

  const RULES = `Answer with ONLY one JSON object, no other text, no code fences:
{"name":"ShopGui","elements":[{"n":"Main","t":"Frame","p":null,"pos":[0.5,0,0.5,0],"size":[0,560,0,380],"a":[0.5,0.5],"bg":"#2B6CD4","r":16,"st":["#123A7A",4,0],"sh":["#123A7A",6]},
{"n":"Title","t":"TextLabel","p":"Main","pos":[0.5,0,0,-24],"size":[0,260,0,56],"a":[0.5,0],"bt":1,"tx":"SHOP","tc":"#FFFFFF","ts":46,"f":"LuckiestGuy","o":["#123A7A",4]}],
"script":"local gui = script.Parent\\n..."}
- n: unique name. t: one of ${TYPES.join(", ")}. p: the parent element's name, or null for the top level.
- pos and size are UDim2 values [xScale, xOffset, yScale, yOffset]. a: AnchorPoint [x, y]. Screen is 1920x1080 at full scale.
- bg: background hex, bt: background transparency 0-1, r: corner radius px, st: border [hex, thickness, transparency],
  sh: solid drop shadow under the element [hex, offset px down], g: gradient [hexFrom, hexTo, rotationDegrees] (use rarely),
  z: ZIndex, tx: text, tc: text hex, ts: text size, f: font (${FONTS.join(", ")}), o: text outline [hex, thickness],
  pad: padding px, list: a UIListLayout ["Vertical" or "Horizontal", gap px] for frames that stack their children.
- Place top-level panels with Scale positions so it works on every screen size.
- "script" is the LocalScript that goes inside the ScreenGui and makes it work (buttons, open/close, hovers, values).
  Find elements with gui:FindFirstChild("Name", true). Keep game logic that must be secure on the server - only call RemoteEvents from here.
- It must look like a real, popular Roblox game made by a human UI artist - NOT like an AI or a web dashboard. Never use: purple/pink/teal
  "AI" gradients, emoji as icons, glassy see-through panels, thin 1px borders, tiny grey text, identical cards with soft shadows, or filler
  copy like "Welcome!" or "Lorem ipsum". Write short, real game text (BUY, 250, EQUIP, LEVEL 12).`;

  // Looks real Roblox games actually use. "chunky" is the front-page simulator style.
  const STYLES = {
    chunky: "Style: front-page Roblox simulator. Bright saturated flat colors, thick dark outlines (st 3-5px) in a darker shade of the fill, solid drop shadows (sh) under panels and buttons, big bold rounded fonts (LuckiestGuy, FredokaOne, GothamBlack) with dark text outlines (o), buttons 60px+ tall.",
    clean: "Style: clean and modern like a polished front-page game. Mostly white or very light panels with one strong accent color, GothamBold/GothamBlack text, generous spacing, rounded corners, a subtle darker shadow (sh) under buttons, no outlines on text.",
    dark: "Style: dark and sleek like a shooter or horror game. Near-black panels, one sharp accent color, GothamBold/Oswald text, squarer corners (r 4-8), thin bright accent lines, high contrast.",
    cartoon: "Style: playful cartoon. Warm pastel-but-saturated colors, very round corners, wobbly-feeling chunky fonts (Cartoon, FredokaOne, Bangers), thick outlines on everything, solid shadows.",
  };
  function buildPrompt(description, style) {
    return `Design a Roblox ScreenGui: ${String(description).trim()}\n${STYLES[style] || STYLES.chunky}\n\n${RULES}`;
  }
  function revisePrompt(spec, change) {
    return `Here is a Roblox ScreenGui:\n${JSON.stringify(spec)}\n\nChange it: ${String(change).trim()}\n` +
      `Keep everything else the same unless the change needs it. Return the WHOLE updated GUI.\n\n${RULES}`;
  }

  function parse(text) {
    const s = String(text || "");
    const start = s.indexOf("{");
    if (start === -1) throw new Error("The AI didn't send a UI. Try again.");
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) { end = i; break; }
    }
    if (end === -1) throw new Error("The UI was cut off before it finished. Try again.");
    let raw;
    try { raw = JSON.parse(s.slice(start, end + 1)); } catch { throw new Error("The AI's UI wasn't valid JSON. Try again."); }
    return normalize(raw);
  }

  const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const hex = (v, d) => (/^#?[0-9a-f]{6}$/i.test(String(v || "")) ? "#" + String(v).replace("#", "").toUpperCase() : d);
  const udim = (a, d) => (Array.isArray(a) && a.length >= 4 ? a.slice(0, 4).map((x, i) => n(x, d[i])) : d);
  function normalize(raw) {
    const list = Array.isArray(raw && raw.elements) ? raw.elements.slice(0, MAX) : [];
    const names = new Set();
    const els = [];
    for (const [i, e] of list.entries()) {
      let name = String(e.n || `${e.t || "Frame"}${i + 1}`).replace(/[^\w]/g, "").slice(0, 40) || `El${i + 1}`;
      while (names.has(name)) name += "_";
      names.add(name);
      const t = TYPES.find((x) => x.toLowerCase() === String(e.t || "").toLowerCase()) || "Frame";
      const el = {
        n: name, t, p: e.p ? String(e.p) : null,
        pos: udim(e.pos, [0, 0, 0, 0]), size: udim(e.size, [0, 100, 0, 40]),
        a: Array.isArray(e.a) ? [n(e.a[0], 0), n(e.a[1], 0)] : [0, 0],
        bg: hex(e.bg, "#2A2D3E"), bt: Math.min(Math.max(n(e.bt, 0), 0), 1),
        r: Math.max(n(e.r, 0), 0), z: Math.round(n(e.z, 1)),
      };
      if (Array.isArray(e.st)) el.st = [hex(e.st[0], "#FFFFFF"), Math.max(n(e.st[1], 1), 0), Math.min(Math.max(n(e.st[2], 0), 0), 1)];
      if (Array.isArray(e.g)) el.g = [hex(e.g[0], el.bg), hex(e.g[1], el.bg), n(e.g[2], 90)];
      if (Array.isArray(e.sh)) el.sh = [hex(e.sh[0], "#000000"), Math.min(Math.max(n(e.sh[1], 4), 0), 30)];
      if (t !== "Frame" && t !== "ScrollingFrame") {
        el.tx = String(e.tx == null ? "" : e.tx).slice(0, 300);
        el.tc = hex(e.tc, "#FFFFFF");
        el.ts = Math.min(Math.max(n(e.ts, 18), 6), 100);
        el.f = FONTS.find((f) => f.toLowerCase() === String(e.f || "").toLowerCase()) || "GothamMedium";
        if (Array.isArray(e.o)) el.o = [hex(e.o[0], "#000000"), Math.min(Math.max(n(e.o[1], 2), 0), 8)];
      }
      if (n(e.pad, 0) > 0) el.pad = n(e.pad, 0);
      if (Array.isArray(e.list)) el.list = [String(e.list[0]).toLowerCase().startsWith("h") ? "Horizontal" : "Vertical", Math.max(n(e.list[1], 0), 0)];
      els.push(el);
    }
    // Drop parents that don't exist (and anything that would loop back on itself).
    const byName = new Map(els.map((e) => [e.n, e]));
    for (const e of els) {
      let p = e.p, hops = 0;
      while (p && byName.has(p) && hops++ < 40) p = byName.get(p).p;
      if (e.p && (!byName.has(e.p) || hops >= 40)) e.p = null;
    }
    if (!els.length) throw new Error("The UI came back empty. Try describing it differently.");
    // Parents before children (stable), so every element's parent exists when it's built.
    const depth = (e) => { let d = 0, p = e.p; while (p && d < 40) { d++; p = byName.get(p).p; } return d; };
    els.sort((x, y) => depth(x) - depth(y));
    return { name: String((raw && raw.name) || "VoidScriptGui").replace(/[^\w]/g, "").slice(0, 40) || "VoidScriptGui", elements: els, script: String((raw && raw.script) || "") };
  }

  // ── preview: HTML at a 16:9 "screen" that scales with its container ─────────
  const CSS_FAMILY = { LuckiestGuy: "'Luckiest Guy','Lilita One',Impact,sans-serif", FredokaOne: "'Fredoka One','Fredoka','Arial Rounded MT Bold',sans-serif",
    Cartoon: "'Comic Sans MS','Chalkboard SE',sans-serif", Bangers: "Bangers,Impact,sans-serif", Oswald: "Oswald,'Arial Narrow',sans-serif", Arcade: "'Press Start 2P',monospace" };
  const CSS_FONT = { Gotham: "500", GothamMedium: "600", GothamBold: "700", GothamBlack: "900", SourceSans: "400", SourceSansBold: "700",
    FredokaOne: "700", LuckiestGuy: "900", Arcade: "700", Cartoon: "700", Bangers: "800", Oswald: "600" };
  function render(host, spec) {
    host.innerHTML = "";
    const screen = document.createElement("div");
    screen.style.cssText = "position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;overflow:hidden;" +
      "background:linear-gradient(180deg,#7fb3e6 0%,#bcd9ef 55%,#6aa35b 55%,#4f8a44 100%);font-family:Montserrat,'Segoe UI',system-ui,sans-serif";
    host.appendChild(screen);
    const fit = () => { const k = Math.min(host.clientWidth / 1920, host.clientHeight / 1080); screen.style.transform = `scale(${k})`; screen.style.left = (host.clientWidth - 1920 * k) / 2 + "px"; screen.style.top = (host.clientHeight - 1080 * k) / 2 + "px"; };
    const nodes = new Map();
    for (const e of spec.elements) {
      const d = document.createElement("div");
      const [xs, xo, ys, yo] = e.pos, [ws, wo, hs, ho] = e.size;
      d.style.cssText = `position:absolute;box-sizing:border-box;left:calc(${xs * 100}% + ${xo}px);top:calc(${ys * 100}% + ${yo}px);` +
        `width:calc(${ws * 100}% + ${wo}px);height:calc(${hs * 100}% + ${ho}px);transform:translate(${-e.a[0] * 100}%,${-e.a[1] * 100}%);` +
        `z-index:${e.z};border-radius:${e.r}px;overflow:${e.t === "ScrollingFrame" ? "auto" : "visible"};`;
      const bgAlpha = 1 - e.bt;
      d.style.background = e.g ? `linear-gradient(${90 + e.g[2]}deg, ${e.g[0]}, ${e.g[1]})` : e.bg;
      d.style.opacity = "";
      if (bgAlpha < 1) d.style.background = e.g ? d.style.background : hexA(e.bg, bgAlpha);
      if (e.bt >= 1 && !e.g) d.style.background = "transparent";
      const shadows = [];
      if (e.st) shadows.push(`inset 0 0 0 ${e.st[1]}px ${hexA(e.st[0], 1 - e.st[2])}`);
      if (e.sh) shadows.push(`0 ${e.sh[1]}px 0 ${e.sh[0]}`);
      if (shadows.length) d.style.boxShadow = shadows.join(",");
      if (e.pad) d.style.padding = e.pad + "px";
      if (e.list) { d.style.display = "flex"; d.style.flexDirection = e.list[0] === "Horizontal" ? "row" : "column"; d.style.gap = e.list[1] + "px"; d.dataset.flow = "1"; }
      if (e.tx != null) {
        d.style.display = d.style.display || "flex";
        d.style.alignItems = "center"; d.style.justifyContent = "center"; d.style.textAlign = "center";
        d.style.color = e.tc; d.style.fontSize = e.ts + "px"; d.style.fontWeight = CSS_FONT[e.f] || "600";
        if (CSS_FAMILY[e.f]) d.style.fontFamily = CSS_FAMILY[e.f];
        d.style.lineHeight = "1.15"; d.style.whiteSpace = "pre-wrap";
        if (e.o) { d.style.webkitTextStroke = `${e.o[1] * 2}px ${e.o[0]}`; d.style.paintOrder = "stroke fill"; }
        d.textContent = e.tx;
        if (e.t === "TextBox") { d.style.color = hexA(e.tc, 0.6); d.style.cursor = "text"; }
        if (e.t === "TextButton") d.style.cursor = "pointer";
      }
      nodes.set(e.n, d);
    }
    for (const e of spec.elements) {
      const parent = e.p ? nodes.get(e.p) : screen;
      const d = nodes.get(e.n);
      // Children of a list layout flow in order instead of using their own position.
      if (parent.dataset && parent.dataset.flow) { d.style.position = "relative"; d.style.left = d.style.top = ""; d.style.transform = ""; d.style.flex = "0 0 auto"; }
      parent.appendChild(d);
    }
    fit();
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(fit).observe(host);
  }
  function hexA(h, a) {
    const v = parseInt(h.slice(1), 16);
    return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},${Math.round(a * 1000) / 1000})`;
  }

  // ── Luau ────────────────────────────────────────────────────────────────────
  const f = (x) => String(Math.round(x * 1000) / 1000);
  const str = (s) => JSON.stringify(String(s));
  function longString(s) {
    let eq = "";
    while (s.includes("]" + eq + "]")) eq += "=";
    return `[${eq}[\n${s}\n]${eq}]`;
  }
  function toLuau(spec) {
    const L = [
      `-- ${spec.name} · ${spec.elements.length} elements · made with VoidScript`,
      `local CH = game:GetService("ChangeHistoryService")`,
      `CH:SetWaypoint("Before ${spec.name}")`,
      `local gui = Instance.new("ScreenGui")`,
      `gui.Name = ${str(spec.name)}`,
      `gui.ResetOnSpawn = false`,
      `gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling`,
      `gui.IgnoreGuiInset = true`,
      `local made = {}`,
    ];
    for (const e of spec.elements) {
      L.push(`do`, `\tlocal o = Instance.new("${e.t}")`, `\to.Name = ${str(e.n)}`,
        `\to.Position = UDim2.new(${e.pos.map(f).join(", ")})`, `\to.Size = UDim2.new(${e.size.map(f).join(", ")})`,
        `\to.AnchorPoint = Vector2.new(${f(e.a[0])}, ${f(e.a[1])})`, `\to.BackgroundColor3 = Color3.fromHex("${e.bg}")`,
        `\to.BackgroundTransparency = ${f(e.bt)}`, `\to.BorderSizePixel = 0`, `\to.ZIndex = ${e.z}`);
      if (e.tx != null) {
        L.push(`\to.Text = ${str(e.tx)}`, `\to.TextColor3 = Color3.fromHex("${e.tc}")`, `\to.TextSize = ${f(e.ts)}`,
          `\to.Font = Enum.Font.${e.f}`, `\to.TextWrapped = true`);
        if (e.t === "TextBox") L.push(`\to.PlaceholderText = o.Text`, `\to.Text = ""`, `\to.ClearTextOnFocus = false`);
        if (e.t === "TextButton") L.push(`\to.AutoButtonColor = true`);
      }
      if (e.t === "ScrollingFrame") L.push(`\to.ScrollBarThickness = 6`, `\to.AutomaticCanvasSize = Enum.AutomaticSize.Y`, `\to.CanvasSize = UDim2.new()`);
      if (e.r) L.push(`\tlocal c = Instance.new("UICorner") c.CornerRadius = UDim.new(0, ${f(e.r)}) c.Parent = o`);
      // One UIStroke per object: text elements with an outline use it for the text.
      if (e.o) L.push(`\tlocal s = Instance.new("UIStroke") s.Color = Color3.fromHex("${e.o[0]}") s.Thickness = ${f(e.o[1])} s.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual s.Parent = o`);
      else if (e.st) L.push(`\tlocal s = Instance.new("UIStroke") s.Color = Color3.fromHex("${e.st[0]}") s.Thickness = ${f(e.st[1])} s.Transparency = ${f(e.st[2])} s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border s.Parent = o`);
      if (e.sh) L.push(`\tlocal sh = Instance.new("Frame") sh.Name = ${str(e.n + "Shadow")} sh.Size = o.Size sh.AnchorPoint = o.AnchorPoint`,
        `\tsh.Position = o.Position + UDim2.fromOffset(0, ${f(e.sh[1])}) sh.BackgroundColor3 = Color3.fromHex("${e.sh[0]}") sh.BorderSizePixel = 0 sh.ZIndex = ${e.z - 1}`,
        `\tif ${e.r ? "true" : "false"} then local c = Instance.new("UICorner") c.CornerRadius = UDim.new(0, ${f(e.r)}) c.Parent = sh end`,
        `\tsh.Parent = ${e.p ? `made[${str(e.p)}] or gui` : "gui"}`);
      if (e.g) L.push(`\tlocal g = Instance.new("UIGradient") g.Color = ColorSequence.new(Color3.fromHex("${e.g[0]}"), Color3.fromHex("${e.g[1]}")) g.Rotation = ${f(e.g[2])} g.Parent = o`);
      if (e.pad) L.push(`\tlocal p = Instance.new("UIPadding") for _, k in {"PaddingTop", "PaddingBottom", "PaddingLeft", "PaddingRight"} do p[k] = UDim.new(0, ${f(e.pad)}) end p.Parent = o`);
      if (e.list) L.push(`\tlocal l = Instance.new("UIListLayout") l.FillDirection = Enum.FillDirection.${e.list[0]} l.Padding = UDim.new(0, ${f(e.list[1])}) l.SortOrder = Enum.SortOrder.LayoutOrder l.HorizontalAlignment = Enum.HorizontalAlignment.Center l.Parent = o`);
      L.push(`\to.Parent = ${e.p ? `made[${str(e.p)}] or gui` : "gui"}`, `\tmade[${str(e.n)}] = o`, `end`);
    }
    if (spec.script.trim()) {
      L.push(`local ls = Instance.new("LocalScript")`, `ls.Name = "UIController"`, `ls.Source = ${longString(spec.script)}`, `ls.Parent = gui`);
    }
    L.push(`gui.Parent = game:GetService("StarterGui")`, `CH:SetWaypoint("Added ${spec.name}")`,
      `return "Added ${spec.name} to StarterGui (" .. #gui:GetDescendants() .. " objects)"`);
    return L.join("\n");
  }

  return { TYPES, FONTS, STYLES, buildPrompt, revisePrompt, parse, render, toLuau };
})();
if (typeof window !== "undefined") window.VSUI = VSUI;
