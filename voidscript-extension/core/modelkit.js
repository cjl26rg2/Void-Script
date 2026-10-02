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

  const RULES = `Answer with ONLY one JSON object, no other text, no code fences:
{"name":"Short Name","parts":[{"n":"Body","s":"Block","p":[0,4,0],"z":[4,3,6],"r":[0,0,0],"c":"#C0392B","m":"SmoothPlastic"}]}
- n: part name. s: shape, one of ${SHAPES.join(", ")}. p: center position [x,y,z] in studs. z: size [x,y,z] in studs.
- r: rotation [x,y,z] in degrees (applied Y, then X, then Z - like CFrame.fromOrientation). c: hex color. m: material, one of ${MATERIALS.join(", ")}.
- Y is up, -Z is the front. The model stands on y = 0 and is centered on x = 0, z = 0. Real-world scale: a character is about 5 studs tall.
- A Cylinder's length runs along its X size (like Roblox). A Wedge is tall at the back (+Z) and slopes down to the front (-Z).
- Build it like a skilled Roblox builder, not a sketch:
  1. Get the silhouette and proportions right first (compare against the real thing).
  2. Layer it: a main body, then panels, trim, bevels and edges on top - never one plain box per section.
  3. Spend most of the parts on details that sell it: windows with frames, doors and seams, lights, grilles, vents, wheels with tyres AND hubs, eyes, feathers, fingers, claws, railings.
  4. Use Wedges for noses, roofs, slopes and tapers; Cylinders for wheels, pipes, limbs and poles; Balls for joints, eyes and rounded ends. Angle parts with rotations for curves and fans.
  5. Mirror left/right parts exactly where the real thing is symmetrical.
  6. Use a deliberate palette of 3-6 colors with darker accents for depth, and fitting materials (Glass for windows, Metal for machinery, Neon for lights).
- Overlap parts slightly so there are no gaps. No floating parts. Use the full part budget.`;

  function buildPrompt(description, detail) {
    const [lo, hi] = DETAIL[detail] || DETAIL.medium;
    return `Design a Roblox model built from parts: ${String(description).trim()}\nUse between ${lo} and ${hi} parts.\n\n${RULES}`;
  }
  function revisePrompt(spec, change) {
    return `Here is a Roblox model made of parts:\n${JSON.stringify(compact(spec))}\n\nChange it: ${String(change).trim()}\n` +
      `Keep everything else the same unless the change needs it. Return the WHOLE updated model.\n\n${RULES}`;
  }

  // Pull the first JSON object out of a reply (tolerates prose, fences and
  // trailing text) and check it is a usable model.
  function parse(text) {
    const s = String(text || "");
    const start = s.indexOf("{");
    if (start === -1) throw new Error("The AI didn't send a model. Try again.");
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) { end = i; break; }
    }
    if (end === -1) throw new Error("The model was cut off before it finished. Try again, or use a lower detail level.");
    let raw;
    try { raw = JSON.parse(s.slice(start, end + 1)); }
    catch { throw new Error("The AI's model wasn't valid JSON. Try again."); }
    return normalize(raw);
  }

  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const vec = (a, d) => (Array.isArray(a) && a.length >= 3 ? [num(a[0], d), num(a[1], d), num(a[2], d)] : [d, d, d]);
  function normalize(raw) {
    const list = Array.isArray(raw && raw.parts) ? raw.parts : [];
    const parts = list.slice(0, MAX_PARTS).map((p, i) => {
      const shape = SHAPES.find((x) => x.toLowerCase() === String(p.s || p.shape || "").toLowerCase()) || "Block";
      const size = vec(p.z || p.size, 1).map((v) => Math.min(Math.max(Math.abs(v), 0.05), 512));
      const color = /^#?[0-9a-f]{6}$/i.test(String(p.c || p.color || "")) ? "#" + String(p.c || p.color).replace("#", "") : "#a3a2a5";
      const material = MATERIALS.find((m) => m.toLowerCase() === String(p.m || p.material || "").toLowerCase()) || "SmoothPlastic";
      return { n: String(p.n || p.name || `Part${i + 1}`).slice(0, 40), s: shape, p: vec(p.p || p.position, 0), z: size, r: vec(p.r || p.rotation, 0), c: color.toUpperCase(), m: material };
    });
    if (!parts.length) throw new Error("The model came back empty. Try describing it differently.");
    return { name: String((raw && raw.name) || "Model").slice(0, 50), parts };
  }
  const compact = (spec) => ({ name: spec.name, parts: spec.parts });

  // Part count and overall size (axis-aligned box around every part's corners).
  function stats(spec) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of spec.parts) {
      const [ry, rx, rz] = [p.r[1], p.r[0], p.r[2]].map((d) => (d * Math.PI) / 180);
      for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
        let v = [p.z[0] * sx, p.z[1] * sy, p.z[2] * sz];
        v = rot(v, rz, 2); v = rot(v, rx, 0); v = rot(v, ry, 1); // Y·X·Z applied to the point: Z first
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k] + p.p[k]); hi[k] = Math.max(hi[k], v[k] + p.p[k]); }
      }
    }
    return { parts: spec.parts.length, size: hi.map((h, k) => Math.round((h - lo[k]) * 10) / 10) };
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

  return { SHAPES, MATERIALS, DETAIL, buildPrompt, revisePrompt, parse, normalize, stats, toLuau };
})();
if (typeof window !== "undefined") window.VSModel = VSModel;
