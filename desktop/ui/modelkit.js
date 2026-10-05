// SPDX-License-Identifier: GPL-3.0-or-later
// modelkit.js - the model generator's shared core (desktop app + extension).
// The AI describes a model as a list of parts (JSON); this turns that into a
// preview-friendly spec and into the Luau that builds it in Studio.
"use strict";

const VSModel = (() => {
  const SHAPES = ["Block", "Ball", "Cylinder", "Wedge"];
  // Roblox's own materials. Studio draws each with a real texture (bricks, planks,
  // tiles...), so picking the right one is what makes a build look textured.
  const MATERIALS = ["SmoothPlastic", "Plastic", "Neon", "Glass", "ForceField",
    "Brick", "Cobblestone", "Concrete", "Pavement", "Asphalt", "Plaster", "CeramicTiles", "ClayRoofTiles", "RoofShingles",
    "Wood", "WoodPlanks", "Cardboard",
    "Metal", "CorrodedMetal", "DiamondPlate", "Foil",
    "Granite", "Marble", "Slate", "Basalt", "Limestone", "Sandstone", "Rock", "Pebble", "CrackedLava",
    "Grass", "LeafyGrass", "Ground", "Mud", "Sand", "Snow", "Ice", "Glacier", "Salt",
    "Fabric", "Carpet", "Leather", "Rubber"];
  const DETAIL = { low: [25, 50], medium: [60, 120], high: [130, 220] };
  const MAX_PARTS = 400;

  // One reply at every detail level, exactly like the 6.0 generator: the AI
  // places the whole model in one go. [lo, hi] parts.
  const PASSES = { low: [DETAIL.low], medium: [DETAIL.medium], high: [DETAIL.high] };

  // How it should look - one line added on top of the 6.0 rules.
  const STYLES = {
    realistic: "Style: realistic. Real proportions, real materials (Brick or Cobblestone walls, WoodPlanks floors, ClayRoofTiles or RoofShingles roofs, Glass windows, Metal machinery), muted believable colours.",
    lowpoly: "Style: low poly. Faceted and chunky: curves from angled Wedges and rotated Blocks instead of Balls and Cylinders, few but bold shapes, SmoothPlastic only, a soft palette of 4-5 colours with a darker shade of each for the shadowed facets.",
    cartoon: "Style: cartoon. Exaggerated proportions (big heads, chunky limbs, oversized details), rounded with Balls and Cylinders, bright saturated colours, SmoothPlastic with a little Neon for glows.",
    blocky: "Style: classic blocky Roblox. Mostly Blocks on a clean grid, sizes in whole or half studs, Plastic, bright primary colours.",
  };

  // The 6.0 generator's rules, word for word - only the material list is longer
  // (Roblox's newer textured materials) and point 6 says how to use them.
  const FIELDS = `- n: part name. s: shape, one of ${SHAPES.join(", ")}. p: center position [x,y,z] in studs. z: size [x,y,z] in studs.
- r: rotation [x,y,z] in degrees (applied Y, then X, then Z - like CFrame.fromOrientation). c: hex color. m: material, one of ${MATERIALS.join(", ")}.
- Y is up, -Z is the front. The model stands on y = 0 and is centered on x = 0, z = 0. Real-world scale: a character is about 5 studs tall.
- A Cylinder's length runs along its X size (like Roblox). A Wedge is tall at the back (+Z) and slopes down to the front (-Z).`;
  const CRAFT = `- Build it like a skilled Roblox builder, not a sketch:
  1. Get the silhouette and proportions right first (compare against the real thing).
  2. Layer it: a main body, then panels, trim, bevels and edges on top - never one plain box per section.
  3. Spend most of the parts on details that sell it: windows with frames, doors and seams, lights, grilles, vents, wheels with tyres AND hubs, eyes, feathers, fingers, claws, railings.
  4. Use Wedges for noses, roofs, slopes and tapers; Cylinders for wheels, pipes, limbs and poles; Balls for joints, eyes and rounded ends. Angle parts with rotations for curves and fans.
  5. Mirror left/right parts exactly where the real thing is symmetrical.
  6. Use a deliberate palette of 3-6 colors with darker accents for depth, and fitting materials - they show as real textures in Studio (Brick or Cobblestone walls, WoodPlanks floors, ClayRoofTiles roofs, Glass for windows, Metal for machinery, Neon for lights).
- Overlap parts slightly so there are no gaps. No floating parts. Use the full part budget.`;
  const RULES = `Answer with ONLY one JSON object, no other text, no code fences:
{"name":"Short Name","parts":[{"n":"Body","s":"Block","p":[0,4,0],"z":[4,3,6],"r":[0,0,0],"c":"#C0392B","m":"SmoothPlastic"}]}
${FIELDS}
${CRAFT}`;
  const DELTA = `Answer with ONLY one JSON object, no other text, no code fences:
{"remove":[3,17],"add":[{"n":"Spoiler","s":"Wedge","p":[0,4.2,7.5],"z":[6,0.6,1.5],"r":[0,0,0],"c":"#1B1B1B","m":"Metal"}]}
- remove: the "i" numbers of parts to delete (to change a part, remove it and add the new version). add: new parts.
${FIELDS}
${CRAFT}`;
  const IMAGE_LINE = "\nA reference picture is attached: copy it as closely as you can - its shape, proportions, colours and materials. The description just says what it is.";

  // What the user has taught it: notes from their revisions and thumbs-downs,
  // and a model they liked as the bar for craft.
  function learned(extra) {
    const e = extra || {};
    let out = "";
    if (e.lessons && e.lessons.length) out += "\n\nThis user's feedback on earlier models (follow it where it applies):\n" + e.lessons.map((l) => "- " + l).join("\n");
    if (e.example) out += "\n\nA model this user liked - match its level of craft and detail, not its subject:\n" +
      JSON.stringify({ name: e.example.name, parts: tight(e.example.parts.slice(0, 50)) });
    return out;
  }
  // The 6.0 prompt. extra: { lessons, example, budget:[lo,hi], style, image } - all optional.
  function buildPrompt(description, detail, extra) {
    const e = extra || {};
    const [lo, hi] = e.budget || DETAIL[detail] || DETAIL.medium;
    return `Design a Roblox model built from parts: ${String(description).trim()}\nUse between ${lo} and ${hi} parts.` +
      (STYLES[e.style] ? "\n" + STYLES[e.style] : "") + (e.image ? IMAGE_LINE : "") + learned(e) + `\n\n${RULES}`;
  }
  // A detail pass: add parts to a model, and fix any part that looks wrong.
  function detailPrompt(spec, description, budget, extra) {
    const [lo, hi] = budget;
    return `Here is a Roblox model of ${String(description).trim()}, made of parts (each has an index "i"):
${JSON.stringify(numbered(spec))}

` +
      `Do a detail pass like a top Roblox builder: add ${lo} to ${hi} NEW parts that make it look hand-built - trim, panel lines, frames, bolts, lights, ` +
      "bevels, smaller secondary shapes and anything the real thing has that this is missing. Do not repeat parts that exist. " +
      "Also remove and re-add any part that is floating, badly placed or the wrong size." + problems(extra) + learned(extra) + `

${DELTA}`;
  }
  // A repair pass: only the problems audit() found, nothing new.
  function fixPrompt(spec, description, issues, extra) {
    return `Here is a Roblox model of ${String(description).trim()}, made of parts (each has an index "i"):
${JSON.stringify(numbered(spec))}

` + `Fix ONLY the problems listed below: remove each listed part and add a corrected version in the right place, ` +
      "touching the part it belongs to. Do not add anything else." + problems({ issues }) + learned(Object.assign({}, extra, { example: null })) + `

${DELTA}`;
  }
  function problems(extra) {
    const list = (extra && extra.issues) || [];
    return list.length ? "\n\nProblems found in the current model - fix these first:\n" +
      list.slice(0, 20).map((x) => `- part ${x.i} "${x.n}": ${x.why}`).join("\n") : "";
  }
  // A change the user asked for, as remove/add - big models are too long to resend whole.
  function revisePrompt(spec, change, extra) {
    return `Here is a Roblox model made of parts (each has an index "i"):
${JSON.stringify(numbered(spec))}

` +
      `Change it: ${String(change).trim()}
Only touch the parts the change needs.` + learned(extra) + `

${DELTA}`;
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  const tight = (parts) => parts.map((p) => ({ n: p.n, s: p.s, p: p.p.map(r2), z: p.z.map(r2), r: p.r.map(r2), c: p.c, m: p.m }));
  const numbered = (spec) => ({ name: spec.name, parts: tight(spec.parts).map((p, i) => Object.assign({ i }, p)) });

  // The reply to a detail pass or revision. live: still streaming (never throws).
  function parseDelta(text, live) {
    const s = String(text || "");
    const add = normalizeParts(salvage(s, "add"));
    const rm = /"remove"\s*:\s*\[([^\]]*)\]/.exec(s);
    const remove = rm ? rm[1].split(",").map((x) => parseInt(x, 10)).filter(Number.isInteger) : [];
    if (!live && !add.length && !remove.length) throw new Error(s.indexOf("{") === -1 ? "The AI didn't send any changes. Try again." : "The AI's changes weren't readable. Try again.");
    return { add, remove };
  }
  // Check a model for the mistakes AI builders make, so a pass can fix them:
  // parts floating in mid-air (not connected to the rest or the ground) and
  // exact duplicates, which flicker in Studio. Duplicates are removed here
  // directly; everything else is returned as { i, n, why } for fixPrompt.
  function audit(spec) {
    const boxes = spec.parts.map(partBox);
    const keep = [], dup = new Set();
    const sig = new Map();
    spec.parts.forEach((p, i) => {
      const k = [p.s, ...p.p, ...p.z, ...p.r].map((v) => (typeof v === "number" ? Math.round(v * 20) : v)).join(",");
      if (sig.has(k)) dup.add(i); else sig.set(k, i);
    });
    spec.parts.forEach((p, i) => { if (!dup.has(i)) keep.push(i); });
    // Everything reachable from the ground through touching parts is supported.
    const pad = 0.12, near = (a, b) => [0, 1, 2].every((k) => a.lo[k] - pad <= b.hi[k] && b.lo[k] - pad <= a.hi[k]);
    const minY = Math.min(...keep.map((i) => boxes[i].lo[1]));
    const seen = new Set(keep.filter((i) => boxes[i].lo[1] - minY < 0.3));
    const queue = [...seen];
    while (queue.length) {
      const a = queue.pop();
      for (const b of keep) if (!seen.has(b) && near(boxes[a], boxes[b])) { seen.add(b); queue.push(b); }
    }
    const issues = keep.filter((i) => !seen.has(i)).map((i) => ({ i, n: spec.parts[i].n, why: "floating - it doesn't touch any other part" }));
    return { duplicates: dup.size, issues, spec: dup.size ? { name: spec.name, parts: keep.map((i) => spec.parts[i]) } : spec };
  }
  function partBox(p) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const [ry, rx, rz] = [p.r[1], p.r[0], p.r[2]].map((d) => (d * Math.PI) / 180);
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
      let v = [p.z[0] * sx, p.z[1] * sy, p.z[2] * sz];
      v = rot(v, rz, 2); v = rot(v, rx, 0); v = rot(v, ry, 1);
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k] + p.p[k]); hi[k] = Math.max(hi[k], v[k] + p.p[k]); }
    }
    return { lo, hi };
  }
  function applyDelta(spec, delta) {
    const drop = new Set(delta.remove);
    const parts = spec.parts.filter((_, i) => !drop.has(i)).concat(delta.add).slice(0, MAX_PARTS);
    if (!parts.length) throw new Error("That change would leave the model empty.");
    return { name: spec.name, parts };
  }

  // Pull the first JSON object out of a reply (tolerates prose, fences and
  // trailing text) and check it is a usable model. A reply that was cut off or
  // broken still gives back every part it finished (spec.cut = true).
  // live: for a reply still streaming - never throws, null until there are parts.
  function parse(text, live) {
    const s = String(text || "");
    const start = s.indexOf("{");
    const end = start === -1 ? -1 : objEnd(s, start);
    if (end !== -1 && !live) {
      try { return ground(normalize(loose(s.slice(start, end + 1)))); } catch {}
    }
    const parts = salvage(s, "parts");
    if (parts.length >= (live ? 1 : 3)) {
      const spec = normalize({ name: field(s, "name"), parts });
      if (!live) { spec.cut = true; ground(spec); }
      return spec;
    }
    if (live) return null;
    if (start === -1) throw new Error("The AI didn't send a model. Try again.");
    throw new Error(end === -1 ? "The model was cut off before it finished. Try again, or use a lower detail level."
      : "The AI's model wasn't valid JSON. Try again.");
  }

  // ── tolerant JSON helpers (shared shape with uikit.js) ──────────────────────
  // Index of the "}" closing the object that opens at `start`, or -1.
  function objEnd(s, start) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) return i;
    }
    return -1;
  }
  // JSON.parse that forgives what models get wrong most: raw newlines and tabs
  // inside strings, and trailing commas.
  function loose(src) {
    let out = "", inStr = false, esc = false;
    for (const ch of src) {
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        else if (ch === "\n") { out += "\\n"; continue; }
        else if (ch === "\r") continue;
        else if (ch === "\t") { out += "\\t"; continue; }
      } else if (ch === '"') inStr = true;
      out += ch;
    }
    try { return JSON.parse(out); } catch { return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1")); }
  }
  // Every complete object in the reply's `key` array, even if the reply stops
  // halfway through the array.
  function salvage(s, key) {
    const m = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(s);
    const out = [];
    if (!m) return out;
    let i = m.index + m[0].length;
    while (i < s.length) {
      while (i < s.length && /[\s,]/.test(s[i])) i++;
      if (s[i] !== "{") break;
      const e = objEnd(s, i);
      if (e === -1) break;
      try { out.push(loose(s.slice(i, e + 1))); } catch {}
      i = e + 1;
    }
    return out;
  }
  function field(s, key) {
    const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(s);
    if (!m) return "";
    try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
  }

  // Put the model on the ground, centred - models often build it floating or off
  // to one side, which drops it in the wrong spot in Studio.
  function ground(spec) {
    const b = bounds(spec);
    const dx = -(b.lo[0] + b.hi[0]) / 2, dy = -b.lo[1], dz = -(b.lo[2] + b.hi[2]) / 2;
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 0.25) {
      for (const p of spec.parts) p.p = [p.p[0] + dx, p.p[1] + dy, p.p[2] + dz].map((v) => Math.round(v * 1000) / 1000);
    }
    return spec;
  }

  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const vec = (a, d) => (Array.isArray(a) && a.length >= 3 ? [num(a[0], d), num(a[1], d), num(a[2], d)] : [d, d, d]);
  function normalize(raw) {
    const parts = normalizeParts(Array.isArray(raw && raw.parts) ? raw.parts : []);
    if (!parts.length) throw new Error("The model came back empty. Try describing it differently.");
    return { name: String((raw && raw.name) || "Model").slice(0, 50), parts };
  }
  function normalizeParts(list) {
    return list.filter((p) => p && typeof p === "object").slice(0, MAX_PARTS).map((p, i) => {
      const shape = SHAPES.find((x) => x.toLowerCase() === String(p.s || p.shape || "").toLowerCase()) || "Block";
      const size = vec(p.z || p.size, 1).map((v) => Math.min(Math.max(Math.abs(v), 0.05), 512));
      // Studio draws a Ball at its smallest side and a Cylinder's round face at the
      // smaller of Y/Z - match that here so the preview is what Studio builds.
      if (shape === "Ball") size.fill(Math.min(...size));
      if (shape === "Cylinder") size[1] = size[2] = Math.min(size[1], size[2]);
      const color = /^#?[0-9a-f]{6}$/i.test(String(p.c || p.color || "")) ? "#" + String(p.c || p.color).replace("#", "") : "#a3a2a5";
      const material = MATERIALS.find((m) => m.toLowerCase() === String(p.m || p.material || "").toLowerCase()) || "SmoothPlastic";
      return { n: String(p.n || p.name || `Part${i + 1}`).slice(0, 40), s: shape, p: vec(p.p || p.position, 0), z: size, r: vec(p.r || p.rotation, 0), c: color.toUpperCase(), m: material };
    });
  }

  // Part count and overall size (axis-aligned box around every part's corners).
  function stats(spec) {
    const { lo, hi } = bounds(spec);
    return { parts: spec.parts.length, size: hi.map((h, k) => Math.round((h - lo[k]) * 10) / 10) };
  }
  function bounds(spec) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of spec.parts) {
      const [ry, rx, rz] = [p.r[1], p.r[0], p.r[2]].map((d) => (d * Math.PI) / 180);
      for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
        let v = [p.z[0] * sx, p.z[1] * sy, p.z[2] * sz];
        v = rot(v, rz, 2); v = rot(v, rx, 0); v = rot(v, ry, 1); // Y·X·Z applied to the point: Z first
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k] + p.p[k]); hi[k] = Math.max(hi[k], v[k] + p.p[k]); }
      }
    }
    return { lo, hi };
  }
  function rot(v, a, axis) {
    const c = Math.cos(a), s = Math.sin(a), [x, y, z] = v;
    if (axis === 0) return [x, y * c - z * s, y * s + z * c];
    if (axis === 1) return [x * c + z * s, y, -x * s + z * c];
    return [x * c - y * s, x * s + y * c, z];
  }

  const f = (n) => String(Math.round(n * 1000) / 1000);
  // The Luau that builds the model: anchored parts in one Model, dropped in front
  // of the Studio camera, wrapped in an undo waypoint.
  function toLuau(spec, opts) {
    const rows = spec.parts.map((p) =>
      `P(${JSON.stringify(p.n)},"${p.s}",V(${p.z.map(f)}),V(${p.p.map(f)}),V(${p.r.map(f)}),"${p.c}","${p.m}")`);
    return [
      `-- ${spec.name} · ${spec.parts.length} parts · made with VoidScript`,
      `local CH = game:GetService("ChangeHistoryService")`,
      `CH:SetWaypoint("Before ${spec.name.replace(/"/g, "")}")`,
      `local V = Vector3.new`,
      `local model = Instance.new("Model")`,
      `model.Name = ${JSON.stringify(spec.name)}`,
      `local function P(name, shape, size, pos, rot, hex, mat)`,
      `\tlocal p = Instance.new(shape == "Wedge" and "WedgePart" or "Part")`,
      `\tif shape == "Ball" then p.Shape = Enum.PartType.Ball elseif shape == "Cylinder" then p.Shape = Enum.PartType.Cylinder end`,
      `\tp.Name = name`,
      `\tp.Anchored = true`,
      `\tp.Size = size`,
      `\tp.CFrame = CFrame.new(pos) * CFrame.fromOrientation(math.rad(rot.X), math.rad(rot.Y), math.rad(rot.Z))`,
      `\tp.Color = Color3.fromHex(hex)`,
      `\tlocal ok, m = pcall(function() return Enum.Material[mat] end)`,
      `\tp.Material = ok and m or Enum.Material.Plastic -- older Studios lack the newest materials`,
      `\tp.TopSurface = Enum.SurfaceType.Smooth`,
      `\tp.BottomSurface = Enum.SurfaceType.Smooth`,
      `\tp.Parent = model`,
      `end`,
      ...rows,
      `local cam = workspace.CurrentCamera`,
      `local spot = cam and (cam.CFrame.Position + cam.CFrame.LookVector * 40) or Vector3.new(0, 0, 0)`,
      `local _, size = model:GetBoundingBox()`,
      `model:PivotTo(CFrame.new(spot.X, size.Y / 2, spot.Z))`,
      // Welded: one rigid, unanchored assembly (vehicles, tools, props that move).
      ...(opts && opts.welded ? [
        `local main = model:GetChildren()[1]`,
        `for _, p in model:GetChildren() do if p.Size.Magnitude > main.Size.Magnitude then main = p end end`,
        `model.PrimaryPart = main`,
        `for _, p in model:GetChildren() do`,
        `\tif p ~= main then local w = Instance.new("WeldConstraint") w.Part0 = main w.Part1 = p w.Parent = p end`,
        `\tp.Anchored = false`,
        `end`,
      ] : []),
      `model.Parent = workspace`,
      `CH:SetWaypoint("Added ${spec.name.replace(/"/g, "")}")`,
      `return "Built ${spec.name.replace(/"/g, "")} (" .. #model:GetChildren() .. " parts)"`,
    ].join("\n");
  }

  // ── .rbxmx export: a Roblox model file you drag straight into Studio ────────
  // Enum.Material values. The newest materials have no fixed number we can rely
  // on in a file, so they export as their closest classic look (the Insert and
  // script routes still use the real one).
  const MAT_ID = { Plastic: 256, SmoothPlastic: 272, Neon: 288, Wood: 512, WoodPlanks: 528, Marble: 784, Basalt: 788, Slate: 800,
    CrackedLava: 804, Concrete: 816, Limestone: 820, Granite: 832, Pavement: 836, Brick: 848, Pebble: 864, Cobblestone: 880, Rock: 896,
    Sandstone: 912, CorrodedMetal: 1040, DiamondPlate: 1056, Foil: 1072, Metal: 1088, Grass: 1280, LeafyGrass: 1284, Sand: 1296,
    Fabric: 1312, Snow: 1328, Mud: 1344, Ground: 1360, Asphalt: 1376, Salt: 1392, Ice: 1536, Glacier: 1552, Glass: 1568, ForceField: 1584 };
  const MAT_NEAR = { Cardboard: "Fabric", Carpet: "Fabric", Leather: "Fabric", CeramicTiles: "Marble", ClayRoofTiles: "Brick",
    RoofShingles: "Slate", Plaster: "Concrete", Rubber: "SmoothPlastic" };
  const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // CFrame.fromOrientation(rx, ry, rz) = Ry * Rx * Rz.
  function orientation(r) {
    const [x, y, z] = r.map((d) => (d * Math.PI) / 180);
    const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
    return [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
      cx * sz, cx * cz, -sx,
      -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx];
  }
  function toRbxmx(spec, opts) {
    const welded = opts && opts.welded;
    let ref = 1;
    const v3 = (tag, v) => `<Vector3 name="${tag}"><X>${f(v[0])}</X><Y>${f(v[1])}</Y><Z>${f(v[2])}</Z></Vector3>`;
    const parts = spec.parts.map((p) => {
      const m = orientation(p.r), mat = MAT_ID[p.m] || MAT_ID[MAT_NEAR[p.m]] || 256;
      const R = ["R00", "R01", "R02", "R10", "R11", "R12", "R20", "R21", "R22"].map((k, i) => `<${k}>${f(m[i])}</${k}>`).join("");
      return `<Item class="${p.s === "Wedge" ? "WedgePart" : "Part"}" referent="RBX${ref++}"><Properties>` +
        `<string name="Name">${xml(p.n)}</string><bool name="Anchored">${welded ? "false" : "true"}</bool>` +
        `<CoordinateFrame name="CFrame"><X>${f(p.p[0])}</X><Y>${f(p.p[1])}</Y><Z>${f(p.p[2])}</Z>${R}</CoordinateFrame>` +
        `${v3("size", p.z)}<Color3uint8 name="Color3uint8">${(0xff000000 | parseInt(p.c.slice(1), 16)) >>> 0}</Color3uint8>` +
        `<token name="Material">${mat}</token>` +
        (p.s === "Wedge" ? "" : `<token name="shape">${{ Ball: 0, Block: 1, Cylinder: 2 }[p.s]}</token>`) +
        `<token name="TopSurface">0</token><token name="BottomSurface">0</token>` +
        (p.m === "Glass" ? `<float name="Transparency">0.4</float>` : "") +
        `</Properties></Item>`;
    });
    return `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
      `xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">\n` +
      `<Item class="Model" referent="RBX0"><Properties><string name="Name">${xml(spec.name)}</string></Properties>\n` +
      parts.join("\n") + `\n</Item>\n</roblox>\n`;
  }

  // ── instant edits (no AI) ───────────────────────────────────────────────────
  const lum = (h) => { const v = parseInt(h.slice(1), 16); return 0.299 * (v >> 16 & 255) + 0.587 * (v >> 8 & 255) + 0.114 * (v & 255); };
  // Swap the model's colours for a palette, darkest to darkest, so shading survives.
  // Neon and Glass keep their colour (lights and windows).
  function recolor(spec, palette) {
    const own = [...new Set(spec.parts.filter((p) => p.m !== "Neon" && p.m !== "Glass").map((p) => p.c))].sort((a, b) => lum(a) - lum(b));
    const pal = palette.slice().sort((a, b) => lum(a) - lum(b));
    const map = new Map(own.map((c, i) => [c, pal[Math.min(pal.length - 1, Math.floor((i / Math.max(own.length, 1)) * pal.length))]]));
    return { name: spec.name, parts: spec.parts.map((p) => Object.assign({}, p, { c: map.get(p.c) || p.c })) };
  }
  function scale(spec, k) {
    const s = (v) => Math.round(v * k * 1000) / 1000;
    return { name: spec.name, parts: spec.parts.map((p) => Object.assign({}, p, { p: p.p.map(s), z: p.z.map(s) })) };
  }

  return { SHAPES, MATERIALS, DETAIL, PASSES, STYLES, IMAGE_LINE, recolor, scale, toRbxmx, buildPrompt, detailPrompt, fixPrompt, revisePrompt, parse, parseDelta, applyDelta, ground, audit,
    normalize, stats, toLuau,
    json: { objEnd, loose, salvage, field } };
})();
if (typeof window !== "undefined") window.VSModel = VSModel;
