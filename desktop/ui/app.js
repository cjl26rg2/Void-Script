// SPDX-License-Identifier: GPL-3.0-or-later
// VoidScript Desktop UI. Talks only to the Rust backend (window.__TAURI__): the
// backend owns the bridge process, the bridge connection, the NVIDIA key and the
// workspace jail. Model output is always rendered as escaped text.
"use strict";

const TAURI = window.__TAURI__;
const invoke = TAURI.core.invoke;
const listen = TAURI.event.listen;
const appWin = TAURI.window.getCurrentWindow();
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const DEFAULTS = { nvidia: "deepseek-ai/deepseek-v4.1-flash", openrouter: "openai/gpt-4o-mini" };
// NVIDIA retires models without notice (Llama 3.3 70B went in 2026). If the chosen
// one is gone, the chat switches to the first of these that is still listed.
// Fast models first: the big ones (Kimi, full GLM) queue for a long time on the free tier.
const NV_FALLBACK = ["deepseek-ai/deepseek-v4.1-flash", "z-ai/glm-5.3-flash", "nvidia/nemotron-3.5-lightning-30b-a3b",
  "moonshotai/kimi-k2.6", "z-ai/glm-5.3", "nvidia/nemotron-3-super-120b-a12b", "openai/gpt-oss-20b"];
const PROV_NAME = { nvidia: "NVIDIA", openrouter: "OpenRouter" };
const PROV_KEY_URL = { nvidia: "https://build.nvidia.com/", openrouter: "https://openrouter.ai/keys" };
const TOOL_RESULT_CAP = 12000;
const REF_TOTAL_CAP = 400 * 1024;

const LANGS = [
  ["", "English"], ["Spanish", "Español"], ["Brazilian Portuguese", "Português (BR)"], ["French", "Français"],
  ["German", "Deutsch"], ["Italian", "Italiano"], ["Russian", "Русский"], ["Turkish", "Türkçe"],
  ["Polish", "Polski"], ["Indonesian", "Bahasa Indonesia"], ["Vietnamese", "Tiếng Việt"], ["Thai", "ไทย"],
  ["Japanese", "日本語"], ["Korean", "한국어"], ["Simplified Chinese", "中文（简体）"],
];

let S = { state: {}, settings: {}, version: "" };
const prov = () => (S.settings.provider === "openrouter" ? "openrouter" : "nvidia");
const curModel = (p) => { p = p || prov(); return S.settings[p + "_model"] || DEFAULTS[p]; };
const keySet = (p) => !!S.settings[(p || prov()) + "_key_set"];

// ── small helpers ───────────────────────────────────────────────────────────
let toastTimer = 0;
function toast(msg, ms = 2600) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
const fmtTime = (ms) => { const d = new Date(ms); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":"); };
const cap = (s, n = TOOL_RESULT_CAP) => (s.length > n ? s.slice(0, n) + "\n…(truncated)" : s);
const errText = (e) => (e && e.message) || String(e);

// ── window chrome + navigation ─────────────────────────────────────────────
$("win-min").onclick = () => appWin.minimize();
$("win-max").onclick = () => appWin.toggleMaximize();
$("win-close").onclick = () => appWin.close();

function go(view) {
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  if (view === "terminal") $("term").scrollTop = $("term").scrollHeight;
  if (view === "chat") $("chat-input").focus();
  if (view === "mcp") loadMcp();
}
document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
$("btn-go-chat").onclick = () => go("chat");
$("btn-go-term").onclick = () => go("terminal");
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-url]");
  if (b) invoke("open_url", { url: b.dataset.url }).catch((err) => toast(errText(err)));
});

// ── status rendering ────────────────────────────────────────────────────────
function bridgeInfo(st) {
  const p = st.process;
  if (p === "missing") return { cls: "bad", pill: "missing", big: "Folder not found", small: "Put VoidScript.exe in the VoidScript folder, next to start.bat." };
  if (p === "updating") return { cls: "acc", pill: "updating", big: "Updating…", small: "Installing the new version." };
  if (st.connected && (p === "stopped" || p === "error")) return { cls: "ok", pill: "on", big: "Running", small: "Started outside this app (start.bat)." };
  if (p === "error") return { cls: "bad", pill: "error", big: "Stopped", small: "It stopped with an error — check the Terminal." };
  if (p === "stopped") return { cls: "", pill: "off", big: "Stopped", small: "Press Start bridge to begin." };
  if (st.connected) return { cls: "ok", pill: "on", big: "Running", small: "Listening on 127.0.0.1:17613" };
  return { cls: "warn", pill: "starting", big: "Starting…", small: "Checking Python, updates and Studio's MCP server." };
}
function studioInfo(st) {
  if (!st.connected) return { cls: "", pill: "—", big: "—", small: "Start the bridge first." };
  if (st.studio === true) return { cls: "ok", pill: "on", big: "Connected", small: st.place_name ? "Place: " + st.place_name : "Studio is attached." };
  if (st.studio === false) return { cls: "warn", pill: "off", big: "Not connected", small: "Open Roblox Studio → Assistant settings → enable Studio as MCP server." };
  return { cls: "warn", pill: "…", big: "Checking…", small: "Asking Studio's MCP server." };
}
function setDot(el, cls) { el.className = "dot" + (cls ? " " + cls : ""); }
function setCard(id, info) {
  const card = $(id);
  setDot(card.querySelector(".dot"), info.cls);
  card.querySelector(".big").textContent = info.big;
  card.querySelector(".small").textContent = info.small;
}
function setPill(id, info) {
  setDot($(id).querySelector(".dot"), info.cls);
  $(id).querySelector(".val").textContent = info.pill;
}

let lastToolsKey = "";
function render() {
  const st = S.state || {};
  const b = bridgeInfo(st), s = studioInfo(st);
  setCard("card-bridge", b); setPill("pill-bridge", b);
  setCard("card-studio", s); setPill("pill-studio", s);

  const tools = st.tools || [];
  const servers = st.servers || [];
  setCard("card-tools", {
    cls: tools.length ? "ok" : "",
    big: String(tools.length),
    small: servers.length ? servers.map((x) => `${x.id}${x.alive ? "" : " (down)"}`).join(" · ") : (st.connected ? "No MCP servers reported." : "Start the bridge to load tools."),
  });
  const set = S.settings || {};
  const wsOn = set.workspace_enabled && set.workspace_dir;
  const full = access() === "full";
  setCard("card-ws", full
    ? { cls: "acc", big: "Full PC", small: "The AI can reach any file and run commands. Deletes still ask." }
    : { cls: wsOn ? "acc" : "", big: wsOn ? "On" : "Off", small: wsOn ? set.workspace_dir : "The AI can't touch your files." });

  const running = st.process === "running" || st.process === "starting" || st.process === "updating";
  const tog = $("btn-bridge-toggle");
  tog.textContent = running ? "Stop bridge" : "Start bridge";
  tog.classList.toggle("primary", !running);
  tog.classList.toggle("danger", running);
  tog.disabled = st.process === "missing" || (st.connected && !running);
  $("btn-bridge-restart").disabled = st.process === "missing";

  $("chat-prov").textContent = PROV_NAME[prov()];
  $("chat-model-name").textContent = curModel();
  $("chat-ws").textContent = full ? "full PC access" : wsOn ? "workspace on" : "workspace off";
  $("chat-ws").classList.toggle("on", !!(wsOn || full));
  $("chat-bridge").hidden = !!st.connected;

  const key = JSON.stringify(tools.map((t) => t.name));
  if (key !== lastToolsKey) {
    lastToolsKey = key;
    renderTools();
    $("tool-names").innerHTML = tools.map((t) => `<option value="${esc(t.name)}"></option>`).join("");
  }
}

// ── log / terminal ──────────────────────────────────────────────────────────
const LOG_MAX = 2500;
const term = $("term");
const recent = [];
let miniQueued = false;
function termLine(text, kind, t) {
  const d = document.createElement("div");
  d.className = "ln " + (kind || "");
  d.innerHTML = `<span class="ts">${fmtTime(t || Date.now())}</span>${esc(text)}`;
  term.appendChild(d);
  while (term.childElementCount > LOG_MAX) term.firstChild.remove();
  if ($("term-follow").checked) term.scrollTop = term.scrollHeight;
}
function addLog(l) {
  termLine(l.text, l.kind, l.t);
  recent.push(l);
  if (recent.length > 8) recent.shift();
  if (!miniQueued) {
    miniQueued = true;
    requestAnimationFrame(() => {
      miniQueued = false;
      $("home-log").innerHTML = recent.slice(-7).map((x) => `<div class="ln">${esc(x.text)}</div>`).join("") || '<div class="ln">Nothing yet.</div>';
    });
  }
}
$("btn-term-clear").onclick = () => { term.innerHTML = ""; };
$("btn-term-copy").onclick = async () => {
  try { await navigator.clipboard.writeText(term.innerText); toast("Terminal copied."); } catch { toast("Could not copy."); }
};
$("btn-open-logs").onclick = () => invoke("open_folder", { which: "logs" }).catch((e) => toast(errText(e)));

