// SPDX-License-Identifier: GPL-3.0-or-later
// uikit.js - the UI builder's shared core (desktop app + extension).
// The AI describes a ScreenGui as a flat list of elements (JSON); this previews
// it as HTML and turns it into the Luau that builds it in StarterGui.
"use strict";

const VSUI = (() => {
  const TYPES = ["Frame", "TextLabel", "TextButton", "TextBox", "ScrollingFrame"];
  const FONTS = ["Gotham", "GothamMedium", "GothamBold", "GothamBlack", "SourceSans", "SourceSansBold", "FredokaOne", "LuckiestGuy", "Arcade", "Cartoon", "Bangers", "Oswald"];
  const MAX = 150;

  // The design guide: what front-page Roblox UI artists actually do.
  const DESIGN = `- It must look like a real, popular Roblox game made by a human UI artist - NOT like an AI or a web dashboard. Never use: purple/pink/teal
  "AI" gradients, emoji as icons, glassy see-through panels, thin 1px borders, tiny grey text, identical cards with soft shadows, or filler
  copy like "Welcome!" or "Lorem ipsum". Write short, real game text (BUY, 250, EQUIP, LEVEL 12, x2 SPEED).
- Craft it like a pro Roblox UI artist:
  1. One clear focal point: the main panel or main button is the biggest, brightest thing. Everything else supports it.
  2. Sizes that read on a phone: titles 44-64, buttons 28-40, labels 22-28, nothing under 18. Buttons at least 56px tall, close buttons 56-64px square.
  3. Icons are built from shapes, never emoji: a coin = gold circle Frame (r = half its size) with a darker gold stroke and a "$" or "C" in it;
     an item = a rounded square in the item's colour with a big letter, number or simple shape inside; close = a red rounded square TextButton with a thick white "X".
  4. Depth on every card: an outer frame, an inner frame 8-12px smaller in a slightly lighter or darker shade, and a solid shadow (sh) under the outer one.
  5. A title that breaks the panel edge: a banner or ribbon frame centred on the panel's top edge (a: [0.5,0.5] at pos [0.5,0,0,0]) holding the title text.
  6. Even spacing: a 16 or 24px rhythm, pad (pad) on every panel, list layouts for rows of repeated items, equal gaps between cards.
  7. Contrast: light text over a coloured fill always gets a dark outline (o) in a darker shade of that fill. Never light text on light fills.
  8. Colour roles: one main panel colour, a darker shade of it for strokes, shadows and outlines, green for buy/confirm, red for close/cancel,
     gold for currency, and white or near-white text. Price tags sit on their own small pill frame.
  9. Close button pinned to the panel's top-right corner, half outside it (a: [0.5,0.5] at pos [1,0,0,0]).
  10. Give repeated items variety (different item colours and names) - never copies of one card.
- Layout recipes:
  Shop: a centred panel ~640x440 with a title ribbon, a currency counter top-left, 3-4 item cards in a row (icon, name, price pill, green BUY), a close X.
  HUD: currency counters top-left (coin icon + number on a dark pill), health/XP bars bottom-centre (track frame + coloured fill + value text), menu buttons down the left edge (big square icon buttons with labels).
  Main menu: the game title huge with a thick outline in the top half, a column of 3 big buttons (PLAY in green and largest), a version label bottom-right.
  Inventory: a panel with a tab row (selected tab brighter), a ScrollingFrame grid of square item slots with rarity-coloured strokes, an item info box on the right.
  Settings: a panel with rows (label left, toggle or slider right), toggles as a rounded track with a knob, ON in green.
  Reward / popup: a smaller centred panel with a ribbon title, a big reward icon, the amount in large text, one big CLAIM button.`;

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
- Place top-level panels with Scale positions so it works on every screen size. Inside a panel use pixel offsets.
- "script" is the LocalScript that goes inside the ScreenGui and makes it work (buttons, open/close, hovers, values).
  Find elements with gui:FindFirstChild("Name", true). Keep game logic that must be secure on the server - only call RemoteEvents from here.
- List parents before their children (the preview builds in that order).
${DESIGN}`;

  // A finished GUI at the quality bar (front-page simulator shop). Shown to the AI
  // as the standard to match - its look and craft, not its content.
  const EXAMPLE = '{"name":"ShopGui","elements":[' +
    '{"n":"Main","t":"Frame","pos":[0.5,0,0.5,0],"size":[0,640,0,430],"a":[0.5,0.5],"bg":"#3A86FF","r":22,"st":["#13366E",5,0],"sh":["#13366E",8]},' +
    '{"n":"Inner","t":"Frame","p":"Main","pos":[0.5,0,0.5,8],"size":[1,-28,1,-44],"a":[0.5,0.5],"bg":"#2E73E0","r":16},' +
    '{"n":"Ribbon","t":"Frame","p":"Main","pos":[0.5,0,0,0],"size":[0,300,0,70],"a":[0.5,0.5],"bg":"#FFC530","r":16,"st":["#A06A00",5,0],"sh":["#A06A00",6],"z":3},' +
    '{"n":"Title","t":"TextLabel","p":"Ribbon","pos":[0,0,0,0],"size":[1,0,1,0],"bt":1,"tx":"SHOP","tc":"#FFFFFF","ts":52,"f":"LuckiestGuy","o":["#A06A00",4],"z":4},' +
    '{"n":"Close","t":"TextButton","p":"Main","pos":[1,0,0,0],"size":[0,60,0,60],"a":[0.5,0.5],"bg":"#FF4D4D","r":14,"st":["#8C1A1A",4,0],"sh":["#8C1A1A",5],"tx":"X","tc":"#FFFFFF","ts":36,"f":"LuckiestGuy","o":["#8C1A1A",3],"z":5},' +
    '{"n":"Coins","t":"Frame","p":"Main","pos":[0,24,0,52],"size":[0,190,0,46],"bg":"#13366E","r":23},' +
    '{"n":"CoinIcon","t":"TextLabel","p":"Coins","pos":[0,4,0.5,0],"size":[0,38,0,38],"a":[0,0.5],"bg":"#FFC530","r":19,"st":["#A06A00",3,0],"tx":"$","tc":"#A06A00","ts":24,"f":"FredokaOne"},' +
    '{"n":"CoinText","t":"TextLabel","p":"Coins","pos":[0,50,0,0],"size":[1,-58,1,0],"bt":1,"tx":"1,250","tc":"#FFFFFF","ts":28,"f":"FredokaOne","o":["#0A1E40",2]},' +
    '{"n":"Items","t":"Frame","p":"Main","pos":[0.5,0,0,118],"size":[1,-56,0,280],"a":[0.5,0],"bt":1,"list":["Horizontal",18]},' +
    '{"n":"Card1","t":"Frame","p":"Items","size":[0,182,0,272],"bg":"#FFFFFF","r":18,"st":["#13366E",4,0],"sh":["#13366E",6]},' +
    '{"n":"Icon1","t":"TextLabel","p":"Card1","pos":[0.5,0,0,16],"size":[0,112,0,112],"a":[0.5,0],"bg":"#FFD23F","r":22,"st":["#A07800",4,0],"tx":"S","tc":"#FFFFFF","ts":64,"f":"LuckiestGuy","o":["#A07800",4]},' +
    '{"n":"Name1","t":"TextLabel","p":"Card1","pos":[0.5,0,0,136],"size":[1,-16,0,34],"a":[0.5,0],"bt":1,"tx":"SWORD","tc":"#13366E","ts":26,"f":"FredokaOne"},' +
    '{"n":"Buy1","t":"TextButton","p":"Card1","pos":[0.5,0,1,-16],"size":[1,-28,0,58],"a":[0.5,1],"bg":"#4CD964","r":14,"st":["#1E7A2E",4,0],"sh":["#1E7A2E",5],"tx":"100","tc":"#FFFFFF","ts":30,"f":"LuckiestGuy","o":["#1E7A2E",3]}' +
    '],"script":"..."}';

  // Looks real Roblox games actually use, each with an exact palette to start from.
  const STYLES = {
    chunky: "Style: front-page Roblox simulator. Palette: panel #3A86FF / stroke #13366E, gold #FFC530 / #A06A00, buy #4CD964 / #1E7A2E, close #FF4D4D / #8C1A1A, white text. Thick dark outlines (st 4-5px) in a darker shade of the fill, solid drop shadows (sh) under panels and buttons, LuckiestGuy or FredokaOne with dark text outlines (o), buttons 60px+ tall.",
    clean: "Style: clean and modern like a polished front-page game. Palette: panels #FFFFFF and #F2F4F8, text #1B2236, one accent #2F80FF (stroke #1D5BC4), buy #22C55E, close #EF4444. GothamBold/GothamBlack, generous spacing, rounded corners (r 14-20), a subtle darker solid shadow (sh 4) under buttons, no text outlines.",
    dark: "Style: dark and sleek like a shooter or horror game. Palette: panels #12141A and #1C1F27, strokes #2A2E38, one sharp accent #FF3B3B (or #00E0A4), text #F2F2F2, muted #9AA0AA. GothamBold/Oswald, squarer corners (r 4-8), 2px accent strokes, high contrast, uppercase labels.",
    cartoon: "Style: playful cartoon. Palette: panel #FF9F43 / stroke #9C4A00, cream #FFF4DC, mint #4ADE80 / #166534, sky #60A5FA / #1E40AF, berry #F472B6 / #9D174D. Very round corners (r 24+), Cartoon/FredokaOne/Bangers, thick outlines on everything (st 5), solid shadows, slightly tilted title text.",
  };
  const IMAGE_LINE = "\nA reference screenshot is attached: recreate that GUI as closely as you can - its layout, proportions, colours, fonts and decoration - adapted to the description.";
  // What the user has taught it: notes from their revisions and thumbs-downs,
  // and a GUI they liked as the bar for craft.
  function learned(extra) {
    const e = extra || {};
    let out = "";
    if (e.lessons && e.lessons.length) out += "\n\nThis user's feedback on earlier GUIs (follow it where it applies):\n" + e.lessons.map((l) => "- " + l).join("\n");
    out += "\n\nThe quality bar - a finished GUI by a pro Roblox UI artist. Match its craft (ribbon title, inner panel, shadows, outlines, icon built from shapes, price on a green button), not its content:\n" +
      (e.example ? JSON.stringify({ name: e.example.name, elements: e.example.elements.slice(0, 40) }) : EXAMPLE);
    return out;
  }
  // extra: { lessons, example, image } - all optional.
  function buildPrompt(description, style, extra) {
    const e = extra || {};
    return `Design a Roblox ScreenGui: ${String(description).trim()}\n${STYLES[style] || STYLES.chunky}` + (e.image ? IMAGE_LINE : "") + learned(e) + `\n\n${RULES}`;
  }
  function revisePrompt(spec, change, extra) {
    return `Here is a Roblox ScreenGui:\n${JSON.stringify(spec)}\n\nChange it: ${String(change).trim()}\n` +
      `Keep everything else the same unless the change needs it. Return the WHOLE updated GUI.` + learned(extra) + `\n\n${RULES}`;
  }

  // Same tolerance as VSModel.parse (shares its JSON helpers): a cut-off or broken
  // reply keeps every element it finished (spec.cut = true). live: still
  // streaming - never throws, null until there is something to show.
  function parse(text, live) {
    const J = VSModel.json, s = String(text || "");
    const start = s.indexOf("{");
    const end = start === -1 ? -1 : J.objEnd(s, start);
    if (end !== -1 && !live) {
      try { return normalize(J.loose(s.slice(start, end + 1))); } catch {}
    }
    const elements = J.salvage(s, "elements");
    if (elements.length >= (live ? 1 : 2)) {
      try {
        const spec = normalize({ name: J.field(s, "name"), elements, script: J.field(s, "script") });
        if (!live) spec.cut = true;
        return spec;
      } catch { if (live) return null; }
    }
    if (live) return null;
    if (start === -1) throw new Error("The AI didn't send a UI. Try again.");
    throw new Error(end === -1 ? "The UI was cut off before it finished. Try again." : "The AI's UI wasn't valid JSON. Try again.");
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
    polish(els, byName);
    return { name: String((raw && raw.name) || "VoidScriptGui").replace(/[^\w]/g, "").slice(0, 40) || "VoidScriptGui", elements: els, script: String((raw && raw.script) || "") };
  }

  // Fix what makes a GUI unreadable, whatever the AI sent: text too small for a
  // phone, buttons too short to tap, and text that blends into what's behind it.
  const rgb = (h) => { const v = parseInt(h.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; };
  const relLum = (h) => { const [r, g, b] = rgb(h).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const shade = (h, k) => "#" + rgb(h).map((c) => Math.round(c * k).toString(16).padStart(2, "0")).join("").toUpperCase();
  function polish(els, byName) {
    for (const e of els) {
      if (e.tx == null) continue;
      e.ts = Math.max(e.ts, 18);
      if (e.t === "TextButton" && e.size[2] === 0 && e.size[3] > 0 && e.size[3] < 44) e.size[3] = 48;
      // What the text actually sits on: its own fill, or the nearest filled parent.
      let back = null, cur = e, hops = 0;
      while (cur && hops++ < 40) { if (cur.bt < 0.5) { back = cur.bg; break; } cur = cur.p ? byName.get(cur.p) : null; }
      back = back || "#7FB3E6"; // the sky behind a GUI with no panel
      if (contrast(e.tc, back) >= 3 || e.o) continue;
      const light = contrast("#FFFFFF", back) >= contrast("#111111", back);
      if (relLum(back) > 0.3) { e.tc = "#FFFFFF"; e.o = [shade(back, 0.45), 3]; } // game style: white text, dark outline
      else e.tc = light ? "#FFFFFF" : "#111111";
    }
  }

  // ── preview: HTML at a 16:9 "screen" that scales with its container ─────────
  const CSS_FAMILY = { LuckiestGuy: "'Luckiest Guy','Lilita One',Impact,sans-serif", FredokaOne: "'Fredoka One','Fredoka','Arial Rounded MT Bold',sans-serif",
    Cartoon: "'Comic Sans MS','Chalkboard SE',sans-serif", Bangers: "Bangers,Impact,sans-serif", Oswald: "Oswald,'Arial Narrow',sans-serif", Arcade: "'Press Start 2P',monospace" };
  const CSS_FONT = { Gotham: "500", GothamMedium: "600", GothamBold: "700", GothamBlack: "900", SourceSans: "400", SourceSansBold: "700",
    FredokaOne: "700", LuckiestGuy: "900", Arcade: "700", Cartoon: "700", Bangers: "800", Oswald: "600" };
  // Screens to preview on, in the pixels Roblox lays a GUI out in. A phone is far
  // smaller, so a GUI built from pixel offsets overflows there - that's the point.
  const DEVICES = { pc: [1920, 1080], tablet: [1366, 1024], phone: [844, 390] };
  function render(host, spec, device) {
    const [W, H] = DEVICES[device] || DEVICES.pc;
    host.innerHTML = "";
    const screen = document.createElement("div");
    screen.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;overflow:hidden;` +
      "background:linear-gradient(180deg,#7fb3e6 0%,#bcd9ef 55%,#6aa35b 55%,#4f8a44 100%);font-family:Montserrat,'Segoe UI',system-ui,sans-serif";
    host.appendChild(screen);
    const fit = () => { const k = Math.min(host.clientWidth / W, host.clientHeight / H); screen.style.transform = `scale(${k})`; screen.style.left = (host.clientWidth - W * k) / 2 + "px"; screen.style.top = (host.clientHeight - H * k) / 2 + "px"; };
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
    // One observer per host: re-rendering (live preview, revisions) must not stack them.
    if (host.__vsFit) host.__vsFit.disconnect();
    if (typeof ResizeObserver !== "undefined") (host.__vsFit = new ResizeObserver(fit)).observe(host);
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
  // The feel every front-page GUI has: buttons grow on hover and squish on click,
  // panels pop in. Its own LocalScript so it never fights the GUI's logic.
  const ANIMATIONS = `-- Made with VoidScript: hover, press and pop-in animations.
local TweenService = game:GetService("TweenService")
local gui = script.Parent
local function scaler(o)
	local s = o:FindFirstChildOfClass("UIScale") or Instance.new("UIScale")
	s.Parent = o
	return s
end
local function tween(s, v, t, style)
	TweenService:Create(s, TweenInfo.new(t, style or Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Scale = v }):Play()
end
for _, b in gui:GetDescendants() do
	if b:IsA("GuiButton") then
		local s = scaler(b)
		b.MouseEnter:Connect(function() tween(s, 1.06, 0.12) end)
		b.MouseLeave:Connect(function() tween(s, 1, 0.12) end)
		b.MouseButton1Down:Connect(function() tween(s, 0.92, 0.06) end)
		b.MouseButton1Up:Connect(function() tween(s, 1.06, 0.1) end)
	end
end
local function popIn(f)
	local s = scaler(f)
	s.Scale = 0.6
	tween(s, 1, 0.35, Enum.EasingStyle.Back)
end
for _, f in gui:GetChildren() do
	if f:IsA("GuiObject") then
		if f.Visible then popIn(f) end
		f:GetPropertyChangedSignal("Visible"):Connect(function() if f.Visible then popIn(f) end end)
	end
end`;
  function toLuau(spec, opts) {
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
    if (!opts || opts.animate !== false) {
      L.push(`local an = Instance.new("LocalScript")`, `an.Name = "UIAnimations"`, `an.Source = ${longString(ANIMATIONS)}`, `an.Parent = gui`);
    }
    L.push(`gui.Parent = game:GetService("StarterGui")`, `CH:SetWaypoint("Added ${spec.name}")`,
      `return "Added ${spec.name} to StarterGui (" .. #gui:GetDescendants() .. " objects)"`);
    return L.join("\n");
  }

  // ── instant recolour (no AI) ────────────────────────────────────────────────
  // Moves the GUI's main colour family (every colour near the most-used panel
  // hue) to a new hue, keeping each one's lightness, so strokes and shadows stay
  // darker shades of the fill. Gold, green buy and red close buttons keep their roles.
  function hsl(h) {
    const [r, g, b] = rgb(h).map((c) => c / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const hue = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [hue * 60, s, l];
  }
  function fromHsl(H, S, L) {
    const k = (n) => (n + H / 30) % 12, a = S * Math.min(L, 1 - L);
    const c = (n) => Math.round(255 * (L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return "#" + [c(0), c(8), c(4)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  function recolor(spec, hue, sat) {
    // The theme is what the big panels are, not whatever there are most of (a
    // shop with 20 green BUY buttons is still a blue shop).
    const fills = spec.elements.filter((e) => e.bt < 0.5 && hsl(e.bg)[1] > 0.25);
    if (!fills.length) return spec;
    const count = new Map();
    for (const e of fills) {
      // Weight = rough on-screen area (scale parts measured against a 1920x1080 screen).
      const b = Math.round(hsl(e.bg)[0] / 30) % 12;
      const w = Math.max(1, e.size[0] * 1920 + e.size[1]) * Math.max(1, e.size[2] * 1080 + e.size[3]);
      count.set(b, (count.get(b) || 0) + w);
    }
    const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0] * 30;
    const near = (c) => { const [h, s] = hsl(c); return s > 0.2 && Math.min(Math.abs(h - main), 360 - Math.abs(h - main)) <= 32; };
    const move = (c) => { if (!c || !near(c)) return c; const [, s, l] = hsl(c); return fromHsl(hue, sat == null ? s : Math.min(s, sat), l); };
    const els = spec.elements.map((e) => {
      const n = Object.assign({}, e, { bg: move(e.bg), tc: e.tc && move(e.tc) });
      if (e.st) n.st = [move(e.st[0]), e.st[1], e.st[2]];
      if (e.sh) n.sh = [move(e.sh[0]), e.sh[1]];
      if (e.o) n.o = [move(e.o[0]), e.o[1]];
      if (e.g) n.g = [move(e.g[0]), move(e.g[1]), e.g[2]];
      return n;
    });
    return Object.assign({}, spec, { elements: els });
  }

  return { TYPES, FONTS, STYLES, IMAGE_LINE, DEVICES, buildPrompt, revisePrompt, parse, render, toLuau, recolor };
})();
if (typeof window !== "undefined") window.VSUI = VSUI;
