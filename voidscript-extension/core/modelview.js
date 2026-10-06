// SPDX-License-Identifier: GPL-3.0-or-later
// modelview.js - 3D preview for the model generator (needs three.js loaded first).
// Draws a VSModel spec the way Studio will: same shapes, sizes, rotations, colors.
"use strict";

// Procedural stand-ins for Studio's material textures, drawn once in grey and
// tinted by each part's colour (Studio tints its textures the same way).
const VSTextures = (() => {
  const S = 256, cache = new Map();
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const g = (v) => { const c = Math.max(0, Math.min(255, Math.round(v * 255))); return `rgb(${c},${c},${c})`; };
  function canvas(base) {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const x = c.getContext("2d");
    x.fillStyle = g(base);
    x.fillRect(0, 0, S, S);
    return [c, x];
  }
  function noise(x, n, size, lo, hi) {
    for (let i = 0; i < n; i++) { x.fillStyle = g(lo + rnd() * (hi - lo)); x.fillRect(rnd() * S, rnd() * S, size, size); }
  }
  function grid(x, cols, rows, line, shade, stagger) {
    const w = S / cols, h = S / rows;
    for (let r = 0; r < rows; r++) {
      const off = stagger && r % 2 ? w / 2 : 0;
      for (let c = -1; c < cols; c++) {
        x.fillStyle = g(shade + (rnd() - 0.5) * 0.12);
        x.fillRect(c * w + off + line / 2, r * h + line / 2, w - line, h - line);
      }
    }
  }
  function stones(x, n, rMin, rMax, shade) {
    for (let i = 0; i < n; i++) {
      x.fillStyle = g(shade + (rnd() - 0.5) * 0.2);
      x.beginPath();
      x.ellipse(rnd() * S, rnd() * S, rMin + rnd() * (rMax - rMin), rMin + rnd() * (rMax - rMin), rnd() * 3, 0, Math.PI * 2);
      x.fill();
    }
  }
  function streaks(x, n, horizontal, lo, hi, width) {
    for (let i = 0; i < n; i++) {
      x.strokeStyle = g(lo + rnd() * (hi - lo));
      x.lineWidth = width;
      x.beginPath();
      const p = rnd() * S;
      if (horizontal) { x.moveTo(0, p); x.bezierCurveTo(S / 3, p + (rnd() - 0.5) * 12, S * 2 / 3, p + (rnd() - 0.5) * 12, S, p); }
      else { x.moveTo(p, 0); x.lineTo(p + (rnd() - 0.5) * 30, S); }
      x.stroke();
    }
  }
  function cracks(x, n, shade, width) {
    x.strokeStyle = g(shade);
    x.lineWidth = width;
    for (let i = 0; i < n; i++) {
      let px = rnd() * S, py = rnd() * S;
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 6; k++) { px += (rnd() - 0.5) * 60; py += (rnd() - 0.5) * 60; x.lineTo(px, py); }
      x.stroke();
    }
  }
  // [draw, size of one texture tile in studs]
  const DRAW = {
    Brick: [(x) => { x.fillStyle = g(0.62); x.fillRect(0, 0, S, S); grid(x, 4, 8, 6, 0.93, true); noise(x, 900, 2, 0.75, 1); }, 6],
    Cobblestone: [(x) => { x.fillStyle = g(0.5); x.fillRect(0, 0, S, S); stones(x, 70, 14, 24, 0.9); noise(x, 600, 2, 0.6, 0.95); }, 6],
    Concrete: [(x) => noise(x, 4000, 2, 0.8, 1), 8],
    Pavement: [(x) => { x.fillStyle = g(0.7); x.fillRect(0, 0, S, S); grid(x, 2, 2, 4, 0.93, false); noise(x, 2500, 2, 0.8, 1); }, 8],
    Asphalt: [(x) => noise(x, 6000, 2, 0.65, 1), 6],
    Plaster: [(x) => noise(x, 2500, 3, 0.88, 1), 8],
    CeramicTiles: [(x) => { x.fillStyle = g(0.72); x.fillRect(0, 0, S, S); grid(x, 4, 4, 5, 0.97, false); }, 4],
    ClayRoofTiles: [(x) => {
      x.fillStyle = g(0.62); x.fillRect(0, 0, S, S);
      for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
        x.fillStyle = g(0.95 - (rnd() * 0.12));
        x.beginPath(); x.arc(c * 64 + (r % 2 ? 32 : 0) + 32, r * 32 + 32, 30, Math.PI, 0); x.fill();
      }
    }, 5],
    RoofShingles: [(x) => { x.fillStyle = g(0.55); x.fillRect(0, 0, S, S); grid(x, 5, 8, 4, 0.9, true); noise(x, 1500, 2, 0.7, 1); }, 5],
    Wood: [(x) => streaks(x, 70, true, 0.72, 1, 2), 4],
    WoodPlanks: [(x) => {
      streaks(x, 60, true, 0.75, 1, 2);
      for (let r = 0; r < 6; r++) { x.fillStyle = g(0.45); x.fillRect(0, r * (S / 6), S, 3); x.fillRect(((r * 97) % 4) * 64 + 20, r * (S / 6), 3, S / 6); }
    }, 6],
    Cardboard: [(x) => streaks(x, 40, false, 0.82, 1, 3), 3],
    Metal: [(x) => streaks(x, 120, true, 0.88, 1, 1), 4],
    CorrodedMetal: [(x) => { streaks(x, 80, true, 0.85, 1, 1); stones(x, 40, 6, 18, 0.65); }, 6],
    DiamondPlate: [(x) => {
      x.fillStyle = g(0.8); x.fillRect(0, 0, S, S);
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        x.save(); x.translate(c * 32 + (r % 2 ? 16 : 0), r * 32 + 16); x.rotate(r % 2 ? 0.8 : -0.8);
        x.fillStyle = g(1); x.fillRect(-10, -3, 20, 6); x.restore();
      }
    }, 3],
    Granite: [(x) => noise(x, 5000, 3, 0.55, 1), 6],
    Marble: [(x) => { noise(x, 1500, 4, 0.9, 1); cracks(x, 6, 0.7, 1.5); }, 8],
    Slate: [(x) => { streaks(x, 40, true, 0.6, 0.95, 5); noise(x, 1500, 2, 0.7, 1); }, 6],
    Basalt: [(x) => { x.fillStyle = g(0.55); x.fillRect(0, 0, S, S); grid(x, 3, 3, 3, 0.85, true); noise(x, 2000, 2, 0.6, 0.95); }, 8],
    Limestone: [(x) => { noise(x, 3000, 3, 0.82, 1); stones(x, 20, 4, 9, 0.75); }, 8],
    Sandstone: [(x) => { streaks(x, 30, true, 0.82, 1, 6); noise(x, 2500, 2, 0.8, 1); }, 8],
    Rock: [(x) => { noise(x, 3500, 4, 0.6, 1); cracks(x, 8, 0.5, 2); }, 8],
    Pebble: [(x) => { x.fillStyle = g(0.6); x.fillRect(0, 0, S, S); stones(x, 220, 5, 10, 0.92); }, 4],
    CrackedLava: [(x) => { noise(x, 2000, 3, 0.75, 1); cracks(x, 14, 0.35, 3); }, 8],
    Grass: [(x) => { noise(x, 5000, 2, 0.75, 1); streaks(x, 120, false, 0.8, 1, 1); }, 6],
    LeafyGrass: [(x) => { noise(x, 3000, 3, 0.7, 1); stones(x, 60, 3, 7, 0.85); }, 6],
    Ground: [(x) => noise(x, 4500, 3, 0.7, 1), 6],
    Mud: [(x) => { noise(x, 3000, 4, 0.7, 1); stones(x, 30, 8, 16, 0.82); }, 8],
    Sand: [(x) => noise(x, 7000, 1, 0.82, 1), 4],
    Snow: [(x) => noise(x, 3000, 2, 0.9, 1), 6],
    Ice: [(x) => { noise(x, 800, 3, 0.9, 1); cracks(x, 5, 0.8, 1); }, 8],
    Glacier: [(x) => { noise(x, 1200, 4, 0.85, 1); cracks(x, 8, 0.75, 1.5); }, 8],
    Salt: [(x) => noise(x, 5000, 2, 0.85, 1), 4],
    Fabric: [(x) => { for (let i = 0; i < S; i += 4) { x.fillStyle = g(0.85); x.fillRect(i, 0, 2, S); x.fillRect(0, i, S, 1); } }, 2],
    Carpet: [(x) => noise(x, 8000, 2, 0.78, 1), 3],
    Leather: [(x) => { noise(x, 2000, 3, 0.8, 1); cracks(x, 10, 0.75, 1); }, 4],
  };
  function get(m) {
    if (!DRAW[m]) return null;
    if (!cache.has(m)) {
      seed = 7 + m.length * 131;
      const [c, x] = canvas(0.94);
      DRAW[m][0](x);
      const map = new THREE.CanvasTexture(c);
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.anisotropy = 4;
      cache.set(m, { map, studs: DRAW[m][1] });
    }
    return cache.get(m);
  }
  return { get };
})();