$("btn-run-tool").onclick = async () => {
  const name = $("run-tool").value.trim();
  if (!name) { toast("Type a tool name."); return; }
  let args;
  try { args = JSON.parse($("run-args").value.trim() || "{}"); } catch { toast("Arguments must be valid JSON."); return; }
  termLine(`> ${name} ${JSON.stringify(args)}`, "cmd");
  try {
    const r = await invoke("bridge_request", { payload: { type: "call_tool", name, arguments: args }, timeoutMs: 180000 });
    const ok = r && r.type === "tool_result" && r.ok;
    const text = ok ? (r.text || "(no output)") : "ERROR " + ((r && (r.error || r.kind)) || "failed");
    text.split("\n").forEach((ln) => termLine(ln, ok ? "res" : "err"));
    if (ok && r.images && r.images.length) termLine(`(${r.images.length} image(s) returned)`, "res");
  } catch (e) { termLine("ERROR " + errText(e), "err"); }
};
$("run-args").addEventListener("keydown", (e) => { if (e.key === "Enter") $("btn-run-tool").click(); });

// ── tools view ──────────────────────────────────────────────────────────────
function renderTools() {
  const q = $("tools-search").value.trim().toLowerCase();
  const tools = (S.state.tools || []).filter((t) => !q || t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q));
  $("tools-sub").textContent = (S.state.tools || []).length
    ? `${(S.state.tools || []).length} tools available to the AI through the bridge.`
    : "No tools yet — start the bridge and open Roblox Studio.";
  const groups = {};
  tools.forEach((t) => { (groups[t.server || "roblox"] = groups[t.server || "roblox"] || []).push(t); });
  const alive = {};
  (S.state.servers || []).forEach((s) => { alive[s.id] = s.alive; });
  $("tools-list").innerHTML = Object.keys(groups).sort().map((srv) => `
    <div class="srv">
      <div class="srv-h"><span class="dot ${alive[srv] === false ? "bad" : "ok"}"></span>${esc(srv)} <span class="chip">${groups[srv].length}</span></div>
      <div class="tgrid">${groups[srv].map((t) => {
        const props = (t.inputSchema && t.inputSchema.properties) || {};
        const req = new Set((t.inputSchema && t.inputSchema.required) || []);
        const params = Object.keys(props).map((p) => `<div class="param"><b>${esc(p)}</b>${req.has(p) ? "*" : ""} <span>${esc(props[p].type || "")}</span></div>`).join("") || '<div class="param">no parameters</div>';
        return `<div class="tcard" data-tool="${esc(t.name)}"><div class="tn">${esc(t.name)}</div><div class="td">${esc(t.description || "")}</div>
          <div class="params">${params}<button class="btn sm try">Try in terminal</button></div></div>`;
      }).join("")}</div>
    </div>`).join("") || '<p class="muted">No matching tools.</p>';
}
$("tools-search").addEventListener("input", renderTools);
$("tools-list").addEventListener("click", (e) => {
  const card = e.target.closest(".tcard");
  if (!card) return;
  if (e.target.closest(".try")) {
    $("run-tool").value = card.dataset.tool;
    $("run-args").value = "{}";
    go("terminal");
    $("run-args").focus();
    return;
  }
  card.classList.toggle("open");
});

// ── extra MCP servers ───────────────────────────────────────────────────────
// Presets write into config.json (via the backend) and restart the bridge.
const MCP_PRESETS = [
  { id: "notion", name: "Notion", desc: "Read and write your Notion pages: game design docs, task lists, patch notes.", command: "npx", args: ["-y", "@notionhq/notion-mcp-server"],
    needs: "Needs Node.js and a Notion integration token (share your pages with it).", url: "https://www.notion.so/profile/integrations",
    env: { key: "NOTION_TOKEN", label: "Notion integration token", placeholder: "ntn_…" } },
  { id: "blender", name: "Blender", desc: "Model, texture and render in Blender, then bring it into Studio.", command: "uvx", args: ["blender-mcp"],
    needs: "Needs uv and the Blender MCP add-on installed in Blender.", url: "https://github.com/ahujasid/blender-mcp" },
  { id: "fetch", name: "Web fetch", desc: "Read web pages and docs (DevForum, create.roblox.com).", command: "uvx", args: ["mcp-server-fetch"],
    needs: "Needs uv.", url: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch" },
  { id: "context7", name: "Context7 docs", desc: "Up-to-date library and API docs for the AI.", command: "npx", args: ["-y", "@upstash/context7-mcp"],
    needs: "Needs Node.js.", url: "https://github.com/upstash/context7" },
  { id: "memory", name: "Memory", desc: "A knowledge graph the AI keeps between chats.", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"],
    needs: "Needs Node.js.", url: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory" },
  { id: "thinking", name: "Sequential thinking", desc: "Step-by-step planning for bigger builds.", command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    needs: "Needs Node.js.", url: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking" },
  { id: "git", name: "Git", desc: "Read and commit to a git repo (e.g. your Rojo project).", command: "uvx", args: ["mcp-server-git"],
    needs: "Needs uv.", url: "https://github.com/modelcontextprotocol/servers/tree/main/src/git" },
];
let mcpInstalled = [], mcpPending = null;

function splitArgs(s) {
  const out = []; const re = /"([^"]*)"|(\S+)/g; let m;
  while ((m = re.exec(s))) out.push(m[1] != null ? m[1] : m[2]);
  return out;
}
async function loadMcp() {
  try { mcpInstalled = await invoke("mcp_list"); } catch { mcpInstalled = []; }
  renderMcp();
}
function renderMcp() {
  const have = new Set(mcpInstalled.map((s) => s.id));
  const custom = mcpInstalled.filter((s) => !s.primary && !MCP_PRESETS.some((p) => p.id === s.id));
  $("mcp-catalog").innerHTML = MCP_PRESETS.map((p) => `
    <div class="mcp-item${have.has(p.id) ? " on" : ""}">
      <div class="mcp-top"><b>${esc(p.name)}</b>${have.has(p.id) ? '<span class="chip">added</span>' : ""}</div>
      <div class="td">${esc(p.desc)}</div>
      <div class="mcp-needs">${esc(p.needs)} <button class="link" data-url="${esc(p.url)}">Setup guide</button></div>
      ${mcpPending === p.id && p.env ? `<div class="mcp-env">
        <input class="input mono" type="password" id="mcp-env-val" placeholder="${esc(p.env.placeholder)}" aria-label="${esc(p.env.label)}" autocomplete="off" spellcheck="false" />
        <button class="btn sm primary" data-mcp="${esc(p.id)}" data-act="save">Save</button></div>` :
      `<button class="btn sm ${have.has(p.id) ? "" : "primary"}" data-mcp="${esc(p.id)}" data-act="${have.has(p.id) ? "remove" : "add"}">${have.has(p.id) ? "Remove" : "Add"}</button>`}
    </div>`).join("") + custom.map((s) => `
    <div class="mcp-item on">
      <div class="mcp-top"><b>${esc(s.id)}</b><span class="chip">custom</span></div>
      <div class="td mono">${esc([s.command].concat(s.args || []).join(" "))}</div>
      <button class="btn sm" data-mcp="${esc(s.id)}" data-act="remove">Remove</button>
    </div>`).join("");
}
async function applyMcp(fn, msg) {
  try {
    await fn();
    await loadMcp();
    const running = ["running", "starting"].includes(S.state.process);
    if (running) await invoke("restart_bridge");
    toast(msg + (running ? " Restarting the bridge…" : " Start the bridge to load it."), 3500);
  } catch (e) { toast(errText(e), 4500); }
}
$("mcp-catalog").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mcp]");
  if (!b) return;
  const id = b.dataset.mcp;
  if (b.dataset.act === "remove") return applyMcp(() => invoke("mcp_remove", { id }), `Removed ${id}.`);
  const p = MCP_PRESETS.find((x) => x.id === id);
  // Presets that need a token ask for it inline; it goes straight into config.json.
  if (p.env && b.dataset.act === "add") { mcpPending = id; renderMcp(); $("mcp-env-val").focus(); return; }
  let env;
  if (p.env) {
    const v = $("mcp-env-val").value.trim();
    if (!v) { toast(`Paste your ${p.env.label} first.`); return; }
    env = { [p.env.key]: v };
  }
  mcpPending = null;
  applyMcp(() => invoke("mcp_add", { id: p.id, command: p.command, args: p.args, env }), `Added ${p.name}.`);
});
$("mcp-catalog").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "mcp-env-val") e.target.parentElement.querySelector("button").click();
  if (e.key === "Escape" && mcpPending) { mcpPending = null; renderMcp(); }
});
$("btn-mcp-add").onclick = () => {
  const id = $("mcp-id").value.trim(), command = $("mcp-cmd").value.trim();
  if (!id || !command) { toast("Give the server a name and a command."); return; }
  applyMcp(() => invoke("mcp_add", { id, command, args: splitArgs($("mcp-args").value) }), `Added ${id}.`)
    .then(() => { ["mcp-id", "mcp-cmd", "mcp-args"].forEach((k) => { $(k).value = ""; }); });
};

