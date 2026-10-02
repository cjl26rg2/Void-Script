// SPDX-License-Identifier: GPL-3.0-or-later
// modelview.js - 3D preview for the model generator (needs three.js loaded first).
// Draws a VSModel spec the way Studio will: same shapes, sizes, rotations, colors.
"use strict";

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
    const matFor = (hex, m) => {
      const key = hex + m;
      if (!mats.has(key)) {
        const neon = m === "Neon", glass = m === "Glass";
        mats.set(key, new THREE.MeshStandardMaterial({
          color: new THREE.Color(hex), roughness: m === "Metal" || m === "Foil" || m === "DiamondPlate" ? 0.35 : 0.8,
          metalness: m === "Metal" || m === "Foil" || m === "DiamondPlate" ? 0.55 : 0.05,
          emissive: neon ? new THREE.Color(hex) : 0x000000, emissiveIntensity: neon ? 0.8 : 0,
          transparent: glass, opacity: glass ? 0.45 : 1,
        }));
      }
      return mats.get(key);
    };

    // Orbit: drag to turn, wheel to zoom. Spins slowly until the user touches it.
    const view = { yaw: 0.7, pitch: 0.38, dist: 30, target: new THREE.Vector3(), spin: true, home: null };
    function place() {
      const c = Math.cos(view.pitch);
      camera.position.set(view.target.x + view.dist * c * Math.sin(view.yaw), view.target.y + view.dist * Math.sin(view.pitch),
        view.target.z + view.dist * c * Math.cos(view.yaw));
      camera.lookAt(view.target);
    }
    let drag = null;
    const el = renderer.domElement;
    el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; view.spin = false; el.setPointerCapture(e.pointerId); el.style.cursor = "grabbing"; });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      view.yaw -= (e.clientX - drag.x) * 0.008;
      view.pitch = Math.min(1.45, Math.max(-0.2, view.pitch + (e.clientY - drag.y) * 0.006));
      drag = { x: e.clientX, y: e.clientY };
    });
    const up = () => { drag = null; el.style.cursor = "grab"; };
    el.addEventListener("pointerup", up);
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

    function show(spec) {
      if (group) scene.remove(group);
      if (grid) scene.remove(grid);
      group = new THREE.Group();
      for (const p of spec.parts) {
        const mesh = new THREE.Mesh(geo[p.s] || geo.Block, matFor(p.c, p.m));
        mesh.scale.set(p.z[0], p.z[1], p.z[2]);
        mesh.position.set(p.p[0], p.p[1], p.p[2]);
        mesh.rotation.set(THREE.MathUtils.degToRad(p.r[0]), THREE.MathUtils.degToRad(p.r[1]), THREE.MathUtils.degToRad(p.r[2]), "YXZ");
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
      // Far enough that the whole model fits, whatever direction we look from.
      view.home = { target: center.clone(), dist: Math.max(size.length() * 1.25, 6) };
      reset();
      view.spin = true;
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
    return { show, reset, dispose, canvas: el };
  }

  return { create };
})();
if (typeof window !== "undefined") window.VSModelView = VSModelView;
