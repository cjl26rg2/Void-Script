// SPDX-License-Identifier: GPL-3.0-or-later
// playtest.js - the Playtest page (it replaced the Browser): Studio's Output
// live in the app with filters and search, Play / Stop, timed test runs with a
// history, and any error handed to the AI in one click.
"use strict";

const pt = { text: "", base: 0, filter: "all", q: "", auto: true, busy: false, runs: [], timer: 0, lastFetch: 0 };
try { pt.runs = JSON.parse(lsGet("vs-pt-runs") || "[]"); } catch {}
const PT_ERR = /error|exception|attempt to|is not a valid member|stack begin|nil value|failed to|script timeout/i;
const PT_WARN = /warn|infinite yield|deprecated|is not a valid|throttl/i;
// A line that starts with "Some.Script.Path:12:" is Studio reporting a script
// error (syntax errors don't say "error"), so it counts as one.
const PT_AT = /^\s*[A-Za-z_][\w ]*(?:\.[\w ]+)+:\d+:/;
const ptKind = (l) => (PT_ERR.test(l) || PT_AT.test(l) ? "err" : PT_WARN.test(l) ? "warn" : "info");
// "ServerScriptService.Shop:42: attempt to…" or "Script 'Workspace.Door.Script', Line 7"
function ptWhere(l) {
  let m = l.match(/([A-Za-z_][\w ]*(?:\.[\w ]+)+):(\d+):/);
  if (m) return { path: m[1].trim(), line: Number(m[2]) };
  m = l.match(/Script '([^']+)', Line (\d+)/);
  return m ? { path: m[1], line: Number(m[2]) } : null;
}

async function ptFetch(force) {
  if (!S.state.connected || pt.busy) return;
  if (!force && (document.hidden || !$("view-playtest").classList.contains("active"))) return;
  pt.busy = true;
  try {
    const out = await callTool("get_console_output", {}, 20000);
    pt.text = String(out || "").replace(/^Output of '[^']*':\n?/, "");
    if (pt.base > pt.text.length) pt.base = 0; // Studio's Output was cleared or Studio restarted
    pt.lastFetch = Date.now();
    ptRender();
  } catch (e) {
    $("pt-status").textContent = errText(e);
  } finally { pt.busy = false; }
}
function ptLines() {
  const lines = pt.text.slice(pt.base).split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
  // repeats fold into one line with a count
  const out = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev && prev.t === l) prev.n++;
    else out.push({ t: l, n: 1, k: ptKind(l) });
  }
  return out;
}
function ptRender() {
  const all = ptLines();
  const counts = { err: 0, warn: 0, info: 0 };
  for (const l of all) counts[l.k] += l.n;
  const q = pt.q.toLowerCase();
  const shown = all.filter((l) => (pt.filter === "all" || l.k === pt.filter) && (!q || l.t.toLowerCase().includes(q))).slice(-600);
  $("pt-filter").querySelectorAll("button").forEach((b) => {
    const k = b.dataset.v, n = k === "all" ? counts.err + counts.warn + counts.info : counts[k];
    b.classList.toggle("on", k === pt.filter);
    b.innerHTML = `${{ all: "All", err: "Errors", warn: "Warnings", info: "Prints" }[k]} <em>${n}</em>`;
  });
  const box = $("pt-out"), stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.innerHTML = shown.length ? shown.map((l, i) => {
    const w = l.k !== "info" && ptWhere(l.t);
    return `<div class="pt-l pt-${l.k}" data-i="${i}"><code>${esc(l.t)}</code>${l.n > 1 ? `<span class="pt-n">×${l.n}</span>` : ""}
      <span class="pt-acts">${l.k === "err" || l.k === "warn" ? '<button class="link" data-a="fix">Ask the AI</button>' : ""}${w ? `<button class="link" data-a="open" data-p="${esc(w.path)}">Open script</button>` : ""}<button class="link" data-a="copy">Copy</button></span></div>`;
  }).join("") : `<p class="muted pt-empty">${S.state.connected ? (pt.text ? "Nothing matches." : "Studio's Output is empty. Press Play, or print something.") : "Start the bridge and open Roblox Studio to see its Output here."}</p>`;
  box._shown = shown;
  if (stick) box.scrollTop = box.scrollHeight;
  $("pt-status").textContent = pt.lastFetch ? `Updated ${new Date(pt.lastFetch).toLocaleTimeString()}${pt.auto ? " · live" : ""}` : "";
  $("pt-runs").innerHTML = pt.runs.length ? pt.runs.slice(0, 12).map((r, i) => `<button class="pt-run${r.errors.length ? " bad" : ""}" data-r="${i}"><b>${r.errors.length ? `${r.errors.length} error${r.errors.length === 1 ? "" : "s"}` : "No errors"}</b><span>${r.secs}s · ${esc(ago(r.t))}${r.place ? " · " + esc(r.place) : ""}</span></button>`).join("")
    : '<p class="muted small-p">Test runs show up here.</p>';
}
function ptAskAI(text) {
  go("chat");
  input.value = `This came up in Roblox Studio's Output. Find the cause and fix it:\n${text}`;
  grow();
  input.focus();
}
async function ptPlay(start) {
  try { await callTool("start_stop_play", { is_start: start }, 60000); toast(start ? "Playing in Studio." : "Stopped."); setTimeout(() => ptFetch(true), 1500); }
  catch (e) { toast(errText(e), 5000); }
}
async function ptTest() {
  const secs = lnum(val("pt-secs"), 10, 3, 120), btn = $("btn-pt-test");
  btn.disabled = true;
  try {
    const before = String(await callTool("get_console_output", {}, 20000).catch(() => ""));
    btn.textContent = "Starting…";
    await callTool("start_stop_play", { is_start: true }, 60000);
    for (let i = secs; i > 0; i--) { btn.textContent = `Playing… ${i}s`; await sleep(1000); }
    const after = String(await callTool("get_console_output", {}, 20000).catch(() => ""));
    btn.textContent = "Stopping…";
    await callTool("start_stop_play", { is_start: false }, 60000).catch(() => {});
    const fresh = before && after.startsWith(before) ? after.slice(before.length) : after.split("\n").slice(-200).join("\n");
    const lines = fresh.split("\n").map((l) => l.trim()).filter(Boolean);
    const run = { t: Date.now(), secs, place: S.state.place_name || "", errors: [...new Set(lines.filter((l) => ptKind(l) === "err"))].slice(0, 40), warns: [...new Set(lines.filter((l) => ptKind(l) === "warn"))].slice(0, 30) };
    pt.runs = [run].concat(pt.runs).slice(0, 30);
    lsSet("vs-pt-runs", JSON.stringify(pt.runs));
    toast(run.errors.length ? `${run.errors.length} error${run.errors.length === 1 ? "" : "s"} while it played.` : "Played with no errors.", 4000);
    sfx(run.errors.length ? "error" : "done");
    await ptFetch(true);
  } catch (e) {
    toast(errText(e), 6000);
    callTool("start_stop_play", { is_start: false }, 20000).catch(() => {});
  } finally { btn.disabled = false; btn.textContent = "Test run"; }
}

