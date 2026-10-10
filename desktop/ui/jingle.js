// SPDX-License-Identifier: GPL-3.0-or-later
// jingle.js - JingleScript, VoidScript's Christmas look (all of December).
// Evergreen and cranberry colours, a string of lights along the top bar and
// gentle snow. The look, the snow and the lights each have their own switch in
// Settings, and snow and twinkling stay still for "reduce motion".
"use strict";

const jingle = { on: false, raf: 0, flakes: [], canvas: null };
const jingleInSeason = (d = new Date()) => d.getMonth() === 11;
const jingleOpt = (k) => lsGet("vs-jingle-" + k) !== "off";
const stillMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";

function applyJingle() {
  const on = !spooky.on && jingleOpt("theme") && (jingleInSeason() || lsGet("vs-jingle-force") === "1");
  const was = jingle.on;
  jingle.on = on;
  document.documentElement.classList.toggle("jingle", on);
  if (on) {
    document.title = "JingleScript²";
    document.querySelector(".tb-name").innerHTML = 'Jingle<span class="grad">Script</span><sup class="sq">2</sup>';
  } else if (was && !spooky.on) {
    document.title = "VoidScript²";
    document.querySelector(".tb-name").innerHTML = 'Void<span class="grad">Script</span><sup class="sq">2</sup>';
  }
  // the bauble logo everywhere the app shows its logo, and on the taskbar
  if (on || was) {
    const logo = on ? (spooky.dev ? "assets/logo-jingle-dev.png" : "assets/logo-jingle.png") : "assets/logo.png";
    document.querySelectorAll('img[src*="assets/logo"]').forEach((i) => { if (!spooky.on) i.src = logo; });
    if (!spooky.on) invoke("set_spooky_icon", { on, jingle: on }).catch(() => {});
    // Leaving the preview in October: put the pumpkin back on the window too.
    else if (was && !on) invoke("set_spooky_icon", { on: true }).catch(() => {});
  }
  const wantLights = on && jingleOpt("lights");
  let lights = document.querySelector(".jingle-bulbs");
  if (wantLights && !lights) {
    lights = document.createElement("div");
    lights.className = "jingle-bulbs";
    lights.setAttribute("aria-hidden", "true");
    $("titlebar").prepend(lights);
    jingleString();
    setTimeout(jingleString, 800); // again once the top bar's text and fonts have settled
    addEventListener("resize", jingleString);
  }
  if (!wantLights && lights) { lights.remove(); removeEventListener("resize", jingleString); }
  jingleSnow(on && jingleOpt("snow") && !stillMotion());
  // Jingle Bells (Kevin MacLeod, CC BY 4.0) - the same top-bar button mutes it.
  if (on) {
    const music = jingleOpt("music");
    $("btn-music").hidden = false;
    $("btn-music").classList.toggle("off", !music);
    $("btn-music").title = music ? "Mute the Christmas music" : "Play the Christmas music";
    $("btn-music").setAttribute("aria-label", $("btn-music").title);
    if (music) VSSpooky.start(0.3, "assets/jingle.mp3", true); else VSSpooky.stop();
  } else if (was && !spooky.on) { VSSpooky.stop(); $("btn-music").hidden = true; }
  for (const k of ["theme", "snow", "lights", "music"]) { const el = $("set-jingle-" + k); if (el) el.checked = jingleOpt(k); }
}