// ── notifications (bell in the title bar) ───────────────────────────────────
// Kept on this PC. `key` de-dupes: the same update or problem is only added once.
let notifs = [];
try { notifs = JSON.parse(localStorage.getItem("vs-notifs") || "[]"); } catch {}
const NOTIF_ICON = { update: "⬆", warn: "⚠", ok: "✓", info: "•" };
function saveNotifs() { try { localStorage.setItem("vs-notifs", JSON.stringify(notifs.slice(0, 40))); } catch {} renderNotifs(); }
function notify(kind, title, text, opts = {}) {
  if (opts.key && notifs.some((n) => n.key === opts.key)) return;
  notifs.unshift({ id: Date.now() + Math.random(), key: opts.key || "", kind, title, text, t: Date.now(), read: false, go: opts.go || "" });
  saveNotifs();
}
function renderNotifs() {
  const unread = notifs.filter((n) => !n.read).length;
  const badge = $("bell-badge");
  badge.hidden = !unread;
  badge.textContent = unread > 5 ? "5+" : String(unread);
  $("btn-bell").classList.toggle("has", !!unread);
  $("notif-list").innerHTML = notifs.length ? notifs.map((n) => `
    <button class="notif ${n.read ? "" : "unread"} k-${esc(n.kind)}" data-id="${n.id}">
      <span class="ni">${NOTIF_ICON[n.kind] || "•"}</span>
      <span class="nb"><b>${esc(n.title)}</b><span>${esc(n.text)}</span><i>${esc(ago(n.t))}</i></span>
    </button>`).join("") : '<div class="notif-empty">You\'re all caught up.</div>';
}
function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}
$("btn-bell").onclick = (e) => { e.stopPropagation(); $("notif-pop").hidden = !$("notif-pop").hidden; renderNotifs(); };
$("notif-pop").addEventListener("click", (e) => {
  e.stopPropagation();
  const it = e.target.closest(".notif");
  if (!it) return;
  const n = notifs.find((x) => String(x.id) === it.dataset.id);
  if (!n) return;
  n.read = true; saveNotifs();
  if (n.go) { $("notif-pop").hidden = true; go(n.go); }
});
document.addEventListener("click", () => { $("notif-pop").hidden = true; });
$("btn-notif-read").onclick = () => { notifs.forEach((n) => { n.read = true; }); saveNotifs(); };
$("btn-notif-clear").onclick = () => { notifs = []; saveNotifs(); };
renderNotifs();

// Bridge / Studio changes worth a notification (not every flicker: transitions only).
let lastSeen = { process: "", studio: null };
function watchState(st) {
  if (st.process === "error" && lastSeen.process !== "error") notify("warn", "Bridge stopped", "The bridge stopped with an error. Check the Terminal, then press Start bridge.", { go: "terminal" });
  if (lastSeen.studio === true && st.studio === false) notify("warn", "Roblox Studio disconnected", "Open your place in Studio and make sure its MCP server is on.", { go: "home" });
  if (lastSeen.studio === false && st.studio === true) { notify("ok", "Roblox Studio connected", st.place_name ? `Working in ${st.place_name}.` : "Ready to build."); sfx("ready"); }
  lastSeen = { process: st.process, studio: st.connected ? st.studio : lastSeen.studio };
}

