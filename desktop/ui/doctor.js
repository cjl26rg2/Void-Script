// SPDX-License-Identifier: GPL-3.0-or-later
// doctor.js - the connection line on Home: the five things that have to be true
// before the AI can build (bridge, Studio, the Studio link, a place, tools), which
// one is the problem right now, and a button that fixes it when one can.
"use strict";

function doctorSteps(st) {
  const tools = (st.tools || []).length;
  const running = st.process === "running" || st.process === "starting";
  return [
    { id: "bridge", name: "Bridge", ok: !!st.connected, wait: !st.connected && st.process === "starting",
      why: st.process === "missing" ? "The app has to sit in its VoidScript folder, next to start.bat. Move it back there and reopen it."
        : st.process === "error" && st.exit_code === 3 ? "Python isn't installed. Install Python 3.9 or newer (tick “Add python.exe to PATH”), then press Start again."
        : st.process === "error" ? `The bridge stopped${st.exit_code != null ? ` (code ${st.exit_code})` : ""}. The log says why.`
        : st.process === "starting" ? "Starting the bridge…"
        : running ? "The bridge is running but not answering yet…" : "The bridge isn't running.",
      fix: st.process === "missing" ? null
        : st.process === "error" && st.exit_code === 3 ? ["Get Python", () => invoke("open_url", { url: "https://www.python.org/downloads/" }), "Start again", () => invoke("start_bridge")]
        : st.process === "error" ? ["Show the log", () => go("terminal"), "Start again", () => invoke("start_bridge")]
        : running ? null : ["Start bridge", () => invoke("start_bridge")] },
    { id: "studio", name: "Studio", ok: st.studio_app === true || st.studio === true, wait: st.studio_app == null && st.studio == null,
      why: "Roblox Studio isn't open. Open it - this updates on its own.", fix: null },
    { id: "link", name: "Link", ok: st.studio === true, wait: false,
      why: "Studio is open but not linked. In Studio: Assistant → ⋯ → Manage MCP Servers → turn on “Enable Studio as MCP server”.",
      fix: ["Relink", doctorRelink] },
    { id: "place", name: "Place", ok: !!st.place_name, wait: false,
      why: "Open a place in Studio - the start page has nothing to build in.", fix: null },
    { id: "tools", name: "Tools", ok: tools > 0, wait: false,
      why: "Linked, but Studio hasn't sent its tools yet. Give it a few seconds, or relink.", fix: ["Relink", doctorRelink] },
  ];
}
async function doctorRelink(btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Relinking…"; }
  try {
    const r = await invoke("bridge_request", { payload: { type: "restart_mcp" }, timeoutMs: 30000 });
    toast(r && r.ok === false ? "Relink failed: " + (r.error || "no answer") : "Relinked - give Studio a few seconds.", 4000);
  } catch (e) { toast(errText(e), 5000); }
  finally { if (btn) { btn.disabled = false; btn.textContent = "Relink"; } }
}
let doctorKey = "";
function doctorRender() {
  const st = S.state || {};
  const steps = doctorSteps(st);
  const bad = steps.find((s) => !s.ok);
  const key = JSON.stringify([steps.map((s) => [s.ok, s.wait]), bad && bad.why, st.place_name, (st.tools || []).length]);
  if (key === doctorKey) return;
  doctorKey = key;
  const box = $("doctor");
  box.className = "doctor " + (bad ? (bad.wait ? "wait" : "bad") : "ok");
  box.innerHTML = `<ol class="doc-steps">${steps.map((s) => `<li class="${s.ok ? "ok" : s === bad ? (s.wait ? "wait" : "bad") : ""}" title="${esc(s.name)}"><i></i>${esc(s.name)}</li>`).join("")}</ol>
    <p class="doc-why" role="status">${bad ? esc(bad.why) : `Ready to build in <b>${esc(st.place_name)}</b> · ${(st.tools || []).length} tool${(st.tools || []).length === 1 ? "" : "s"}`}</p>
    <div class="doc-fix">${bad && bad.fix ? bad.fix.filter((x) => typeof x === "string").map((t, i) => `<button class="btn sm${i ? "" : " primary"}" data-fix="${i}">${esc(t)}</button>`).join("") : ""}</div>`;
  box._fix = bad && bad.fix ? bad.fix.filter((x) => typeof x === "function") : [];
}
$("doctor").addEventListener("click", (e) => {
  const b = e.target.closest("[data-fix]");
  const f = b && $("doctor")._fix[Number(b.dataset.fix)];
  if (f) Promise.resolve(f(b)).catch((err) => toast(errText(err), 5000));
});
const doctorBaseRender = render;
render = function () { doctorBaseRender(); doctorRender(); };
doctorRender();