$("btn-pt-play").onclick = () => ptPlay(true);
$("btn-pt-stop").onclick = () => ptPlay(false);
$("btn-pt-test").onclick = ptTest;
$("btn-pt-clear").onclick = () => { pt.base = pt.text.length; ptRender(); toast("Cleared here - Studio's own Output is untouched."); };
$("btn-pt-refresh").onclick = () => ptFetch(true);
$("pt-auto").checked = pt.auto;
$("pt-auto").onchange = (e) => { pt.auto = e.target.checked; ptRender(); };
$("pt-q").addEventListener("input", (e) => { pt.q = e.target.value; ptRender(); });
$("pt-filter").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) { pt.filter = b.dataset.v; ptRender(); } });
$("pt-out").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-a]"), row = e.target.closest(".pt-l");
  if (!a || !row) return;
  const l = $("pt-out")._shown[Number(row.dataset.i)];
  if (a.dataset.a === "copy") { try { await navigator.clipboard.writeText(l.t); toast("Copied."); } catch { toast("Couldn't copy."); } }
  if (a.dataset.a === "fix") ptAskAI(l.t);
  if (a.dataset.a === "open") { go("explorer"); $("ex-q").value = a.dataset.p.split(".").pop(); exSearch($("ex-q").value); }
});
$("pt-runs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-r]");
  if (!b) return;
  const r = pt.runs[Number(b.dataset.r)];
  if (!r.errors.length) { toast("That run had no errors."); return; }
  ptAskAI(r.errors.join("\n"));
});
// Live while the page is open (every 2 seconds), quiet otherwise.
setInterval(() => { if (pt.auto) ptFetch(false); }, 2000);
const ptBaseGo = go;
go = function (view) { ptBaseGo(view); if (view === "playtest") { ptRender(); ptFetch(true); } };
NAV_ORDER.splice(NAV_ORDER.indexOf("kit") + 1, 0, "playtest");
PAGES.splice(PAGES.findIndex((p) => p[0] === "kit") + 1, 0, ["playtest", "Playtest"]);
ptRender();