// ── updates ─────────────────────────────────────────────────────────────────
// Release notes are Markdown: headings, bullets, bold, `code` and links (shown as text).
function notesHtml(src) {
  const inline = (x) => esc(x.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"))
    .replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  return String(src || "").replace(/\r/g, "").replace(/```[^\n]*\n?/g, "").split("\n").map((l) => {
    const t = l.trim();
    if (!t) return "";
    if (/^#{1,6}\s/.test(t)) return `<h4>${inline(t.replace(/^#+\s*/, ""))}</h4>`;
    if (/^[-*]\s/.test(t)) return `<li class="${/^\s{2,}/.test(l) ? "sub" : ""}">${inline(t.slice(2))}</li>`;
    return `<p>${inline(t)}</p>`;
  }).join("");
}
let upd = null;
async function checkUpdate(manual) {
  $("upd-status").textContent = "Checking…";
  try {
    upd = await invoke("check_update");
  } catch (e) {
    $("upd-status").textContent = "Couldn't check for updates: " + errText(e);
    if (manual) toast(errText(e), 4000);
    return;
  }
  $("upd-cur").textContent = "v" + upd.current;
  $("upd-new").textContent = upd.latest || "—";
  $("upd-dot").hidden = !upd.newer;
  $("btn-upd-go").hidden = !(upd.newer && upd.has_asset);
  $("btn-upd-web").hidden = !upd.url;
  $("upd-status").textContent = upd.newer
    ? (upd.has_asset ? `${upd.latest} is ready to install.` : `${upd.latest} is out, but its download isn't up yet. Try again in a bit.`)
    : "You're on the latest version.";
  $("upd-notes-card").hidden = !upd.notes;
  $("upd-notes-title").textContent = upd.name || `What's new in ${upd.latest}`;
  // Notes usually open with the release title again - the card already shows it.
  const notes = String(upd.notes || "").replace(/\r/g, "").replace(/^\s*#{1,6}\s*([^\n]*)\n?/, (m, t) => (upd.name && t.trim() === String(upd.name).trim() ? "" : m));
  $("upd-notes").innerHTML = notesHtml(notes);
  if (upd.newer) notify("update", `Update available: ${upd.latest}`, "Open Updates to install it. VoidScript reopens by itself.", { key: "update-" + upd.latest, go: "updates" });
  else if (manual) toast("You're on the latest version.");
}
$("btn-upd-check").onclick = () => checkUpdate(true);
$("btn-upd-web").onclick = () => upd && upd.url && invoke("open_url", { url: upd.url });
$("btn-upd-go").onclick = async () => {
  if (chat.busy) { toast("Stop the chat first, then update."); return; }
  $("updating").hidden = false;
  $("updating-fail").hidden = true;
  $("updating-title").textContent = "VoidScript is currently updating";
  $("updating-line").textContent = "Getting the new version…";
  try {
    const r = await invoke("run_update");
    if (r === "up-to-date") {
      // The folder already has the new release (e.g. start.bat updated it) but this
      // running app is the old exe - reopen on the new one instead of doing nothing.
      if (upd && upd.newer) {
        $("updating-line").textContent = "Already downloaded. Reopening VoidScript…";
        await invoke("relaunch");
        return;
      }
      $("updating").hidden = true; toast("Already up to date."); checkUpdate();
    }
    // "updated": the app closes and reopens on its own.
  } catch (e) {
    $("updating-err").textContent = errText(e);
    $("updating-fail").hidden = false;
    $("updating-title").textContent = "The update didn't finish";
    $("updating-line").textContent = "Nothing was changed. Check your internet connection and try again.";
    notify("warn", "Update failed", errText(e).split("\n")[0], { go: "updates" });
  }
};
$("btn-updating-close").onclick = () => { $("updating").hidden = true; };
listen("update-log", (e) => {
  const line = String(e.payload || "").replace(/^\[update\]\s*/, "").trim();
  if (line) $("updating-line").textContent = line;
});

// ── bridge controls ─────────────────────────────────────────────────────────
$("btn-bridge-toggle").onclick = async () => {
  const p = S.state.process;
  try {
    if (p === "running" || p === "starting" || p === "updating") await invoke("stop_bridge");
    else await invoke("start_bridge");
  } catch (e) { toast(errText(e), 4000); }
};
$("btn-bridge-restart").onclick = () => invoke("restart_bridge").catch((e) => toast(errText(e), 4000));

// ── settings ────────────────────────────────────────────────────────────────
$("set-lang").innerHTML = LANGS.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join("");
function renderSettings() {
  const s = S.settings || {};
  const p = prov();
  document.querySelectorAll("#prov-seg button").forEach((b) => b.classList.toggle("on", b.dataset.prov === p));
  $("key-label").textContent = `${PROV_NAME[p]} API key`;
  $("set-key").placeholder = p === "openrouter" ? "sk-or-…" : "nvapi-…";
  $("prov-hint").innerHTML = p === "openrouter"
    ? `Hundreds of models (GPT, Claude, Gemini, Llama, Qwen…) with one key. Get one at <button class="link" data-url="${PROV_KEY_URL.openrouter}">openrouter.ai/keys</button> — models ending in <code>:free</code> cost nothing.`
    : `Free API access to Kimi, GLM, DeepSeek, Nemotron and more. Get a key at <button class="link" data-url="${PROV_KEY_URL.nvidia}">build.nvidia.com</button>.`;
  $("key-status").textContent = s[p + "_key_set"] ? `Key saved (${s[p + "_key_hint"] || "hidden"}).` : "No key saved yet.";
  $("set-model").value = s[p + "_model"] || "";
  $("set-model").placeholder = DEFAULTS[p];
  $("model-hint").textContent = p === "openrouter"
    ? "Load models to see which support tools (needed to build in Studio)."
    : "Pick a model that supports tool calling. Flash models (DeepSeek V4.1 Flash, GLM 5.3 Flash) answer fastest; Kimi K2.6 is stronger but slow. Press Test to check your key.";
  $("set-ws-on").checked = !!s.workspace_enabled;
  $("set-ws-dir").value = s.workspace_dir || "";
  $("set-lang").value = s.reply_language || "";
  $("set-autostart").checked = s.auto_start_bridge !== false;
  $("set-tray").checked = s.close_to_tray !== false;
  applyTheme(s.theme);
  $("chat-empty-sub").textContent = keySet()
    ? "Describe a feature and VoidScript builds it in your open Studio place. Attach reference files with the paperclip."
    : `This chat runs on your own API key. Add your ${PROV_NAME[p]} key in Settings, or use the browser extension for ChatGPT, Gemini, DeepSeek and more.`;
}
async function saveSettings(patch, msg) {
  try {
    S.settings = await invoke("save_settings", { patch });
    renderSettings(); render();
    if (msg) toast(msg);
  } catch (e) { toast(errText(e), 4000); }
}
$("btn-save-key").onclick = async () => {
  const v = $("set-key").value.trim();
  if (!v) { toast("Paste your API key first."); return; }
  const p = prov();
  modelCache[p] = null;
  await saveSettings({ [p + "_key"]: v }, `${PROV_NAME[p]} key saved.`);
  $("set-key").value = "";
};
$("set-key").addEventListener("keydown", (e) => { if (e.key === "Enter") $("btn-save-key").click(); });
$("btn-test-key").onclick = async () => {
  const p = prov(), btn = $("btn-test-key");
  if ($("set-key").value.trim()) await $("btn-save-key").onclick();
  if (!keySet(p)) { toast("Save a key first."); return; }
  btn.disabled = true; btn.textContent = "Testing…";
  try {
    const { model } = await callModel({ messages: [{ role: "user", content: "Reply with: ok" }], max_tokens: 16 }, { quiet: true });
    $("key-status").textContent = `Key works ✓ (${model}).`;
    toast(`${PROV_NAME[p]} key works with ${model}.`, 3500);
  } catch (e) {
    $("key-status").textContent = "Test failed: " + errText(e).split("\n").slice(0, 2).join(" ");
    toast(errText(e), 6000);
  } finally { btn.disabled = false; btn.textContent = "Test"; }
};
$("btn-clear-key").onclick = () => { modelCache[prov()] = null; saveSettings({ ["clear_" + prov() + "_key"]: true }, "API key removed."); };
$("set-model").addEventListener("change", () => saveSettings({ [prov() + "_model"]: $("set-model").value.trim() }, "Model saved."));
document.querySelectorAll("#prov-seg button").forEach((b) => b.addEventListener("click", () => {
  if (b.dataset.prov !== prov()) { $("model-list").innerHTML = ""; saveSettings({ provider: b.dataset.prov }, `Using ${PROV_NAME[b.dataset.prov]}.`); }
}));

// Models for a provider, cached per session. Tool-capable / well-known coding
// models first, since the chat needs tool calling to build in Studio.
const modelCache = { nvidia: null, openrouter: null };
const GOOD_MODEL = /kimi-k|glm-5|qwen3|deepseek-(v[34]|chat)|nemotron-3|nemotron-ultra|mistral-large|gpt-oss|gpt-4|gpt-5|claude|gemini|llama-3\.[13]-(70b|405b)/i;
function rankModels(list) {
  const score = (m) => (m.tools === true ? 0 : m.tools === false ? 3 : 1) + (GOOD_MODEL.test(m.id) ? 0 : 1);
  return list.slice().sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id));
}
async function loadModels(p) {
  p = p || prov();
  if (modelCache[p]) return modelCache[p];
  modelCache[p] = rankModels(await invoke("ai_models", { provider: p }));
  return modelCache[p];
}
$("btn-load-models").onclick = async () => {
  const btn = $("btn-load-models");
  btn.disabled = true; btn.textContent = "Loading…";
  try {
    const list = await loadModels();
    $("model-list").innerHTML = list.map((m) => `<option value="${esc(m.id)}"${m.tools ? ' label="supports tools"' : ""}></option>`).join("");
    const withTools = list.filter((m) => m.tools).length;
    toast(`${list.length} models${withTools ? ` (${withTools} with tools)` : ""} — click the Model box to pick one.`, 3500);
  } catch (e) { toast(errText(e), 5000); }
  finally { btn.disabled = false; btn.textContent = "Load models"; }
};

// ── model switcher (chat header) ────────────────────────────────────────────
let popProv = "nvidia";
function renderPop() {
  document.querySelectorAll("#pop-seg button").forEach((b) => b.classList.toggle("on", b.dataset.prov === popProv));
  const q = $("pop-search").value.trim();
  const list = modelCache[popProv];
  const cur = popProv === prov() ? curModel() : "";
  const box = $("pop-list");
  const ql = q.toLowerCase();
  const shown = (list || []).filter((m) => !ql || m.id.toLowerCase().includes(ql)).slice(0, 200);
  // Offer the typed text as a custom model ID only when it isn't already a listed
  // model - first when nothing matches (so Enter uses it), last otherwise (so Enter
  // picks the real match instead of a half-typed "claude").
  const custom = q && !(list || []).some((m) => m.id === q)
    ? `<button class="pop-item" data-id="${esc(q)}"><span class="id custom">Use “${esc(q)}” as the model ID</span></button>` : "";
  let html = "";
  if (!keySet(popProv)) {
    html = custom + `<div class="pop-note">Add your ${PROV_NAME[popProv]} key in Settings to list its models. You can still type a model ID above.</div>`;
  } else if (!list) {
    html = custom + '<div class="pop-note">Loading models…</div>';
  } else if (!shown.length) {
    html = custom + '<div class="pop-note">No listed models match.</div>';
  } else {
    html = shown.map((m) => `<button class="pop-item${m.id === cur ? " cur" : ""}" data-id="${esc(m.id)}"><span class="id">${esc(m.id)}</span>${
      m.reasoning ? '<span class="tl think">thinks</span>' : ""}${
      m.tools === true ? '<span class="tl">tools</span>' : m.tools === false ? '<span class="tl no">no tools</span>' : ""}</button>`).join("") + (q.includes("/") ? custom : "");
  }
  box.innerHTML = html;
  $("pop-foot").innerHTML = popProv === "openrouter"
    ? 'Models tagged <span class="tl">tools</span> can build in Studio. <code>:free</code> models cost nothing.'
    : "Pick a model that supports tool calling to build in Studio.";
}
async function openPop() {
  popProv = prov();
  $("pop-search").value = "";
  $("model-pop").hidden = false;
  renderPop();
  $("pop-search").focus();
  if (keySet(popProv) && !modelCache[popProv]) {
    try { await loadModels(popProv); } catch (e) { toast(errText(e), 4500); }
    if (!$("model-pop").hidden) renderPop();
  }
}
const closePop = () => { $("model-pop").hidden = true; };
$("chat-model").onclick = (e) => { e.stopPropagation(); $("model-pop").hidden ? openPop() : closePop(); };
$("model-pop").addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", closePop);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });
$("pop-search").addEventListener("input", renderPop);
$("pop-search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { const first = $("pop-list").querySelector(".pop-item"); if (first) first.click(); }
});
document.querySelectorAll("#pop-seg button").forEach((b) => b.addEventListener("click", async () => {
  popProv = b.dataset.prov;
  renderPop();
  if (keySet(popProv) && !modelCache[popProv]) {
    try { await loadModels(popProv); } catch (e) { toast(errText(e), 4500); }
    renderPop();
  }
}));
$("pop-list").addEventListener("click", async (e) => {
  const it = e.target.closest(".pop-item");
  if (!it) return;
  closePop();
  await saveSettings({ provider: popProv, [popProv + "_model"]: it.dataset.id }, `Now using ${PROV_NAME[popProv]} · ${it.dataset.id}`);
});
$("set-ws-on").addEventListener("change", async () => {
  if ($("set-ws-on").checked && !S.settings.workspace_dir) {
    const dir = await invoke("pick_workspace");
    if (!dir) { $("set-ws-on").checked = false; return; }
    await saveSettings({ workspace_dir: dir, workspace_enabled: true }, "Workspace access on for " + dir);
    return;
  }
  saveSettings({ workspace_enabled: $("set-ws-on").checked }, $("set-ws-on").checked ? "Workspace access on." : "Workspace access off.");
});
$("btn-pick-ws").onclick = async () => {
  const dir = await invoke("pick_workspace");
  if (dir) saveSettings({ workspace_dir: dir }, "Workspace folder set.");
};
$("btn-open-ws").onclick = () => invoke("open_folder", { which: "workspace" }).catch((e) => toast(errText(e)));
$("set-lang").addEventListener("change", () => saveSettings({ reply_language: $("set-lang").value }, "Reply language saved."));
$("set-autostart").addEventListener("change", () => saveSettings({ auto_start_bridge: $("set-autostart").checked }));
$("set-tray").addEventListener("change", () => saveSettings({ close_to_tray: $("set-tray").checked }));
// ── sound effects (opt-in, kept on this PC) ────────────────────────────────
// Synthesised with Web Audio, so there's nothing to download. [hz, start s, length s]
const SFX = {
  ready: [[660, 0, 0.12], [880, 0.1, 0.18]],
  done: [[784, 0, 0.12], [988, 0.1, 0.12], [1175, 0.2, 0.24]],
  error: [[330, 0, 0.16], [247, 0.14, 0.26]],
  ask: [[1047, 0, 0.16], [1047, 0.22, 0.16]],
};
const sound = { on: false, vol: 40 };
try { Object.assign(sound, JSON.parse(localStorage.getItem("vs-sounds") || "{}")); } catch {}
let sfxCtx = null;
function sfx(name, force) {
  if ((!sound.on && !force) || !SFX[name]) return;
  try {
    sfxCtx = sfxCtx || new AudioContext();
    if (sfxCtx.state === "suspended") sfxCtx.resume().catch(() => {});
    const t0 = sfxCtx.currentTime + 0.01, peak = 0.25 * (sound.vol / 100);
    for (const [hz, at, len] of SFX[name]) {
      const o = sfxCtx.createOscillator(), g = sfxCtx.createGain();
      o.type = "sine";
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      o.connect(g).connect(sfxCtx.destination);
      o.start(t0 + at);
      o.stop(t0 + at + len + 0.02);
    }
  } catch {}
}
function renderSound() {
  $("set-sounds").checked = sound.on;
  $("set-sounds-vol").value = sound.vol;
  $("sounds-vol-row").hidden = !sound.on;
}
const saveSound = () => { try { localStorage.setItem("vs-sounds", JSON.stringify(sound)); } catch {} renderSound(); };
$("set-sounds").addEventListener("change", () => { sound.on = $("set-sounds").checked; saveSound(); if (sound.on) sfx("ready"); });
$("set-sounds-vol").addEventListener("change", () => { sound.vol = Number($("set-sounds-vol").value); saveSound(); sfx("done", true); });
$("btn-sound-test").onclick = () => sfx("done", true);
renderSound();

// Theme: "or" is the partner look; anything else is VoidScript's own.
function applyTheme(t) {
  const or = t === "or";
  if (or) document.documentElement.setAttribute("data-theme", "or");
  else document.documentElement.removeAttribute("data-theme");
  document.querySelectorAll("#theme-seg button").forEach((b) => b.classList.toggle("on", (b.dataset.theme === "or") === or));
}
document.querySelectorAll("#theme-seg button").forEach((b) => b.addEventListener("click", () => {
  applyTheme(b.dataset.theme);
  saveSettings({ theme: b.dataset.theme });
}));
$("btn-quit").onclick = () => invoke("quit_app");

// ── disclaimer ──────────────────────────────────────────────────────────────
$("disc-ok").addEventListener("change", () => { $("btn-disc-accept").disabled = !$("disc-ok").checked; });
$("btn-disc-accept").onclick = async () => {
  const first = !S.settings.accepted_disclaimer;
  $("disclaimer").hidden = true;
  if (first) {
    await saveSettings({ accepted_disclaimer: true });
    if (S.settings.auto_start_bridge !== false) invoke("start_bridge").catch((e) => toast(errText(e), 4000));
  }
};
$("btn-show-disclaimer").onclick = () => { $("disc-ok").checked = true; $("btn-disc-accept").disabled = false; $("disclaimer").hidden = false; };

// ── approvals (workspace writes / deletes / commands) ──────────────────────
let sessionAllow = {};
function approve(kind, label, title, detail, opts = {}) {
  if (sessionAllow[kind] && !opts.once) return Promise.resolve(true);
  sfx("ask");
  return new Promise((resolve) => {
    $("appr-kind").textContent = label;
    $("appr-title").textContent = title;
    $("appr-detail").textContent = detail;
    $("appr-session").checked = false;
    $("appr-session").parentElement.hidden = !!opts.once;
    $("appr-session-lbl").textContent = `Allow "${label.toLowerCase()}" for the rest of this chat`;
    $("approve").hidden = false;
    const done = (ok) => {
      $("approve").hidden = true;
      if (ok && $("appr-session").checked) sessionAllow[kind] = true;
      $("btn-appr-ok").onclick = $("btn-appr-deny").onclick = null;
      resolve(ok);
    };
    $("btn-appr-ok").onclick = () => done(true);
    $("btn-appr-deny").onclick = () => done(false);
  });
}

// ── chat agent ──────────────────────────────────────────────────────────────
const chat = { messages: [], busy: false, stop: false };
const body = $("chat-body");

// Project memory: the same ServerStorage.VoidScript.Memory ModuleScript the browser
// extension keeps, so every AI that works on a game shares one memory of it.
const MEM_PATH = "game.ServerStorage.VoidScript.Memory";
const MEM_SKELETON = "return [==[\n# Project memory\n## Overview\n## Where things live\n## Conventions\n## Key systems\n## Decisions & gotchas\n## User preferences\n## Open questions / TODO\n]==]";
async function readMemory() {
  if (!S.state.connected || !(S.state.tools || []).some((t) => t.name === "execute_luau")) return null;
  const code = 'local f = game:GetService("ServerStorage"):FindFirstChild("VoidScript")\n' +
    'local m = f and f:FindFirstChild("Memory")\nreturn m and m:IsA("ModuleScript") and m.Source or ""';
  try {
    const r = await invoke("bridge_request", { payload: { type: "call_tool", name: "execute_luau", arguments: { code, datamodel_type: "Edit" } }, timeoutMs: 15000 });
    return r && r.type === "tool_result" && r.ok ? String(r.text || "").trim() : null;
  } catch { return null; }
}
function memoryLines() {
  const out = ["", `PROJECT MEMORY: ${MEM_PATH} is a ModuleScript that holds the long-term memory for this game. Every AI and every chat shares it, so keep it accurate for whoever reads it next. Keep only lasting, verified facts: what the game is, where key scripts and instances live, conventions, how the main systems work, decisions and gotchas, and the user's preferences. It is not a task log - no step-by-step history, no whole scripts.`];
  const m = chat.memory;
  if (m && !/^(nil|""|)$/.test(m)) out.push("Current memory:", cap(m, 6000));
  else if (m === "" || m === '""') out.push(`There is no memory yet. Once you have learned something lasting about this game, create it with multi_edit (file_path "${MEM_PATH}", className "ModuleScript", one edit with old_string "") using this skeleton:`, MEM_SKELETON);
  else out.push(`Read it with script_read before you change the game.`);
  out.push("When you learn something lasting, update the right section with multi_edit (script_read it first so old_string matches exactly). Fix facts that turned out wrong, and never save a guess as a fact.");
  return out;
}

function systemPrompt(opts = {}) {
  const s = S.settings || {};
  const st = S.state || {};
  const ws = filesOn();
  const lines = [
    "You are VoidScript, an AI teammate that builds Roblox games directly inside the user's open Roblox Studio using the tools provided. The tools run live against Studio through the local VoidScript bridge.",
    "",
    "How to work:",
    "- Act with tools instead of describing steps. The user cannot paste code into Studio for you - only your tool calls change the game.",
    "- Look before you change things: read scripts and inspect instances when the task depends on what already exists.",
    "- Surgical edits, never rewrites: change only the lines that must change (multi_edit with the smallest unique old_string, copied exactly from script_read). To create a script, set className and use an empty old_string.",
    "- execute_luau runs synchronously (about a 20 second budget): use `return` for output (print is not captured), give WaitForChild a timeout, and never block. Put runtime game logic in real Scripts/LocalScripts.",
    "- Write clean, idiomatic Luau that matches the project's style. No filler comments, no step-by-step narration in code.",
    "- Never delete broadly (a whole folder, model or service) unless the user asked for exactly that - confirm the scope first.",
    "- When a tool returns an error, read it and fix your call once. Do not repeat the same failing call.",
    "- Keep replies short and natural, like a friendly Roblox dev. When you finish, say what you built in a sentence or two.",
  ];
  if (!st.connected) lines.push("", "The Roblox Studio bridge is offline right now, so the Studio tools are unavailable. If the user asks you to build, tell them to start the bridge on the VoidScript Home tab and open Roblox Studio.");
  if (ws && access() === "full") lines.push("", `You also have workspace_* tools with access to the user's whole PC. Use absolute Windows paths (C:\\...) or paths relative to ${s.workspace_dir || "the user's home folder"}. Deletes need the user's approval. Don't touch system folders or files the user didn't mention.`);
  else if (ws) lines.push("", `You also have workspace_* tools for files in the user's chosen folder (${s.workspace_dir}). Paths are relative to that folder and you cannot leave it.${access() === "ask" ? " The user approves every write, delete and command, so say briefly why before each one." : " Deletes need the user's approval."}`);
  if (mode.memory && st.connected) lines.push(...memoryLines());
  lines.push("", effort().line);
  if (opts.plan) lines.push("", "PLAN MODE: you only have read-only tools right now. Look at what exists if it helps, then reply with a short numbered plan (what you will add or change, and where) and stop. Do not write code yet - the user will approve the plan first.");
  else if (access() === "ask") lines.push("", "ACCESS: the user approves every change in Studio and every file write and command. If they deny one, don't retry it - ask what they want.");
  if (s.reply_language) lines.push("", `Write every message to the user in ${s.reply_language}. Keep tool names, arguments, file paths and code exactly as required (do not translate them).`);
  return lines.join("\n");
}

// Some providers (NVIDIA's NIM backends) reject JSON-Schema metadata keywords.
function stripMeta(v) {
  if (Array.isArray(v)) return v.map(stripMeta);
  if (!v || typeof v !== "object") return v;
  const o = {};
  for (const [k, x] of Object.entries(v)) if (k !== "$schema" && k !== "$id") o[k] = stripMeta(x);
  return o;
}
function normSchema(sc) {
  if (!sc || typeof sc !== "object") return { type: "object", properties: {} };
  const out = stripMeta(sc);
  if (out.type !== "object") out.type = "object";
  if (!out.properties || typeof out.properties !== "object") out.properties = {};
  return out;
}
const WS_TOOLS = [
  ["list", "workspace_list", "List files and folders at a path inside the workspace folder ('.' for the root).", { path: { type: "string", description: "Folder path relative to the workspace, e.g. '.' or 'src'" } }, []],
  ["read", "workspace_read", "Read a text file inside the workspace folder.", { path: { type: "string" } }, ["path"]],
  ["write", "workspace_write", "Create or overwrite a text file inside the workspace folder. The user must approve it.", { path: { type: "string" }, content: { type: "string", description: "The complete new file content" } }, ["path", "content"]],
  ["delete", "workspace_delete", "Delete a file or folder inside the workspace folder. The user must approve it.", { path: { type: "string" } }, ["path"]],
  ["run", "workspace_run", "Run a Windows command (cmd.exe) with the workspace folder as the working directory, e.g. 'rojo build -o game.rbxl'. The user must approve it. 2 minute limit.", { command: { type: "string" } }, ["command"]],
];
function toolDefs(readOnly) {
  const defs = [], map = {};
  for (const t of (S.state.tools || [])) {
    if (readOnly && !isReadOnly(t.name)) continue;
    let safe = String(t.name).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "tool";
    while (map[safe]) safe = safe.slice(0, 58) + "_" + Object.keys(map).length;
    map[safe] = { kind: "bridge", name: t.name };
    defs.push({ type: "function", function: { name: safe, description: String(t.description || t.name).slice(0, 1024), parameters: normSchema(t.inputSchema) } });
  }
  if (filesOn()) {
    for (const [op, name, desc, props, required] of WS_TOOLS) {
      if (readOnly && !isReadOnly(name)) continue;
      map[name] = { kind: "ws", op, name };
      defs.push({ type: "function", function: { name, description: desc, parameters: { type: "object", properties: props, required } } });
    }
  }
  return { defs, map };
}

function md(s) {
  return String(s).split("```").map((part, i) => {
    if (i % 2) {
      const nl = part.indexOf("\n");
      const code = nl >= 0 && /^[\w+#.-]*$/.test(part.slice(0, nl).trim()) ? part.slice(nl + 1) : part;
      return `<pre><code>${esc(code.replace(/\n$/, ""))}</code></pre>`;
    }
    return esc(part).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  }).join("");
}
function addMsg(role, html) {
  $("chat-empty").hidden = true;
  const m = document.createElement("div");
  m.className = "msg " + role;
  m.innerHTML = `<div class="bubble">${html}</div>`;
  body.appendChild(m);
  body.scrollTop = body.scrollHeight;
  return m;
}
function typing(label) {
  const m = document.createElement("div");
  m.className = "msg ai";
  m.innerHTML = `<div class="bubble typing"><i></i><i></i><i></i>${label ? `<span>${esc(label)}</span>` : ""}</div>`;
  body.appendChild(m);
  body.scrollTop = body.scrollHeight;
  return m;
}
function toolCard(name, args) {
  $("chat-empty").hidden = true;
  const el = document.createElement("div");
  el.className = "msg ai";
  el.innerHTML = `<div class="tool"><div class="tool-h"><span class="spin"></span><span class="nm">${esc(name)}</span><span class="st run">running</span></div>
    <div class="tool-b"><pre>${esc(JSON.stringify(args, null, 2))}</pre><pre class="out"></pre></div></div>`;
  el.querySelector(".tool-h").onclick = () => el.querySelector(".tool").classList.toggle("open");
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
  return {
    set(state, label, out) {
      const sp = el.querySelector(".spin");
      if (sp) sp.remove();
      const st = el.querySelector(".st");
      st.className = "st " + state; st.textContent = label;
      if (out != null) el.querySelector(".out").textContent = cap(String(out), 6000);
    },
  };
}

async function runCall(call, map) {
  const fn = call.function || {};
  const entry = map[fn.name];
  let args = {};
  try { args = fn.arguments ? (typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments) : {}; }
  catch { return "ERROR: the arguments were not valid JSON. Call the tool again with valid JSON arguments."; }
  const card = toolCard(entry ? entry.name : fn.name, args);
  if (!entry) { card.set("err", "unknown tool"); return `ERROR: there is no tool named '${fn.name}'.`; }
  try {
    if (entry.kind === "bridge") {
      if (access() === "ask" && !isReadOnly(entry.name) &&
          !(await approve("studio", "Studio change", `Allow ${entry.name}?`, JSON.stringify(args, null, 2).slice(0, 4000)))) {
        card.set("deny", "denied"); return "The user denied this change. Don't retry it - ask what they want instead.";
      }
      if (!isReadOnly(entry.name)) chat.changed = true;
      const r = await untilStopped(invoke("bridge_request", { payload: { type: "call_tool", name: entry.name, arguments: args }, timeoutMs: 180000 }));
      if (r === STOPPED) { card.set("deny", "stopped"); return "Stopped by the user."; }
      if (r && r.type === "tool_result" && r.ok) {
        let t = r.text || "(done - no output)";
        if (r.images && r.images.length) t += `\n[${r.images.length} image(s) returned - not visible to this model]`;
        card.set("ok", "done", t);
        return cap(t);
      }
      const err = (r && (r.error || r.kind)) || "the tool failed";
      card.set("err", "error", err);
      return cap("ERROR: " + err);
    }
    const path = String(args.path || ".");
    let out;
    if (entry.op === "list") {
      const items = await invoke("ws_list", { path });
      out = items.map((x) => (x.dir ? "[dir]  " : "       ") + x.name + (x.dir ? "" : `  (${x.size} bytes)`)).join("\n") || "(empty folder)";
    } else if (entry.op === "read") {
      out = await invoke("ws_read", { path });
    } else if (entry.op === "write") {
      const content = String(args.content == null ? "" : args.content);
      const preview = content.length > 1600 ? content.slice(0, 1600) + "\n…" : content;
      if (access() === "ask" && !(await approve("write", "Write a file", "Allow writing this file?", `${path}\n${"─".repeat(40)}\n${preview}`))) {
        card.set("deny", "denied"); return "The user denied this write. Don't retry it - ask what they want instead.";
      }
      out = await invoke("ws_write", { path, content });
    } else if (entry.op === "delete") {
      if (!(await approve("delete", "Delete", "Allow deleting this?", path))) {
        card.set("deny", "denied"); return "The user denied this delete. Don't retry it.";
      }
      out = await invoke("ws_delete", { path });
    } else if (entry.op === "run") {
      const command = String(args.command || "");
      if (access() === "ask" && !(await approve("run", "Run a command", "Allow running this command?", `${command}\n\nin ${S.settings.workspace_dir || "your home folder"}`))) {
        card.set("deny", "denied"); return "The user denied this command. Don't retry it - ask what they want instead.";
      }
      out = await invoke("ws_run", { command });
    }
    card.set("ok", "done", out);
    return cap(String(out));
  } catch (e) {
    card.set("err", "error", errText(e));
    return cap("ERROR: " + errText(e));
  }
}

// ── live reply (streamed from the backend as "ai-delta" events) ─────────────
let live = null;
function liveStart(label) { live = { el: typing(label), text: "", thought: "" }; return live.el; }
listen("ai-delta", (e) => {
  if (!live) return;
  const d = e.payload || {};
  live.text += d.content || "";
  live.thought += d.reasoning || "";
  const tag = live.text.match(/<think(?:ing)?>([\s\S]*?)(?:<\/think(?:ing)?>|$)/i);
  const shown = live.text.replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi, "").trim();
  const thought = live.thought || (tag ? tag[1] : "");
  if (!shown && !thought) return;
  live.el.innerHTML = `<div class="bubble live">${!shown ? `<div class="live-th">${esc(thought.slice(-700))}</div>` : md(shown)}</div>`;
  body.scrollTop = body.scrollHeight;
});

// ── model calls: thinking + recovery ────────────────────────────────────────
// Chat modes, kept per PC: effort, access level and three toggles.
const MODE_DEFAULTS = { effort: "balanced", think: false, selfcheck: false, plan: false, memory: true };
const mode = Object.assign({}, MODE_DEFAULTS);
try { Object.assign(mode, JSON.parse(localStorage.getItem("vs-mode") || "{}")); } catch {}
const EFFORT = {
  fast: { steps: 12, tokens: 4096, reason: "low", line: "Effort: fast. Do the smallest thing that works and skip extra checks." },
  balanced: { steps: 30, tokens: 6144, reason: "medium", line: "Effort: balanced. Plan briefly in your head, build, then do one quick check that it worked." },
  deep: { steps: 50, tokens: 8192, reason: "high", line: "Effort: deep. Read the related scripts and instances first, build carefully, then verify (console output, a quick play test where it helps) before you finish." },
};
const effort = () => EFFORT[mode.effort] || EFFORT.balanced;
const access = () => (S.settings && S.settings.access) || "sandbox";
const filesOn = () => access() === "full" || !!(S.settings.workspace_enabled && S.settings.workspace_dir);
function saveMode() { try { localStorage.setItem("vs-mode", JSON.stringify(mode)); } catch {} renderMode(); }
function renderMode() {
  $("seg-effort").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === mode.effort));
  $("seg-access").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === access()));
  $("btn-think").classList.toggle("on", !!mode.think);
  $("btn-selfcheck").classList.toggle("on", !!mode.selfcheck);
  $("btn-plan").classList.toggle("on", !!mode.plan);
  $("btn-memory").classList.toggle("on", !!mode.memory);
}
$("seg-effort").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (b) { mode.effort = b.dataset.v; saveMode(); } });
$("seg-access").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-v]");
  if (!b || b.dataset.v === access()) return;
  const v = b.dataset.v;
  if (v === "full" && !(await approve("full", "Full PC access", "Let the AI use your whole PC?",
    "It can read and write any file and run commands anywhere, without asking.\nDeleting still asks you first, and drives, your user folder and Windows are always protected.\n\nOnly use this with a model you trust. Switch back to Sandbox any time.", { once: true }))) return;
  await saveSettings({ access: v }, { ask: "Ask: you approve every change in Studio and every file write.", sandbox: "Sandbox: Studio plus your workspace folder.", full: "Full PC access on." }[v]);
  renderMode();
});
for (const [id, key, on, off] of [
  ["btn-think", "think", "Thinking on: reasoning models think before answering.", "Thinking off."],
  ["btn-selfcheck", "selfcheck", "Self-check on: the AI reviews and fixes its work before finishing.", "Self-check off."],
  ["btn-plan", "plan", "Plan first on: you get a plan to approve before anything changes.", "Plan first off."],
  ["btn-memory", "memory", "Project memory on: the AI remembers this game between chats.", "Project memory off."],
]) $(id).onclick = () => { mode[key] = !mode[key]; saveMode(); toast(mode[key] ? on : off); };
renderMode();

