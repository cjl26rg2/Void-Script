// SPDX-License-Identifier: GPL-3.0-or-later
// modelkit.js - the model generator's shared core (desktop app + extension).
// The AI describes a model as a list of parts (JSON); this turns that into a
// preview-friendly spec and into the Luau that builds it in Studio.
"use strict";

const VSModel = (() => {
  const SHAPES = ["Block", "Ball", "Cylinder", "Wedge"];
  const MATERIALS = ["SmoothPlastic", "Plastic", "Neon", "Metal", "Wood", "WoodPlanks", "Glass", "Brick",
    "Concrete", "Granite", "Marble", "Slate", "Sand", "Grass", "Fabric", "Foil", "Ice", "DiamondPlate", "Cobblestone"];
  const DETAIL = { low: [25, 50], medium: [60, 120], high: [130, 220] };
  const MAX_PARTS = 400;

  // The app builds big models in passes (a reply can only be so long): the shape
  // first, then detail passes that add to it. [lo, hi] parts per pass.
  const PASSES = { low: [[25, 45]], medium: [[55, 85], [25, 40]], high: [[70, 95], [45, 65], [35, 55]] };

  const FIELDS = `- n: part name. s: shape, one of ${SHAPES.join(", ")}. p: center position [x,y,z] in studs. z: size [x,y,z] in studs.
- r: rotation [x,y,z] in degrees (applied Y, then X, then Z - like CFrame.fromOrientation). c: hex color. m: material, one of ${MATERIALS.join(", ")}.
- Y is up, -Z is the front. The model stands on y = 0 and is centered on x = 0, z = 0. Real-world scale: a character is about 5 studs tall, a door 7, a car about 7 wide and 16 long.
- A Cylinder's length runs along its X size (like Roblox); a car facing -Z has wheel axles along X, so its wheels need no rotation. A Wedge is tall at the back (+Z) and slopes down to the front (-Z). Give a Ball equal x, y and z.`;
  const CRAFT = `- Build it like a skilled Roblox builder, not a sketch:
  1. Get the silhouette and proportions right first (compare against the real thing).
  2. Layer it: a main body, then panels, trim, bevels and edges on top - never one plain box per section.
  3. Spend most of the parts on details that sell it: windows with frames, doors and seams, lights, grilles, vents, wheels with tyres AND hubs, eyes, feathers, fingers, claws, railings.
  4. Use Wedges for noses, roofs, slopes and tapers; Cylinders for wheels, pipes, limbs and poles; Balls for joints, eyes and rounded ends. Angle parts with rotations for curves and fans.
  5. Mirror left/right parts exactly where the real thing is symmetrical (same size, x flipped).
  6. Use a deliberate palette of 3-6 colors with darker accents for depth, and fitting materials (Glass for windows, Metal for machinery, Neon for lights).
  7. Trim and panels are thin (0.2-0.4 studs) and sit 0.05 studs proud of the surface under them, so faces never fight. Never place two faces exactly on the same plane.
  8. Round things off: a wedge or a thin chamfer strip on hard box edges, cylinders at the ends of tubes, slightly smaller insets for depth.
- Overlap parts slightly so there are no gaps. No floating parts.`;
  const RULES = `Answer with ONLY one JSON object, no other text, no code fences:
{"name":"Short Name","plan":"one line: real size and key proportions in studs","parts":[{"n":"Body","s":"Block","p":[0,4,0],"z":[4,3,6],"r":[0,0,0],"c":"#C0392B","m":"SmoothPlastic"}]}
- plan: write it BEFORE the parts - overall width x height x length in studs and the proportions that make it recognisable.
${FIELDS}
- List parts from biggest to smallest: main body first, then large sections, then details. (The preview builds in that order.)
${CRAFT}`;
  const DELTA = `Answer with ONLY one JSON object, no other text, no code fences:
{"remove":[3,17],"add":[{"n":"Spoiler","s":"Wedge","p":[0,4.2,7.5],"z":[6,0.6,1.5],"r":[0,0,0],"c":"#1B1B1B","m":"Metal"}]}
- remove: the "i" numbers of parts to delete (to change a part, remove it and add the new version). add: new parts.
${FIELDS}
${CRAFT}`;

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
  // extra: { lessons, example, budget:[lo,hi], firstPass } - all optional.
  function buildPrompt(description, detail, extra) {
    const e = extra || {};
    const [lo, hi] = e.budget || DETAIL[detail] || DETAIL.medium;
    return `Design a Roblox model built from parts: ${String(description).trim()}
Use between ${lo} and ${hi} parts.` +
      (e.firstPass ? " This is the first pass: build the complete shape, every main section and the key features. Detail passes come after." : " Use the full part budget.") +
      learned(e) + `

${RULES}`;
  }
  // A detail pass: add parts to a model, and fix any part that looks wrong.
  function detailPrompt(spec, description, budget, extra) {
    const [lo, hi] = budget;
    return `Here is a Roblox model of ${String(description).trim()}, made of parts (each has an index "i"):
${JSON.stringify(numbered(spec))}

` +
      `Do a detail pass like a top Roblox builder: add ${lo} to ${hi} NEW parts that make it look hand-built - trim, panel lines, frames, bolts, lights, ` +
      "bevels, smaller secondary shapes and anything the real thing has that this is missing. Do not repeat parts that exist. " +
      "Also remove and re-add any part that is floating, badly placed or the wrong size." + learned(extra) + `

${DELTA}`;
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
  function toLuau(spec) {
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
      `\tp.Material = Enum.Material[mat]`,
      `\tp.TopSurface = Enum.SurfaceType.Smooth`,
      `\tp.BottomSurface = Enum.SurfaceType.Smooth`,
      `\tp.Parent = model`,
      `end`,
      ...rows,
      `local cam = workspace.CurrentCamera`,
      `local spot = cam and (cam.CFrame.Position + cam.CFrame.LookVector * 40) or Vector3.new(0, 0, 0)`,
      `local _, size = model:GetBoundingBox()`,
      `model:PivotTo(CFrame.new(spot.X, size.Y / 2, spot.Z))`,
      `model.Parent = workspace`,
      `CH:SetWaypoint("Added ${spec.name.replace(/"/g, "")}")`,
      `return "Built ${spec.name.replace(/"/g, "")} (" .. #model:GetChildren() .. " parts)"`,
    ].join("\n");
  }

  return { SHAPES, MATERIALS, DETAIL, PASSES, buildPrompt, detailPrompt, revisePrompt, parse, parseDelta, applyDelta, ground,
    normalize, stats, toLuau,
    json: { objEnd, loose, salvage, field } };
})();
if (typeof window !== "undefined") window.VSModel = VSModel;
