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
const DEFAULTS = { nvidia: "meta/llama-3.3-70b-instruct", openrouter: "openai/gpt-4o-mini" };
const PROV_NAME = { nvidia: "NVIDIA", openrouter: "OpenRouter" };
const PROV_KEY_URL = { nvidia: "https://build.nvidia.com/", openrouter: "https://openrouter.ai/keys" };
const TOOL_RESULT_CAP = 12000;
const REF_TOTAL_CAP = 400 * 1024;
const MAX_STEPS = 30;

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
  setCard("card-ws", { cls: wsOn ? "acc" : "", big: wsOn ? "On" : "Off", small: wsOn ? set.workspace_dir : "The AI can't touch your files." });

  const running = st.process === "running" || st.process === "starting" || st.process === "updating";
  const tog = $("btn-bridge-toggle");
  tog.textContent = running ? "Stop bridge" : "Start bridge";
  tog.classList.toggle("primary", !running);
  tog.classList.toggle("danger", running);
  tog.disabled = st.process === "missing" || (st.connected && !running);
  $("btn-bridge-restart").disabled = st.process === "missing";

  $("chat-prov").textContent = PROV_NAME[prov()];
  $("chat-model-name").textContent = curModel();
  $("chat-ws").textContent = wsOn ? "workspace on" : "workspace off";
  $("chat-ws").classList.toggle("on", !!wsOn);
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
let mcpInstalled = [];

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
      <button class="btn sm ${have.has(p.id) ? "" : "primary"}" data-mcp="${esc(p.id)}" data-act="${have.has(p.id) ? "remove" : "add"}">${have.has(p.id) ? "Remove" : "Add"}</button>
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
  applyMcp(() => invoke("mcp_add", { id: p.id, command: p.command, args: p.args }), `Added ${p.name}.`);
});
$("btn-mcp-add").onclick = () => {
  const id = $("mcp-id").value.trim(), command = $("mcp-cmd").value.trim();
  if (!id || !command) { toast("Give the server a name and a command."); return; }
  applyMcp(() => invoke("mcp_add", { id, command, args: splitArgs($("mcp-args").value) }), `Added ${id}.`)
    .then(() => { ["mcp-id", "mcp-cmd", "mcp-args"].forEach((k) => { $(k).value = ""; }); });
};

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
    : `Free API access to Llama, DeepSeek, Qwen, Kimi and more. Get a key at <button class="link" data-url="${PROV_KEY_URL.nvidia}">build.nvidia.com</button>.`;
  $("key-status").textContent = s[p + "_key_set"] ? `Key saved (${s[p + "_key_hint"] || "hidden"}).` : "No key saved yet.";
  $("set-model").value = s[p + "_model"] || "";
  $("set-model").placeholder = DEFAULTS[p];
  $("model-hint").textContent = p === "openrouter"
    ? "Load models to see which support tools (needed to build in Studio)."
    : "Pick a model that supports tool calling — e.g. Llama 3.3 70B, Kimi K2, Qwen3 Coder, DeepSeek V3.";
  $("set-ws-on").checked = !!s.workspace_enabled;
  $("set-ws-dir").value = s.workspace_dir || "";
  $("set-lang").value = s.reply_language || "";
  $("set-autostart").checked = s.auto_start_bridge !== false;
  $("set-tray").checked = s.close_to_tray !== false;
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
$("btn-clear-key").onclick = () => { modelCache[prov()] = null; saveSettings({ ["clear_" + prov() + "_key"]: true }, "API key removed."); };
$("set-model").addEventListener("change", () => saveSettings({ [prov() + "_model"]: $("set-model").value.trim() }, "Model saved."));
document.querySelectorAll("#prov-seg button").forEach((b) => b.addEventListener("click", () => {
  if (b.dataset.prov !== prov()) { $("model-list").innerHTML = ""; saveSettings({ provider: b.dataset.prov }, `Using ${PROV_NAME[b.dataset.prov]}.`); }
}));