// Studio tools that only look. Anything else changes the place.
const READ_ONLY = /^(script_read|script_search|script_grep|search_game_tree|inspect_instance|get_[a-z_]+|list_[a-z_]+|search_asset|screen_capture|wait_job_finished|skill|http_get|workspace_list|workspace_read)$/;
const isReadOnly = (name) => READ_ONLY.test(String(name));

// Each API spells "think first" differently; models that don't reason ignore it.
function thinkParams(p) {
  return p === "openrouter"
    ? { reasoning: { effort: effort().reason } }
    : { chat_template_kwargs: { thinking: true, enable_thinking: true } };
}

async function pickAvailable(p, current) {
  let list = [];
  try { list = await loadModels(p); } catch { return null; }
  const ids = new Set(list.map((m) => m.id));
  const prefs = p === "nvidia" ? NV_FALLBACK : [DEFAULTS.openrouter];
  const hit = prefs.find((id) => id !== current && ids.has(id));
  if (hit) return hit;
  const tooled = list.find((m) => m.id !== current && m.tools !== false && GOOD_MODEL.test(m.id));
  return tooled ? tooled.id : null;
}

// One chat-completions call that recovers from the usual provider hiccups: a
// retired model (switch to a listed one), a model without tool calling (retry as
// plain chat), or an API that rejects the thinking switch (retry without it).
async function callModel(req, opts = {}) {
  const p = prov();
  let model = curModel(p);
  let useTools = !!req.tools, useThink = !!opts.think;
  for (let attempt = 0; attempt < 4; attempt++) {
    const body = Object.assign({}, req, { model }, useThink ? thinkParams(p) : {});
    if (!useTools) { delete body.tools; delete body.tool_choice; }
    try {
      const res = await untilStopped(invoke("ai_chat", { body }));
      if (res === STOPPED) throw new Error("cancelled");
      return { res, model, toolsDropped: !!req.tools && !useTools };
    } catch (e) {
      const msg = errText(e);
      if (chat.stop || msg === "cancelled") throw e;
      if (useThink && /chat_template_kwargs|reasoning|thinking|extra (fields|inputs)|not permitted|unrecognized/i.test(msg)) { useThink = false; continue; }
      if (useTools && /API 4(00|22)/.test(msg) && /tool|function/i.test(msg)) { useTools = false; continue; }
      if (/API 404|not found|does not exist|no such model|unknown model|is not available/i.test(msg)) {
        const next = await pickAvailable(p, model);
        if (next) {
          if (!opts.quiet) toast(`${model} isn't available on ${PROV_NAME[p]} anymore. Switched to ${next}.`, 5000);
          model = next;
          await saveSettings({ [p + "_model"]: next });
          continue;
        }
      }
      throw e;
    }
  }
  throw new Error(`${PROV_NAME[p]} kept failing. Try another model from the model menu.`);
}