// A string of lights across the top: a wire that sags between hooks, with a
// glass bulb hanging every so often, tilted to follow the wire. The glow rolls
// slowly along the string instead of blinking.
const BULB_COLORS = ["#ff4d55", "#ffc94d", "#3ddc84", "#5cb8ff", "#ff8a3d"];
function jingleString() {
  const box = document.querySelector(".jingle-bulbs");
  if (!box) return;
  // A thin string along the very top edge of the top bar, across its whole
  // width (after the logo), drawn BEHIND the buttons and the search box: the
  // small bulbs peek out above and between them, never over an icon or a click.
  const bar = $("titlebar");
  const brand = document.querySelector(".tb-name");
  const W = bar.clientWidth, left = brand ? Math.round(brand.getBoundingClientRect().right - bar.getBoundingClientRect().left + 14) : 180;
  const span = 46, sag = 2.2, hooks = Math.max(2, Math.round((W - left - 8) / span) + 1), seg = (W - left - 8) / (hooks - 1);
  let wire = "", bulbs = "", n = 0;
  for (let h = 0; h < hooks - 1; h++) {
    const x0 = left + h * seg;
    wire += `M${x0.toFixed(1)} 1Q${(x0 + seg / 2).toFixed(1)} ${1 + sag * 2} ${(x0 + seg).toFixed(1)} 1`;
    const t = 0.5, y = 1 + sag * 4 * t * (1 - t), x = x0 + t * seg, c = BULB_COLORS[n % BULB_COLORS.length];
    bulbs += `<g class="jb" style="--c:${c};animation-delay:${(-n * 0.35).toFixed(2)}s" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(.4)">
      <rect x="-2.2" y="0" width="4.4" height="3.6" rx=".8" class="jb-cap"/>
      <path d="M0 3.4c3.4 0 4.6 3.6 4.6 6.4 0 3.2-2.2 5.6-4.6 5.6s-4.6-2.4-4.6-5.6c0-2.8 1.2-6.4 4.6-6.4z" fill="${c}"/>
      <path d="M-1.9 6.4c.5-1.3 1.2-1.9 2-2.1" class="jb-shine"/></g>`;
    n++;
  }
  box.innerHTML = `<svg width="${W}" height="16" viewBox="0 0 ${W} 16"><path d="${wire}" class="jb-wire"/>${bulbs}</svg>`;
}

// Snow: a few dozen soft flakes on one canvas that never takes clicks, paused
// while the window is hidden.
function jingleSnow(want) {
  if (!want) {
    cancelAnimationFrame(jingle.raf);
    jingle.raf = 0;
    if (jingle.canvas) { removeEventListener("resize", jingle.canvas._fit); jingle.canvas.remove(); jingle.canvas = null; }
    return;
  }
  if (jingle.canvas) return;
  const c = document.createElement("canvas");
  c.className = "jingle-snow";
  c.setAttribute("aria-hidden", "true");
  document.body.appendChild(c);
  jingle.canvas = c;
  const g = c.getContext("2d");
  jingle.flakes = Array.from({ length: 55 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.8, v: 0.012 + Math.random() * 0.03, w: Math.random() * 6.28 }));
  const fit = () => { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; };
  fit();
  c._fit = fit;
  addEventListener("resize", fit);
  let last = performance.now();
  const step = (t) => {
    if (!jingle.canvas) return;
    jingle.raf = requestAnimationFrame(step);
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (document.hidden) return;
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,.75)";
    for (const f of jingle.flakes) {
      f.y += f.v * dt * 4;
      f.w += dt;
      if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
      g.globalAlpha = 0.35 + f.r / 4;
      g.beginPath();
      g.arc((f.x + Math.sin(f.w) * 0.006) * W, f.y * H, f.r * devicePixelRatio, 0, 6.283);
      g.fill();
    }
  };
  jingle.raf = requestAnimationFrame(step);
}

// The top-bar music button mutes whichever seasonal track is playing.
$("btn-music").onclick = () => {
  if (jingle.on) lsSet("vs-jingle-music", jingleOpt("music") ? "off" : "on");
  else lsSet("vs-spooky-music", lsGet("vs-spooky-music") === "off" ? "on" : "off");
  if (!jingleOpt("music") && jingle.on) VSSpooky.stop();
  applySpooky();
};
for (const k of ["theme", "snow", "lights", "music"]) {
  const el = $("set-jingle-" + k);
  if (el) el.addEventListener("change", (e) => { lsSet("vs-jingle-" + k, e.target.checked ? "on" : "off"); applyJingle(); });
}
window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", applyJingle);
// Halloween runs first (it also resets the name); December wins after it.
const jingleBaseSpooky = applySpooky;
applySpooky = function () { jingleBaseSpooky(); applyJingle(); };
applyJingle();

// Preview JingleScript² any time of year (Settings).
$("set-jingle-force").checked = lsGet("vs-jingle-force") === "1";
$("set-jingle-force").addEventListener("change", (e) => {
  lsSet("vs-jingle-force", e.target.checked ? "1" : "0");
  if (e.target.checked) lsSet("vs-jingle-theme", "on");
  applySpooky();
});

// Classic look: switches off the VoidScript² glow, glass and grid (styles.css).
const applyClassic = () => document.documentElement.classList.toggle("classic", lsGet("vs-classic") === "1");
applyClassic();
$("set-classic").checked = lsGet("vs-classic") === "1";
$("set-classic").addEventListener("change", (e) => { lsSet("vs-classic", e.target.checked ? "1" : "0"); applyClassic(); });