// Models for a provider, cached per session. Tool-capable / well-known coding
// models first, since the chat needs tool calling to build in Studio.
const modelCache = { nvidia: null, openrouter: null };
const GOOD_MODEL = /llama-3\.[13]-(70b|405b)|kimi-k2|qwen3|qwen-?2\.5-coder|deepseek-(v3|chat)|nemotron|mistral-large|gpt-oss|gpt-4|gpt-5|claude|gemini/i;
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
function approve(kind, label, title, detail) {
  if (sessionAllow[kind]) return Promise.resolve(true);
  return new Promise((resolve) => {
    $("appr-kind").textContent = label;
    $("appr-title").textContent = title;
    $("appr-detail").textContent = detail;
    $("appr-session").checked = false;
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

function systemPrompt() {
  const s = S.settings || {};
  const st = S.state || {};
  const ws = s.workspace_enabled && s.workspace_dir;
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
  if (ws) lines.push("", `You also have workspace_* tools for files in the user's chosen folder (${s.workspace_dir}). Paths are relative to that folder and you cannot leave it. The user approves every write, delete and command, so say briefly why before each one.`);
  if (s.reply_language) lines.push("", `Write every message to the user in ${s.reply_language}. Keep tool names, arguments, file paths and code exactly as required (do not translate them).`);
  return lines.join("\n");
}

function normSchema(sc) {
  if (!sc || typeof sc !== "object") return { type: "object", properties: {} };
  const out = Object.assign({}, sc);
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
function toolDefs() {
  const defs = [], map = {};
  for (const t of (S.state.tools || [])) {
    let safe = String(t.name).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "tool";
    while (map[safe]) safe = safe.slice(0, 58) + "_" + Object.keys(map).length;
    map[safe] = { kind: "bridge", name: t.name };
    defs.push({ type: "function", function: { name: safe, description: String(t.description || t.name).slice(0, 1024), parameters: normSchema(t.inputSchema) } });
  }
  if (S.settings.workspace_enabled && S.settings.workspace_dir) {
    for (const [op, name, desc, props, required] of WS_TOOLS) {
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
function typing() {
  const m = document.createElement("div");
  m.className = "msg ai";
  m.innerHTML = '<div class="bubble typing"><i></i><i></i><i></i></div>';
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
      const r = await invoke("bridge_request", { payload: { type: "call_tool", name: entry.name, arguments: args }, timeoutMs: 180000 });
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
      if (!(await approve("write", "Write a file", "Allow writing this file?", `${path}\n${"─".repeat(40)}\n${preview}`))) {
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
      if (!(await approve("run", "Run a command", "Allow running this command?", `${command}\n\nin ${S.settings.workspace_dir}`))) {
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

function setBusy(b) {
  chat.busy = b;
  $("btn-send").hidden = b;
  $("btn-stop-chat").hidden = !b;
  $("chat-input").disabled = false;
}

async function sendChat(text) {
  if (chat.busy) return;
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
  const { defs, map } = toolDefs();
  const model = curModel();
  try {
    let step = 0;
    for (; step < MAX_STEPS && !chat.stop; step++) {
      const t = typing();
      let res;
      try {
        const req = { model, messages: [{ role: "system", content: systemPrompt() }].concat(chat.messages), temperature: 0.2, top_p: 0.9, max_tokens: 4096 };
        if (defs.length) { req.tools = defs; req.tool_choice = "auto"; }
        res = await invoke("ai_chat", { body: req });
      } finally { t.remove(); }
      const m = res && res.choices && res.choices[0] && res.choices[0].message;
      if (!m) throw new Error("The model returned an empty response.");
      const calls = Array.isArray(m.tool_calls) ? m.tool_calls.filter((c) => c && c.function) : [];
      const entry = { role: "assistant", content: m.content || "" };
      if (calls.length) entry.tool_calls = calls;
      chat.messages.push(entry);
      if (m.content && m.content.trim()) addMsg("ai", md(m.content.trim()));
      if (!calls.length) break;
      for (const c of calls) {
        const out = chat.stop ? "Stopped by the user." : await runCall(c, map);
        chat.messages.push({ role: "tool", tool_call_id: c.id, content: out });
      }
    }
    if (step >= MAX_STEPS) addMsg("ai", esc(`Paused after ${MAX_STEPS} steps. Say "continue" to keep going.`));
    if (chat.stop) addMsg("ai", esc("Stopped."));
  } catch (e) {
    addMsg("err", esc(errText(e)));
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
$("btn-stop-chat").onclick = () => { chat.stop = true; toast("Stopping after the current step…"); };
$("btn-new-chat").onclick = () => {
  if (chat.busy) { toast("Stop the current reply first."); return; }
  chat.messages = []; sessionAllow = {}; attachments = []; renderAttachments();
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
  await listen("bridge-state", (e) => { S.state = e.payload; render(); });
  await listen("bridge-log", (e) => addLog(e.payload));
  await listen("bridge-updated", () => { $("update-banner").hidden = false; });
  if (!S.settings.accepted_disclaimer) $("disclaimer").hidden = false;
})().catch((e) => toast("Startup error: " + errText(e), 8000));