// Reasoning arrives as a separate field (OpenRouter `reasoning`, NVIDIA/DeepSeek
// `reasoning_content`) or inline as <think>…</think>. Split it from the answer so
// it can be shown folded and is never sent back to the model.
function splitThinking(m) {
  let content = Array.isArray(m.content) ? m.content.map((x) => x.text || "").join("") : String(m.content || "");
  let thought = m.reasoning || m.reasoning_content || "";
  if (!thought && Array.isArray(m.reasoning_details)) thought = m.reasoning_details.map((d) => d.text || d.summary || "").join("\n");
  const tag = /<think(?:ing)?>([\s\S]*?)(?:<\/think(?:ing)?>|$)/i;
  const hit = content.match(tag);
  if (hit) { thought = (thought ? thought + "\n" : "") + hit[1]; content = content.replace(tag, ""); }
  else {
    const end = content.search(/<\/think(?:ing)?>/i);
    if (end >= 0) { thought = (thought ? thought + "\n" : "") + content.slice(0, end); content = content.slice(end).replace(/<\/think(?:ing)?>/i, ""); }
  }
  return { content: content.trim(), thought: String(thought).trim() };
}
function thoughtCard(text, secs) {
  $("chat-empty").hidden = true;
  const el = document.createElement("div");
  el.className = "msg ai";
  el.innerHTML = `<div class="thought"><button class="th-h"><svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>
    <span>Thought for ${secs < 1 ? "a moment" : secs + "s"}</span><svg class="cv" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></button><div class="th-b"></div></div>`;
  el.querySelector(".th-b").textContent = text;
  el.querySelector(".th-h").onclick = () => el.querySelector(".thought").classList.toggle("open");
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
}