const VSModelView = (() => {
  // Wedge: a box whose top slopes from the back (+Z, full height) to the front (-Z).
  function wedgeGeometry() {
    const v = [
      -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, // bottom
      -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, // top back edge
    ];
    const idx = [ // counter-clockwise seen from outside
      0, 1, 2, 0, 2, 3,       // bottom
      3, 2, 5, 3, 5, 4,       // back
      0, 5, 1, 0, 4, 5,       // slope
      0, 3, 4,                // left
      1, 5, 2,                // right
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx);
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    return flat;
  }

  function create(host) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:grab";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(30, 60, 40);
    scene.add(sun);
    let grid = null, group = null;

    const geo = { Block: new THREE.BoxGeometry(1, 1, 1), Ball: new THREE.SphereGeometry(0.5, 24, 16),
      Cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 24).rotateZ(Math.PI / 2), Wedge: wedgeGeometry() };
    const mats = new Map();
    const METALLIC = new Set(["Metal", "Foil", "DiamondPlate", "CorrodedMetal"]);
    const matFor = (hex, m) => {
      const key = hex + m;
      if (!mats.has(key)) {
        const neon = m === "Neon", glass = m === "Glass" || m === "ForceField";
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(hex), roughness: METALLIC.has(m) ? 0.35 : m === "Ice" || m === "Marble" ? 0.3 : 0.8,
          metalness: METALLIC.has(m) ? 0.55 : 0.05,
          emissive: neon ? new THREE.Color(hex) : 0x000000, emissiveIntensity: neon ? 0.8 : 0,
          transparent: glass, opacity: glass ? 0.45 : 1,
        });
        const tex = VSTextures.get(m);
        if (tex) texturize(mat, tex.map, tex.studs, m);
        mats.set(key, mat);
      }
      return mats.get(key);
    };
    // Studio paints a material's texture at a fixed size in studs, whatever the
    // part's size - so map it from world position (per face direction), not UVs.
    function texturize(mat, map, studs, m) {
      mat.customProgramCacheKey = () => "vs-tex-" + m;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.vsTex = { value: map };
        sh.uniforms.vsScale = { value: 1 / studs };
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vsPos;\nvarying vec3 vsNrm;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvsPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvsNrm = normalize(mat3(modelMatrix) * objectNormal);");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform sampler2D vsTex;\nuniform float vsScale;\nvarying vec3 vsPos;\nvarying vec3 vsNrm;")
          .replace("#include <map_fragment>", [
            "#include <map_fragment>",
            "vec3 vsA = abs(vsNrm);",
            "vec2 vsUv = vsA.x > vsA.y && vsA.x > vsA.z ? vsPos.zy : (vsA.y > vsA.z ? vsPos.xz : vsPos.xy);",
            "diffuseColor.rgb *= texture2D(vsTex, vsUv * vsScale).rgb;",
          ].join("\n"));
      };
    }

    // Orbit: drag to turn, wheel to zoom. Spins slowly until the user touches it.
    const view = { yaw: 0.7, pitch: 0.38, dist: 30, target: new THREE.Vector3(), spin: true, home: null };
    function place() {
      const c = Math.cos(view.pitch);
      camera.position.set(view.target.x + view.dist * c * Math.sin(view.yaw), view.target.y + view.dist * Math.sin(view.pitch),
        view.target.z + view.dist * c * Math.cos(view.yaw));
      camera.lookAt(view.target);
    }
    let drag = null, moved = 0, onPick = null, sel = null;
    const el = renderer.domElement;
    el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; moved = 0; view.spin = false; el.setPointerCapture(e.pointerId); el.style.cursor = "grabbing"; });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
      view.yaw -= (e.clientX - drag.x) * 0.008;
      view.pitch = Math.min(1.45, Math.max(-0.2, view.pitch + (e.clientY - drag.y) * 0.006));
      drag = { x: e.clientX, y: e.clientY };
    });
    const up = () => { drag = null; el.style.cursor = "grab"; };
    // A click (not a drag) picks the part under the pointer.
    const ray = new THREE.Raycaster();
    el.addEventListener("pointerup", (e) => {
      const click = drag && moved < 5;
      up();
      if (!click || !onPick || !group) return;
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(group.children, false)[0];
      onPick(hit ? hit.object.userData.i : -1);
    });
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", (e) => { e.preventDefault(); view.spin = false; view.dist = Math.min(4000, Math.max(2, view.dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });

    function resize() {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0, alive = true;
    (function frame() {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (view.spin) view.yaw += 0.004;
      place();
      renderer.render(scene, camera);
    })();

    // keep: a live update while the model streams in - widen the framing as it
    // grows but don't snap the camera back on every new part.
    // keep === "edit": the same model changed in place - leave the camera alone.
    function show(spec, keep) {
      if (group) scene.remove(group);
      select(-1);
      if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); } // live updates replace it often
      group = new THREE.Group();
      for (const p of spec.parts) {
        const mesh = new THREE.Mesh(geo[p.s] || geo.Block, matFor(p.c, p.m));
        mesh.scale.set(p.z[0], p.z[1], p.z[2]);
        mesh.position.set(p.p[0], p.p[1], p.p[2]);
        mesh.rotation.set(THREE.MathUtils.degToRad(p.r[0]), THREE.MathUtils.degToRad(p.r[1]), THREE.MathUtils.degToRad(p.r[2]), "YXZ");
        mesh.userData.i = group.children.length;
        group.add(mesh);
      }
      scene.add(group);
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const span = Math.max(size.x, size.y, size.z, 1);
      const cells = 24, step = Math.max(1, Math.ceil(span * 2.2 / cells));
      grid = new THREE.GridHelper(step * cells, cells, 0x7c8494, 0x4a5160);
      grid.material.transparent = true;
      grid.material.opacity = 0.45;
      grid.position.set(center.x, box.min.y, center.z);
      scene.add(grid);
      if (keep === "edit" && view.home) return;
      // Far enough that the whole model fits, whatever direction we look from.
      const had = keep && view.home;
      view.home = { target: center.clone(), dist: Math.max(size.length() * 1.25, 6) };
      if (had) { view.target.copy(view.home.target); view.dist = Math.max(view.dist, view.home.dist); }
      else reset();
      view.spin = true;
    }
    // Outline the selected part (-1 clears it).
    function select(i) {
      if (sel) { scene.remove(sel); sel.geometry.dispose(); sel.material.dispose(); sel = null; }
      const m = group && group.children[i];
      if (!m) return;
      sel = new THREE.BoxHelper(m, 0xffffff);
      sel.material.depthTest = false;
      sel.renderOrder = 10;
      scene.add(sel);
    }
    function reset() {
      if (!view.home) return;
      view.target.copy(view.home.target);
      view.dist = view.home.dist;
      view.yaw = 0.7;
      view.pitch = 0.38;
    }
    function dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      el.remove();
    }
    return { show, reset, dispose, select, canvas: el, set onPick(f) { onPick = f; },
      get spin() { return view.spin; }, set spin(v) { view.spin = !!v; },
      snapshot: () => { renderer.render(scene, camera); return el.toDataURL("image/png"); } };
  }

  return { create };
})();
if (typeof window !== "undefined") window.VSModelView = VSModelView;