// Race a slow call against Stop: the call may still finish in Studio, but the
// chat stops waiting for it straight away.
const STOPPED = Symbol("stopped");
function untilStopped(promise) {
  let timer;
  const stop = new Promise((res) => { timer = setInterval(() => { if (chat.stop) res(STOPPED); }, 100); });
  return Promise.race([promise, stop]).finally(() => clearInterval(timer));
}

function setBusy(b) {
  chat.busy = b;
  $("btn-send").hidden = b;
  $("btn-stop-chat").hidden = !b;
  $("chat-input").disabled = false;
}

async function sendChat(text, opts = {}) {
  if (chat.busy) return;
  const planning = mode.plan && !opts.build;
  if (mode.memory && chat.memory == null) chat.memory = await readMemory();
  // Reference files ride along with THIS message (and so stay in the history).
  const refs = attachments.splice(0);
  renderAttachments();
  const full = refs.length
    ? text + "\n\n---\nReference files the user attached (use them as context):\n\n" +
      refs.map((a) => `### ${a.name}\n\`\`\`\n${a.content}\n\`\`\``).join("\n\n")
    : text;
  chat.messages.push({ role: "user", content: full });
  const um = addMsg("user", esc(text));
  if (refs.length) {
    const r = document.createElement("div");
    r.className = "refs";
    r.innerHTML = refs.map((a) => `<span>📎 ${esc(a.name)}</span>`).join("");
    um.appendChild(r);
  }
  chat.stop = false;
  setBusy(true);
  const { defs, map } = toolDefs(planning);
  const ef = effort();
  chat.changed = false;
  let reviewed = false, lastAi = null;
  try {
    let step = 0;
    let warnedNoTools = false;
    for (; step < ef.steps && !chat.stop; step++) {
      const t = liveStart(mode.think ? "Thinking" : planning ? "Planning" : reviewed ? "Checking" : "");
      const t0 = Date.now();
      let r;
      try {
        const req = { messages: [{ role: "system", content: systemPrompt({ plan: planning }) }].concat(chat.messages), temperature: mode.think ? 0.6 : 0.2, max_tokens: mode.think ? Math.max(12000, ef.tokens) : ef.tokens };
        if (defs.length) { req.tools = defs; req.tool_choice = "auto"; }
        r = await callModel(req, { think: mode.think });
      } finally { t.remove(); live = null; }
      const m = r.res && r.res.choices && r.res.choices[0] && r.res.choices[0].message;
      if (!m) throw new Error("The model returned an empty response. Try again, or pick another model.");
      if (r.toolsDropped && !warnedNoTools) {
        warnedNoTools = true;
        addMsg("note", esc(`${r.model} can't use tools, so it can only chat here. Pick a model tagged "tools" in the model menu to build in Studio.`));
      }
      const { content, thought } = splitThinking(m);
      if (thought) thoughtCard(thought, Math.round((Date.now() - t0) / 1000));
      // Normalise tool calls: some providers omit ids or send arguments as objects,
      // and the follow-up request is rejected unless both are well-formed.
      const calls = (Array.isArray(m.tool_calls) ? m.tool_calls : []).filter((c) => c && c.function && c.function.name).map((c, i) => ({
        id: c.id || `call_${Date.now().toString(36)}_${i}`, type: "function",
        function: { name: c.function.name, arguments: typeof c.function.arguments === "string" ? c.function.arguments : JSON.stringify(c.function.arguments || {}) },
      }));
      const entry = { role: "assistant", content };
      if (calls.length) entry.tool_calls = calls;
      chat.messages.push(entry);
      if (content) lastAi = addMsg("ai", md(content));
      if (!calls.length) {
        if (!content && !thought) addMsg("note", esc("The model sent an empty reply. Try asking again, or switch models."));
        // Self-check: one review pass after a turn that changed something.
        if (mode.selfcheck && chat.changed && !reviewed && !planning && !chat.stop) {
          reviewed = true;
          chat.messages.push({ role: "user", content: "Self-check: review what you just changed. Re-read the scripts and instances you touched, look for bugs, typos, missing references and anything that would break in play, fix what you find, then sum up in one or two sentences." });
          continue;
        }
        break;
      }
      for (const c of calls) {
        const out = chat.stop ? "Stopped by the user." : await runCall(c, map);
        chat.messages.push({ role: "tool", tool_call_id: c.id, content: out });
      }
    }
    if (step >= ef.steps) addMsg("ai", esc(`Paused after ${ef.steps} steps. Say "continue" to keep going.`));
    else if (!chat.stop) sfx("done");
    if (planning && lastAi && !chat.stop) {
      const bar = document.createElement("div");
      bar.className = "plan-actions";
      bar.innerHTML = '<button class="btn primary sm">Build it</button><span class="muted">or reply to change the plan</span>';
      bar.querySelector("button").onclick = () => { bar.remove(); sendChat("The plan looks good. Build it.", { build: true }); };
      lastAi.appendChild(bar);
    }
    if (chat.stop) addMsg("ai", esc("Stopped."));
  } catch (e) {
    if (chat.stop) addMsg("ai", esc("Stopped."));
    else { addMsg("err", esc(errText(e))); sfx("error"); }
  } finally {
    setBusy(false);
    $("chat-input").focus();
  }
}

const input = $("chat-input");
function grow() { input.style.height = "auto"; input.style.height = Math.min(180, input.scrollHeight) + "px"; }
input.addEventListener("input", grow);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("btn-send").click(); }
});
$("btn-send").onclick = () => {
  const v = input.value.trim();
  if ((!v && !attachments.length) || chat.busy) return;
  if (!keySet()) {
    toast(`Add your ${PROV_NAME[prov()]} API key in Settings first.`, 3500);
    go("settings"); $("set-key").focus();
    return; // keep what they typed
  }
  input.value = ""; grow();
  sendChat(v || "Take a look at the attached files.");
};

// ── reference files ─────────────────────────────────────────────────────────
let attachments = [];
const refBytes = () => attachments.reduce((n, a) => n + a.content.length, 0);
const fmtSize = (n) => (n < 1024 ? n + " B" : Math.round(n / 1024) + " KB");
function renderAttachments() {
  const row = $("attach-row");
  row.hidden = !attachments.length;
  row.innerHTML = attachments.map((a, i) => `<span class="att" title="${esc(a.path)}"><span class="an">📎 ${esc(a.name)}</span><span class="as">${fmtSize(a.size)}</span><button data-i="${i}" title="Remove">×</button></span>`).join("");
}
$("attach-row").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]");
  if (b) { attachments.splice(Number(b.dataset.i), 1); renderAttachments(); }
});
function addRefs(files) {
  const skipped = [];
  for (const f of files || []) {
    if (f.error) { skipped.push(`${f.name} (${f.error})`); continue; }
    if (attachments.some((a) => a.path === f.path)) continue;
    if (refBytes() + f.content.length > REF_TOTAL_CAP) { skipped.push(`${f.name} (over the ${REF_TOTAL_CAP / 1024} KB per-message limit)`); continue; }
    attachments.push({ name: f.name, path: f.path, size: f.size, content: f.content });
  }
  renderAttachments();
  if (skipped.length) toast("Skipped: " + skipped.join(" · "), 6500);
  else if ((files || []).length) $("chat-input").focus();
}
$("btn-attach").onclick = async () => {
  try { addRefs(await invoke("pick_reference_files")); } catch (e) { toast(errText(e)); }
};
// Drag & drop from Explorer: Tauri hands us real file paths, the backend reads them.
if (appWin.onDragDropEvent) {
  appWin.onDragDropEvent(async (e) => {
    const p = e.payload || {};
    if (p.type === "enter" || p.type === "over") { $("drop-hint").hidden = false; return; }
    $("drop-hint").hidden = true;
    if (p.type === "drop" && p.paths && p.paths.length) {
      go("chat");
      try { addRefs(await invoke("read_reference_files", { paths: p.paths })); } catch (err) { toast(errText(err)); }
    }
  });
}
$("btn-stop-chat").onclick = () => { chat.stop = true; invoke("ai_cancel").catch(() => {}); };
$("btn-new-chat").onclick = () => {
  if (chat.busy) { toast("Stop the current reply first."); return; }
  chat.messages = []; chat.memory = null; sessionAllow = {}; attachments = []; renderAttachments();
  body.querySelectorAll(".msg").forEach((m) => m.remove());
  $("chat-empty").hidden = false;
};
document.querySelectorAll(".sugg").forEach((b) => b.addEventListener("click", () => { input.value = b.textContent; $("btn-send").click(); }));

// ── boot ────────────────────────────────────────────────────────────────────
(async () => {
  const snap = await invoke("get_snapshot");
  S.state = snap.state; S.settings = snap.settings; S.version = snap.version;
  $("tb-ver").textContent = "v" + snap.version;
  $("about-ver").textContent = "v" + snap.version;
  renderSettings(); render(); loadMcp();
  snap.log.forEach(addLog);
  if (!snap.log.length) $("home-log").innerHTML = '<div class="ln">Nothing yet.</div>';
  await listen("bridge-state", (e) => { S.state = e.payload; render(); watchState(S.state); });
  await listen("bridge-log", (e) => addLog(e.payload));
  // start.bat's own auto-update already swapped the files in: reopen on the new app.
  await listen("bridge-updated", () => {
    $("updating").hidden = false;
    $("updating-line").textContent = "Update installed. Reopening VoidScript…";
    invoke("relaunch").catch(() => { $("updating").hidden = true; $("update-banner").hidden = false; });
  });
  if (!S.settings.accepted_disclaimer) $("disclaimer").hidden = false;
  checkUpdate();
  setInterval(checkUpdate, 3 * 60 * 60 * 1000); // and every few hours while it stays open
})().catch((e) => toast("Startup error: " + errText(e), 8000));
