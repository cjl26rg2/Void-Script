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
// Small line icons used across the app (24px grid, stroked with currentColor).
const svgI = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICONS = {
  copy: svgI('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  play: svgI('<path d="M7 4.5v15l12-7.5z"/>'),
  retry: svgI('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4.5V11h-6.5"/>'),
  edit: svgI('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  trash: svgI('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  pin: svgI('<path d="M9 4h6l-1 6 4 4H6l4-4zM12 14v6"/>'),
  star: svgI('<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>'),
  agent: svgI('<rect x="5" y="7" width="14" height="12" rx="3"/><path d="M12 3.5V7M9.5 12v1.5M14.5 12v1.5"/>'),
  x: svgI('<path d="M6 6l12 12M18 6 6 18"/>'),
  chat: svgI('<path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-4.6A8.5 8.5 0 1 1 20.5 12z"/>'),
  bolt: svgI('<path d="M13.5 2 4.5 13.5H11L10 22l9-11.5h-6.5z"/>'),
  go: svgI('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  gear: svgI('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
  code: svgI('<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>'),
  sun: svgI('<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>'),
  speak: svgI('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  mem: svgI('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'),
  fork: svgI('<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-11.5 7"/>'),
  find: svgI('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  camera: svgI('<path d="M4 8a2 2 0 0 1 2-2h1.5l1.5-2h6l1.5 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/>'),
  script: svgI('<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5M9.5 13l-2 2 2 2M14.5 13l2 2-2 2"/>'),
  mountain: svgI('<path d="M2.5 20 9 8.5l4 6.5 2.7-4L21.5 20z"/>'),
};
const DEFAULTS = { nvidia: "deepseek-ai/deepseek-v4.1-flash", openrouter: "openai/gpt-4o-mini", google: "gemini-2.5-flash" };
// NVIDIA retires models without notice (Llama 3.3 70B went in 2026). If the chosen
// one is gone, the chat switches to the first of these that is still listed.
// Fast models first: the big ones (Kimi, full GLM) queue for a long time on the free tier.
const NV_FALLBACK = ["deepseek-ai/deepseek-v4.1-flash", "z-ai/glm-5.3-flash", "nvidia/nemotron-3.5-lightning-30b-a3b",
  "moonshotai/kimi-k2.6", "z-ai/glm-5.3", "nvidia/nemotron-3-super-120b-a12b", "openai/gpt-oss-20b"];
const PROV_NAME = { nvidia: "NVIDIA", openrouter: "OpenRouter", google: "Gemini" };
const PROV_KEY_URL = { nvidia: "https://build.nvidia.com/", openrouter: "https://openrouter.ai/keys", google: "https://aistudio.google.com/apikey" };
// Every other provider (the backend has the same list with each one's URL).
// [id, name, kind, where to get a key, default model ("" = pick one), note]
// kind: free = a free tier, credits = free credits to start, local = on this PC, other.
const MORE_PROVIDERS = [
  ["groq", "Groq", "free", "https://console.groq.com/keys", "llama-3.3-70b-versatile", "A very fast free tier: Llama, Qwen, GPT-OSS, Kimi and more."],
  ["cerebras", "Cerebras", "free", "https://cloud.cerebras.ai/", "llama-3.3-70b", "One of the fastest free tiers there is."],
  ["mistral", "Mistral", "free", "https://console.mistral.ai/", "mistral-small-latest", "Free Experiment plan with every Mistral model."],
  ["sambanova", "SambaNova", "free", "https://cloud.sambanova.ai/", "Meta-Llama-3.3-70B-Instruct", "Fast free tier for big open models."],
  ["github", "GitHub Models", "free", "https://github.com/settings/tokens", "openai/gpt-4.1-mini", "Free with a GitHub token: GPT-4.1, Llama, DeepSeek and more. Type the model ID (e.g. openai/gpt-4.1)."],
  ["huggingface", "Hugging Face", "free", "https://huggingface.co/settings/tokens", "meta-llama/Llama-3.3-70B-Instruct", "Free monthly credits across many providers."],
  ["opencode", "OpenCode Zen", "free", "https://opencode.ai/", "", "Has free models - open the model menu and pick one."],
  ["cohere", "Cohere", "free", "https://dashboard.cohere.com/", "", "Free trial key for Command models."],
  ["together", "Together AI", "free", "https://api.together.ai/", "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", "Models ending in -Free cost nothing."],
  ["chutes", "Chutes", "free", "https://chutes.ai/", "", "Lots of free open models."],
  ["zai", "Z.ai (GLM)", "free", "https://z.ai/", "glm-4.5-flash", "GLM Flash models are free."],
  ["siliconflow", "SiliconFlow", "free", "https://cloud.siliconflow.com/", "", "Several free open models."],
  ["llm7", "LLM7", "free", "https://llm7.io/", "", "Works without a key."],
  ["pollinations", "Pollinations", "free", "https://pollinations.ai/", "openai", "Works without a key."],
  ["qwen", "Alibaba Qwen", "credits", "https://www.alibabacloud.com/en/product/modelstudio", "qwen-plus", "Free quota for new accounts."],
  ["fireworks", "Fireworks", "credits", "https://fireworks.ai/", "accounts/fireworks/models/llama-v3p3-70b-instruct", "Free credits to start."],
  ["nebius", "Nebius AI Studio", "credits", "https://studio.nebius.com/", "meta-llama/Llama-3.3-70B-Instruct", "Free credits to start."],
  ["novita", "Novita", "credits", "https://novita.ai/", "meta-llama/llama-3.3-70b-instruct", "Free credits to start."],
  ["hyperbolic", "Hyperbolic", "credits", "https://app.hyperbolic.xyz/", "meta-llama/Llama-3.3-70B-Instruct", "Free credits to start."],
  ["scaleway", "Scaleway", "credits", "https://console.scaleway.com/", "llama-3.3-70b-instruct", "A free allowance every month."],
  ["kluster", "kluster.ai", "credits", "https://platform.kluster.ai/", "", "Free credits to start."],
  ["upstage", "Upstage", "credits", "https://console.upstage.ai/", "", "Free credits to start."],
  ["aimlapi", "AI/ML API", "credits", "https://aimlapi.com/", "", "Free tier with limits."],
  ["inference", "Inference.net", "credits", "https://inference.net/", "", "Free credits to start."],
  ["venice", "Venice", "credits", "https://venice.ai/", "", "Limited free use."],
  ["deepinfra", "DeepInfra", "credits", "https://deepinfra.com/", "meta-llama/Llama-3.3-70B-Instruct", "Free credits to start."],
  ["moonshot", "Moonshot (Kimi)", "credits", "https://platform.moonshot.ai/", "", "Free credits to start."],
  ["xai", "xAI (Grok)", "credits", "https://console.x.ai/", "", "Credits to start."],
  ["deepseek", "DeepSeek", "other", "https://platform.deepseek.com/", "deepseek-chat", "Not free, but very cheap."],
  ["zhipu", "Zhipu GLM (BigModel)", "free", "https://open.bigmodel.cn/", "glm-4.5-flash", "GLM's own platform. Flash models are free."],
  ["ovhcloud", "OVHcloud AI Endpoints", "free", "https://endpoints.ai.cloud.ovh.net/", "", "Works without a key (rate-limited); add one for more."],
  ["minimax", "MiniMax", "credits", "https://www.minimax.io/platform", "", "Free credits to start. Strong at coding."],
  ["stepfun", "StepFun", "credits", "https://platform.stepfun.com/", "", "Free credits to start."],
  ["nscale", "Nscale", "credits", "https://console.nscale.com/", "", "Free credits to start. Hosted in Europe."],
  ["inception", "Inception (Mercury)", "credits", "https://platform.inceptionlabs.ai/", "mercury-coder", "Diffusion models - extremely fast replies."],
  ["requesty", "Requesty", "credits", "https://app.requesty.ai/", "", "One key for hundreds of models, with fallbacks."],
  ["vercel", "Vercel AI Gateway", "credits", "https://vercel.com/ai-gateway", "", "One key for most models, with free monthly credit."],
  ["baseten", "Baseten", "credits", "https://app.baseten.co/", "", "Free credits to start."],
  ["openai", "OpenAI", "other", "https://platform.openai.com/api-keys", "gpt-4.1-mini", "Paid, but the mini models are cheap."],
  ["anthropic", "Anthropic (Claude)", "other", "https://console.anthropic.com/", "", "Paid. Pick or type a Claude model ID."],
  ["perplexity", "Perplexity", "other", "https://www.perplexity.ai/account/api", "sonar", "Paid. Answers with live web search."],
  ["featherless", "Featherless", "other", "https://featherless.ai/", "", "A flat monthly price for thousands of open models."],
  ["ollama", "Ollama (on this PC)", "local", "https://ollama.com/download", "", "Runs models on your own PC - no key, no limits. Start Ollama first."],
  ["llamacpp", "llama.cpp (on this PC)", "local", "https://github.com/ggml-org/llama.cpp", "", "llama.cpp's server on port 8080 - no key, no limits."],
  ["jan", "Jan (on this PC)", "local", "https://jan.ai/", "", "Jan's local server on port 1337 - no key, no limits."],
  ["lmstudio", "LM Studio (on this PC)", "local", "https://lmstudio.ai/", "", "Runs models on your own PC. Start LM Studio's local server first."],
  ["custom", "Custom", "other", "", "", "Any OpenAI-compatible API - set its base URL below."],
];
// No key needed (custom may or may not want one).
const KEYLESS = new Set(["llm7", "pollinations", "ollama", "lmstudio", "llamacpp", "jan", "ovhcloud", "custom"]);
for (const [id, name, , url] of MORE_PROVIDERS) { PROV_NAME[id] = name; PROV_KEY_URL[id] = url; }
const PROV_KIND = { free: "Free", credits: "Free credits", local: "On this PC", other: "Other" };
function provOptions() {
  const groups = { free: ["nvidia", "google", "openrouter"], credits: [], local: [], other: [] };
  for (const [id, , kind] of MORE_PROVIDERS) groups[kind].push(id);
  return Object.entries(groups).map(([k, ids]) => `<optgroup label="${PROV_KIND[k]}">${ids.map((id) => `<option value="${id}">${esc(PROV_NAME[id])}</option>`).join("")}</optgroup>`).join("");
}
const TOOL_RESULT_CAP = 12000;
const REF_TOTAL_CAP = 400 * 1024;

const LANGS = [
  ["", "English"], ["Spanish", "Español"], ["Brazilian Portuguese", "Português (BR)"], ["French", "Français"],
  ["German", "Deutsch"], ["Italian", "Italiano"], ["Russian", "Русский"], ["Turkish", "Türkçe"],
  ["Polish", "Polski"], ["Indonesian", "Bahasa Indonesia"], ["Vietnamese", "Tiếng Việt"], ["Thai", "ไทย"],
  ["Japanese", "日本語"], ["Korean", "한국어"], ["Simplified Chinese", "中文（简体）"],
];

let S = { state: {}, settings: {}, version: "" };
for (const [id, , , , model] of MORE_PROVIDERS) DEFAULTS[id] = model;
const prov = () => (PROV_NAME[S.settings.provider] ? S.settings.provider : "nvidia");
const curModel = (p) => { p = p || prov(); return S.settings[p + "_model"] || DEFAULTS[p]; };
const keySet = (p) => { p = p || prov(); return KEYLESS.has(p) ? (p !== "custom" || !!S.settings.custom_base) : !!S.settings[p + "_key_set"]; };

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
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

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
  if (view === "models") mgView();
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
  { id: "godot", name: "Godot", desc: "Open the Godot editor, run your Godot project and read its debug output - prototype in Godot next to Studio.", command: "npx", args: ["-y", "@coding-solo/godot-mcp"],
    needs: "Needs Node.js and Godot 4 installed.", url: "https://github.com/Coding-Solo/godot-mcp",
    env: { key: "GODOT_PATH", label: "Path to the Godot program (blank = find it)", placeholder: "Blank = find Godot by itself", optional: true, plain: true } },
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
        <input class="input mono" type="${p.env.plain ? "text" : "password"}" id="mcp-env-val" placeholder="${esc(p.env.placeholder)}" aria-label="${esc(p.env.label)}" autocomplete="off" spellcheck="false" />
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
    if (!v && !p.env.optional) { toast(`Paste your ${p.env.label} first.`); return; }
    if (v) env = { [p.env.key]: v };
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

// ── generators: one live run shared by models and the UI builder ────────────
// While a generator is working, streamed text goes to it instead of the chat.
const gen = { busy: false, onDelta() {} };
// On NVIDIA the big chat models (Kimi, full GLM, Nemotron Super) queue for minutes
// on the free tier, so the generators borrow a fast model unless the user opts out.
// They write plain JSON, which these do well.
const FAST_NV = ["deepseek-ai/deepseek-v4.1-flash", "z-ai/glm-5.3-flash", "nvidia/nemotron-3.5-lightning-30b-a3b"];
const genUseChat = () => { try { return localStorage.getItem("vs-gen-chatmodel") === "1"; } catch { return false; } };
async function genModel() {
  if (prov() !== "nvidia" || genUseChat()) return null;
  const cur = curModel("nvidia");
  if (FAST_NV.includes(cur) || /flash|lightning|mini|nano|small|-(7|8|9|12|20)b\b/i.test(cur)) return null;
  try {
    const ids = new Set((await loadModels("nvidia")).map((m) => m.id));
    return FAST_NV.find((id) => ids.has(id)) || null;
  } catch { return null; }
}
for (const id of ["mg-chatmodel", "ub-chatmodel"]) {
  $(id).checked = genUseChat();
  $(id).onchange = (e) => {
    try { localStorage.setItem("vs-gen-chatmodel", e.target.checked ? "1" : "0"); } catch {}
    for (const o of ["mg-chatmodel", "ub-chatmodel"]) $(o).checked = e.target.checked;
  };
}

// Free tiers (NVIDIA especially) can queue a request for minutes before the first
// word, so waiting to START gets far longer than a reply that stops mid-way.
const GEN_FIRST_MS = 240000; // nothing at all yet
const GEN_STALL_MS = 90000;  // it was writing, then went quiet
const fmtLeft = (s) => (s < 60 ? `${Math.ceil(s)}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`);

// What each generator has learned from this user: notes from every revision and
// thumbs-down, and the results they liked. Both go into later prompts.
let learn = { model: { lessons: [], liked: [] }, ui: { lessons: [], liked: [] } };
try { Object.assign(learn, JSON.parse(localStorage.getItem("vs-learn") || "{}")); } catch {}
function saveLearn() { try { localStorage.setItem("vs-learn", JSON.stringify(learn)); } catch {} renderLearn(); }
function addLesson(kind, desc, note) {
  const line = desc ? `${note} (said about "${desc.slice(0, 60)}")` : note;
  const L = learn[kind].lessons;
  learn[kind].lessons = [line].concat(L.filter((x) => x !== line)).slice(0, 12);
  saveLearn();
}
// The liked result closest to this request (shared words), else the newest.
function learnFor(kind, desc) {
  const L = learn[kind], words = new Set(String(desc).toLowerCase().match(/[a-z]{3,}/g) || []);
  let best = L.liked[0], score = 0;
  for (const x of L.liked) {
    const s = (String(x.prompt).toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => words.has(w)).length;
    if (s > score) { score = s; best = x; }
  }
  return { lessons: L.lessons, example: best && best.spec };
}
function renderLearn() {
  for (const [kind, id] of [["model", "mg-learn"], ["ui", "ub-learn"]]) {
    const L = learn[kind], n = L.liked.length, m = L.lessons.length;
    $(id).innerHTML = n || m ? `Learning from ${n} like${n === 1 ? "" : "s"} · ${m} note${m === 1 ? "" : "s"} · <button class="link" data-forget="${kind}">Forget</button>` : "";
  }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-forget]");
  if (!b) return;
  learn[b.dataset.forget] = { lessons: [], liked: [] };
  saveLearn();
  toast("Forgot what it learned.");
});
function rate(kind, spec, prompt, good) {
  const L = learn[kind];
  L.liked = L.liked.filter((x) => x.spec.name !== spec.name);
  if (good) L.liked = [{ spec, prompt, t: Date.now() }].concat(L.liked).slice(0, 5);
  saveLearn();
}

function genStart(job) {
  if (chat.busy || gen.busy) { toast("Something else is generating - wait for it or press Stop first."); return false; }
  if (!keySet()) { toast(`Add your ${PROV_NAME[prov()]} API key in Settings first.`, 3500); go("settings"); return false; }
  gen.busy = true; chat.stop = false;
  Object.assign(job, { done: 0, passesLeft: 0, lag: null, stalled: false, retried: false, note: "", model: undefined });
  job.setBusy(true);
  return true;
}
function genEnd(job) { gen.busy = false; gen.onDelta = () => {}; job.setBusy(false); }

// One AI call for a generator. The reply streams into the live preview, the
// pill shows a progress bar and an ETA, and a reply that is stopped, stalls or
// breaks off still hands back everything it finished (marked .cut).
async function genCall(job, o) {
  const pill = $(job.pill), tEl = pill.querySelector(".gb-t"), bar = pill.querySelector(".gb-bar i");
  if (job.model === undefined) job.model = await genModel(); // once per job, not per pass
  const t0 = Date.now();
  let text = "", thinking = false, firstAt = 0, last = t0, heard = false, drawn = 0, drawAt = 0;
  const count = () => (text.match(/"n"\s*:/g) || []).length;
  gen.onDelta = (c, r) => { last = Date.now(); heard = true; if (r) thinking = true; text += c; };
  job.stalled = false;
  const tick = () => {
    const now = Date.now(), n = count(), done = job.done + n;
    if (n && !firstAt) firstAt = now;
    if (!job.stalled && now - last > (heard ? GEN_STALL_MS : GEN_FIRST_MS)) { job.stalled = true; invoke("ai_cancel").catch(() => {}); }
    const total = Math.max(job.total, Math.ceil(done * 1.08));
    let line;
    const units = (k) => `${k} ${k === 1 ? job.unit.slice(0, -1) : job.unit}`;
    const who = job.model ? job.model.split("/").pop() : PROV_NAME[prov()];
    const spookLabel = (l) => (spooky.on ? l.replace("Designing", "Summoning").replace("Revising", "Cursing").replace("Shaping", "Conjuring").replace("Detailing", "Haunting") : l);
    const what = thinking ? (spooky.on ? "Brewing" : "Thinking") : !heard && now - t0 > 8000 ? `Waiting for ${who}` : spookLabel(o.label);
    if (!n) line = `${what} · ${Math.round((now - t0) / 1000)}s` + (job.done ? ` · ${units(job.done)}` : "");
    else {
      line = `${spookLabel(o.label)} · ${units(done)}`;
      if (n > 2) {
        // Parts still to write at this call's pace, plus the wait before each later
        // pass starts writing (measured on the first one).
        const lag = job.lag != null ? job.lag : (firstAt - t0) / 1000;
        const left = (total - done) / (n / (now - firstAt)) / 1000 + job.passesLeft * lag;
        line += left > 3 ? ` · ~${fmtLeft(left)} left` : " · finishing";
      }
    }
    tEl.textContent = line;
    bar.style.width = (Math.min(done / total, 0.97) * 100).toFixed(1) + "%";
    if (n > drawn && now - drawAt > 900) {
      let sp = null;
      try { sp = o.live(text); } catch {}
      if (sp) { drawn = n; drawAt = now; job.preview(sp); }
    }
  };
  const timer = setInterval(tick, 400);
  tick();
  try {
    // A reference image goes along as a vision attachment.
    const user = o.image ? [{ type: "text", text: o.prompt }, { type: "image_url", image_url: { url: o.image } }] : o.prompt;
    // Output sized to the job (a huge limit makes some providers queue it longer);
    // a reply that still runs out keeps every finished part.
    const { res } = await callModel({ messages: [{ role: "system", content: o.sys }, { role: "user", content: user }], temperature: o.temp, max_tokens: o.maxTokens || 10000 },
      { model: job.model || undefined, noThink: true });
    const m = res && res.choices && res.choices[0] && res.choices[0].message;
    return o.final(splitThinking(m || {}).content || text);
  } catch (e) {
    // Keep a stopped/broken run only if it got far enough to be worth more than
    // what was on screen before.
    let kept = null;
    try { kept = o.live(text); } catch {}
    if (kept && (kept.parts || kept.elements).length >= job.minKeep) {
      kept.cut = true;
      job.note = job.stalled ? "The AI stalled" : chat.stop ? "Stopped" : "The reply broke off";
      return kept;
    }
    // A stall is usually the provider's queue, not the request: try once more.
    if (job.stalled && !chat.stop && !job.retried) {
      job.retried = true;
      clearInterval(timer);
      toast("The AI stalled - trying once more…", 4000);
      return genCall(job, o);
    }
    // The model can't see images: go again without the picture.
    if (o.image && !chat.stop && /image|vision|multimodal|content.*(array|type)|image_url/i.test(errText(e))) {
      clearInterval(timer);
      toast("This model can't see images - generating from your description only. Pick a vision model (e.g. Gemini) to use pictures.", 7000);
      return genCall(job, Object.assign({}, o, { image: null }));
    }
    if (chat.stop && !job.stalled) toast("Stopped.");
    else if (job.stalled) toast(`${PROV_NAME[prov()]} stopped responding twice. Try again in a minute, or pick a faster model in the header.`, 8000);
    else if (!chat.stop) toast(errText(e), 7000);
    if (!chat.stop) sfx("error");
    return null;
  } finally {
    clearInterval(timer);
    if (firstAt && job.lag == null) job.lag = (firstAt - t0) / 1000;
  }
}

// ── models: AI-designed part models with a 3D preview ───────────────────────
const mg = { spec: null, prompt: "", detail: "medium", style: "realistic", image: null, badge: "", revs: 0, busy: false, view: null, rated: 0 };

// Reference picture for a generator: read as a data URL (the app's CSP allows
// data: images), shrunk to 1024px JPEG so it's quick to send.
function refPicker(k, state) {
  const file = $(`${k}-ref-file`), img = $(`${k}-ref-img`), x = $(`btn-${k}-ref-x`);
  const show = () => { img.hidden = x.hidden = !state.image; if (state.image) img.src = state.image; };
  $(`btn-${k}-ref`).onclick = () => file.click();
  x.onclick = () => { state.image = null; show(); };
  file.onchange = () => {
    const f = file.files[0];
    file.value = "";
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k2 = Math.min(1, 1024 / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.width * k2)); c.height = Math.max(1, Math.round(im.height * k2));
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        state.image = c.toDataURL("image/jpeg", 0.85);
        show();
        toast("Picture added - the AI will copy it. Works best with a vision model (Gemini, GPT-4o…).", 5000);
      };
      im.onerror = () => toast("That file isn't a picture I can read.");
      im.src = rd.result;
    };
    rd.readAsDataURL(f);
  };
}
// One-click palettes for Recolour (darkest to lightest is matched automatically).
const PALETTES = [
  ["#7A1F1F", "#C0392B", "#E8A33D", "#F5E6C8"], ["#14324A", "#2E86C1", "#7FB3D5", "#ECF3F9"],
  ["#1E3B20", "#3E7B3A", "#9BC53D", "#F1EBC9"], ["#2B1B3D", "#6C3483", "#D35BA0", "#F9D8E8"],
  ["#1A1A1A", "#4A4A4A", "#9A9A9A", "#F2F2F2"], ["#3B2A1A", "#7B5235", "#C49A6C", "#EFE2CF"],
];
let mgSaved = [];
try { mgSaved = JSON.parse(localStorage.getItem("vs-models") || "[]"); } catch {}
const MG_SYSTEM = "You are a top Roblox builder who designs detailed 3D models out of simple parts. You reply with JSON only.";

function mgView() {
  if (!mg.view && window.VSModelView && window.THREE) {
    mg.view = VSModelView.create($("mg-view"));
    mg.view.onPick = (i) => { if (!mg.busy && mg.spec) mgPick(i); };
  }
  return mg.view;
}
function mgRender() {
  const has = !!mg.spec;
  $("mg-name").textContent = has ? mg.spec.name : "No model yet";
  $("mg-badge").hidden = !mg.badge;
  $("mg-badge").textContent = mg.badge;
  $("mg-empty").hidden = has || mg.busy;
  for (const id of ["btn-mg-txt", "btn-mg-copy", "btn-mg-insert", "btn-mg-save", "btn-mg-reset", "mg-change", "btn-mg-revise", "btn-mg-good", "btn-mg-bad"]) $(id).disabled = !has || mg.busy;
  $("mg-quick").querySelectorAll("button").forEach((b) => { b.disabled = !has || mg.busy; });
  for (const id of ["btn-mg-rbxmx", "btn-mg-png"]) $(id).disabled = !has || mg.busy;
  $("btn-mg-undo").disabled = mg.busy || !(mg.undo && mg.undo.length);
  $("btn-mg-good").classList.toggle("on", mg.rated > 0);
  $("btn-mg-bad").classList.toggle("on", mg.rated < 0);
  $("btn-mg-go").disabled = mg.busy;
  $("btn-mg-stop").hidden = !mg.busy;
  $("mg-busy").hidden = !mg.busy;
  $("btn-mg-revise").textContent = mg.revs ? `Revise · ${mg.revs}` : "Revise";
  if (has) {
    const st = VSModel.stats(mg.spec);
    $("mg-stats").hidden = false;
    $("mg-stats").textContent = `${st.parts} parts · ${st.size.join(" × ")} studs`;
    $("mg-script").textContent = mgLuau();
  } else $("mg-stats").hidden = true;
  $("mg-count").textContent = String(mgSaved.length);
  $("mg-list").innerHTML = mgSaved.length ? mgSaved.map((m, i) => `
    <div class="mg-item" data-i="${i}"><b>${esc(m.spec.name)}</b><span>${m.spec.parts.length} parts · ${esc(ago(m.t))}</span><button class="link" data-del="${i}" title="Delete">×</button></div>`).join("")
    : '<p class="muted small-p">Models you save show up here.</p>';
}
// edit: the same model changed in place (keep the camera where it is).
function mgShow(spec, badge, edit) {
  if (mg.spec && mg.spec !== spec) mg.undo = [mg.spec].concat(mg.undo || []).slice(0, 30);
  mg.spec = spec;
  mg.badge = badge;
  mg.rated = 0;
  mgPick(-1);
  mgRender();
  const v = mgView();
  if (v) v.show(spec, edit ? "edit" : undefined);
}
// Click a part in the preview to edit it.
function mgPick(i) {
  mg.pick = mg.spec && mg.spec.parts[i] ? i : -1;
  const v = mg.view;
  if (v) v.select(mg.pick);
  $("mg-insp").hidden = mg.pick < 0;
  if (mg.pick < 0) return;
  const p = mg.spec.parts[mg.pick];
  $("mg-insp-name").textContent = `${p.n} · ${p.s}`;
  $("mg-insp-color").value = p.c.toLowerCase();
  $("mg-insp-mat").value = p.m;
}
function mgEditPart(change) {
  const i = mg.pick;
  const parts = mg.spec.parts.map((p, k) => (k === i ? Object.assign({}, p, change) : p));
  mgShow({ name: mg.spec.name, parts }, "Edited", true);
  mgPick(i);
}
$("mg-insp-mat").innerHTML = VSModel.MATERIALS.map((m) => `<option>${m}</option>`).join("");
$("mg-insp-color").oninput = (e) => mgEditPart({ c: e.target.value.toUpperCase() });
$("mg-insp-mat").onchange = (e) => mgEditPart({ m: e.target.value });
$("btn-mg-insp-del").onclick = () => {
  if (mg.spec.parts.length < 2) { toast("That's the last part."); return; }
  const i = mg.pick;
  mgShow({ name: mg.spec.name, parts: mg.spec.parts.filter((_, k) => k !== i) }, "Edited", true);
};
$("btn-mg-insp-x").onclick = () => mgPick(-1);
$("btn-mg-undo").onclick = () => {
  if (!mg.undo || !mg.undo.length) return;
  mg.spec = mg.undo.shift();
  mg.badge = "Undone";
  mgPick(-1);
  mgRender();
  if (mg.view) mg.view.show(mg.spec, "edit");
};
$("btn-mg-rbxmx").onclick = async () => {
  const name = mg.spec.name.replace(/[^\w -]/g, "").trim().replace(/\s+/g, "_") + ".rbxmx";
  try { if (await invoke("save_text", { name, content: VSModel.toRbxmx(mg.spec, { welded: $("mg-welded").checked }) })) toast("Saved - drag the file into Studio to add the model.", 4500); }
  catch (e) { toast(errText(e)); }
};
$("btn-mg-png").onclick = async () => {
  const v = mgView();
  if (!v) return;
  const name = mg.spec.name.replace(/[^\w -]/g, "").trim().replace(/\s+/g, "_") + ".png";
  try { if (await invoke("save_text", { name, content: v.snapshot(), base64: true })) toast("Picture saved."); }
  catch (e) { toast(errText(e)); }
};
const mgJob = (total) => ({
  pill: "mg-busy", unit: "parts", minKeep: 8, total,
  setBusy(b) { mg.busy = b; $("mg-busy").classList.remove("live"); mgRender(); },
  preview(sp) { const v = mgView(); if (v) { v.show(sp, true); $("mg-busy").classList.add("live"); } },
});
// After a run: show the result, or put the previous model back in the preview.
function mgFinish(job, spec, badge) {
  if (spec) bumpStat("models");
  if (!spec) { if (mg.spec) { const v = mgView(); if (v) v.show(mg.spec); } return false; }
  VSModel.ground(spec);
  mgShow(spec, job.note ? "Partial" : badge);
  if (job.note) toast(`${job.note} - kept the ${spec.parts.length} parts it finished. Revise to keep going.`, 6000);
  sfx("done");
  return true;
}
const mgLuau = () => VSModel.toLuau(mg.spec, { welded: $("mg-welded").checked });
$("mg-welded").onchange = () => mgRender();
refPicker("mg", mg);
$("mg-style").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-v]");
  if (!b) return;
  mg.style = b.dataset.v;
  $("mg-style").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
});
$("mg-pals").innerHTML = PALETTES.map((p, i) => `<button class="pal" data-pal="${i}" title="Recolour">${p.map((c) => `<i style="background:${c}"></i>`).join("")}</button>`).join("");
$("mg-quick").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || !mg.spec) return;
  if (b.dataset.pal) mgShow(VSModel.recolor(mg.spec, PALETTES[Number(b.dataset.pal)]), "Recoloured", true);
  else if (b.dataset.scale) {
    const k = Number(b.dataset.scale);
    mgShow(VSModel.ground(VSModel.scale(mg.spec, k)), `Resized ${k}×`);
  }
});
$("mg-detail").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-v]");
  if (!b) return;
  mg.detail = b.dataset.v;
  $("mg-detail").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
});
$("mg-ideas").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { $("mg-desc").value = b.textContent; $("mg-desc").focus(); } });
// Big models are built in passes - no AI can write 200 parts in one reply, which
// is what made High fail. The shape comes first, then detail passes add to it.
$("btn-mg-go").onclick = async () => {
  const desc = $("mg-desc").value.trim();
  if (!desc) { toast("Describe the model first."); $("mg-desc").focus(); return; }
  const passes = VSModel.PASSES[mg.detail] || VSModel.PASSES.medium;
  const job = mgJob(passes.reduce((a, [lo, hi]) => a + Math.round((lo + hi) / 2), 0));
  if (!genStart(job)) return;
  const extra = learnFor("model", desc);
  let spec = null;
  try {
    for (let i = 0; i < passes.length; i++) {
      job.passesLeft = passes.length - 1 - i;
      let next;
      if (i === 0) {
        next = await genCall(job, { label: passes.length > 1 ? "Shaping" : "Designing", sys: MG_SYSTEM, temp: 0.4, maxTokens: passes[0][1] * 75 + 1500,
          prompt: VSModel.buildPrompt(desc, mg.detail, Object.assign({ budget: passes[0], firstPass: passes.length > 1, style: mg.style, image: !!mg.image }, extra)),
          image: mg.image,
          live: (t) => VSModel.parse(t, true), final: (t) => VSModel.parse(t) });
      } else {
        // Self-check first: duplicates go now, floating parts get fixed in this pass.
        const check = VSModel.audit(VSModel.ground(spec));
        const before = check.spec;
        next = await genCall(job, { label: `Detailing ${i}/${passes.length - 1}`, sys: MG_SYSTEM, temp: 0.5, maxTokens: passes[i][1] * 75 + 1500,
          prompt: VSModel.detailPrompt(before, desc, passes[i], Object.assign({ issues: check.issues }, extra)),
          live: (t) => { const d = VSModel.parseDelta(t, true); return d.add.length ? VSModel.applyDelta(before, { add: d.add, remove: [] }) : null; },
          final: (t) => VSModel.applyDelta(before, VSModel.parseDelta(t)) });
        // A detail pass that fails still leaves a finished model.
        if (!next) { if (!chat.stop && !job.stalled) toast("A detail pass failed - kept the model from the pass before.", 5000); break; }
      }
      if (!next) break;
      spec = next;
      job.done = spec.parts.length;
      job.preview(spec);
      if (chat.stop || job.stalled) break;
    }
    // Drop exact duplicate parts (they flicker in Studio) - no extra AI pass.
    if (spec) spec = VSModel.audit(VSModel.ground(spec)).spec;
  } finally { genEnd(job); }
  if (mgFinish(job, spec, "Generated")) { mg.prompt = desc; mg.revs = 0; }
};
$("btn-mg-stop").onclick = () => { chat.stop = true; invoke("ai_cancel").catch(() => {}); };
async function mgRevise() {
  const change = $("mg-change").value.trim();
  if (!change || !mg.spec || mg.busy) return;
  const before = mg.spec, job = mgJob(before.parts.length + 15);
  if (!genStart(job)) return;
  job.done = before.parts.length;
  let spec = null;
  try {
    spec = await genCall(job, { label: "Revising", sys: MG_SYSTEM, temp: 0.4,
      prompt: VSModel.revisePrompt(before, change, learnFor("model", mg.prompt)),
      live: (t) => { const d = VSModel.parseDelta(t, true); return d.add.length ? VSModel.applyDelta(before, d) : null; },
      final: (t) => VSModel.applyDelta(before, VSModel.parseDelta(t)) });
  } finally { genEnd(job); }
  addLesson("model", mg.prompt, change); // every change asked for teaches it
  if (mgFinish(job, spec, "Revised")) { mg.revs++; $("mg-change").value = ""; }
}
$("btn-mg-revise").onclick = mgRevise;
$("mg-change").addEventListener("keydown", (e) => { if (e.key === "Enter") mgRevise(); });
$("btn-mg-good").onclick = () => {
  mg.rated = 1; rate("model", mg.spec, mg.prompt, true); mgRender();
  toast("Liked - new models will aim for this level of detail.");
};
$("btn-mg-bad").onclick = () => {
  mg.rated = -1; rate("model", mg.spec, mg.prompt, false); mgRender();
  $("mg-change").placeholder = "What's wrong with it? It fixes it and remembers for next time";
  $("mg-change").focus();
};
document.querySelectorAll(".mg-tabs button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".mg-tabs button").forEach((x) => x.classList.toggle("on", x === b));
  const script = b.dataset.t === "script";
  $("mg-script").hidden = !script;
  $("mg-view").style.visibility = script ? "hidden" : "visible";
}));
$("btn-mg-reset").onclick = () => mg.view && mg.view.reset();
$("btn-mg-copy").onclick = async () => {
  try { await navigator.clipboard.writeText(mgLuau()); toast("Script copied - paste it into Studio's command bar."); } catch { toast("Could not copy."); }
};
$("btn-mg-txt").onclick = async () => {
  const name = mg.spec.name.replace(/[^\w -]/g, "").trim().replace(/\s+/g, "_") + ".txt";
  try { if (await invoke("save_text", { name, content: mgLuau() })) toast("Saved."); }
  catch (e) { toast(errText(e)); }
};
$("btn-mg-insert").onclick = async () => {
  if (!S.state.connected) { toast("Start the bridge and open Roblox Studio first.", 3500); return; }
  const btn = $("btn-mg-insert");
  btn.disabled = true; btn.textContent = "Inserting…";
  try {
    const r = await invoke("bridge_request", { payload: { type: "call_tool", name: "execute_luau", arguments: { code: mgLuau(), datamodel_type: "Edit" } }, timeoutMs: 90000 });
    if (r && r.type === "tool_result" && r.ok) { toast(`${mg.spec.name} is in Studio. Ctrl+Z undoes it.`, 3500); sfx("done"); }
    else { toast("Studio couldn't build it: " + ((r && (r.error || r.text)) || "unknown error"), 6000); sfx("error"); }
  } catch (e) { toast(errText(e), 5000); }
  finally { btn.textContent = "Insert into Studio"; mgRender(); }
};
$("btn-mg-save").onclick = () => {
  mgSaved = [{ spec: mg.spec, prompt: mg.prompt, t: Date.now() }].concat(mgSaved.filter((m) => m.spec.name !== mg.spec.name)).slice(0, 30);
  try { localStorage.setItem("vs-models", JSON.stringify(mgSaved)); } catch { toast("Not enough room to save more models - delete some first."); return; }
  mg.badge = "Saved";
  mgRender();
  toast("Saved.");
};
$("mg-list").addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    mgSaved.splice(Number(del.dataset.del), 1);
    try { localStorage.setItem("vs-models", JSON.stringify(mgSaved)); } catch {}
    mgRender();
    return;
  }
  const it = e.target.closest(".mg-item");
  if (!it) return;
  const m = mgSaved[Number(it.dataset.i)];
  mg.prompt = m.prompt || ""; mg.revs = 0;
  mgShow(m.spec, "Saved");
});
mgRender();

// ── UI builder ──────────────────────────────────────────────────────────────
const ub = { spec: null, prompt: "", badge: "", revs: 0, busy: false, style: "chunky", device: "pc", image: null, rated: 0 };
let ubSaved = [];
try { ubSaved = JSON.parse(localStorage.getItem("vs-uis") || "[]"); } catch {}
const ubDraw = (spec) => VSUI.render($("ub-view"), spec, ub.device);
const ubLuau = () => VSUI.toLuau(ub.spec, { animate: $("ub-anim").checked });
$("ub-anim").onchange = () => ubRender();
// Theme hues for Recolour (the GUI's main colour family moves to this hue).
const HUES = [[217, "#3A86FF"], [0, "#FF4D4D"], [140, "#2ECC71"], [270, "#9B59B6"], [28, "#FF9F43"], [330, "#FF6FB5"], [180, "#1ABC9C"], [220, "#3C4454", 0.18]];
$("ub-hues").innerHTML = HUES.map(([h, c], i) => `<button class="hue" data-hue="${i}" style="background:${c}" title="Recolour"></button>`).join("");
$("ub-quick").addEventListener("click", (e) => {
  const b = e.target.closest("[data-hue]");
  if (!b || !ub.spec) return;
  const [h, , sat] = HUES[Number(b.dataset.hue)];
  ubShow(VSUI.recolor(ub.spec, h, sat), "Recoloured");
});
refPicker("ub", ub);
$("ub-device").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-v]");
  if (!b) return;
  ub.device = b.dataset.v;
  $("ub-device").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  if (ub.spec) ubDraw(ub.spec);
});
$("btn-ub-save").onclick = () => {
  ubSaved = [{ spec: ub.spec, prompt: ub.prompt, t: Date.now() }].concat(ubSaved.filter((m) => m.spec.name !== ub.spec.name)).slice(0, 30);
  try { localStorage.setItem("vs-uis", JSON.stringify(ubSaved)); } catch { toast("Not enough room to save more UIs - delete some first."); return; }
  ub.badge = "Saved";
  ubRender();
  toast("Saved.");
};
$("ub-list").addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    ubSaved.splice(Number(del.dataset.del), 1);
    try { localStorage.setItem("vs-uis", JSON.stringify(ubSaved)); } catch {}
    ubRender();
    return;
  }
  const it = e.target.closest(".mg-item");
  if (!it) return;
  const m = ubSaved[Number(it.dataset.i)];
  ub.prompt = m.prompt || ""; ub.revs = 0;
  ubShow(m.spec, "Saved");
});
$("ub-style").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-v]");
  if (!b) return;
  ub.style = b.dataset.v;
  $("ub-style").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
});
const UB_SYSTEM = "You are a top Roblox UI artist who builds polished game GUIs. You reply with JSON only.";
function ubRender() {
  const has = !!ub.spec;
  $("ub-name").textContent = has ? ub.spec.name : "No UI yet";
  $("ub-badge").hidden = !ub.badge;
  $("ub-badge").textContent = ub.badge;
  $("ub-empty").hidden = has || ub.busy;
  $("ub-busy").hidden = !ub.busy;
  for (const id of ["btn-ub-txt", "btn-ub-copy", "btn-ub-insert", "btn-ub-save", "ub-change", "btn-ub-revise", "btn-ub-good", "btn-ub-bad"]) $(id).disabled = !has || ub.busy;
  $("ub-count").textContent = String(ubSaved.length);
  $("ub-quick").querySelectorAll("button").forEach((b) => { b.disabled = !has || ub.busy; });
  $("ub-list").innerHTML = ubSaved.length ? ubSaved.map((m, i) => `
    <div class="mg-item" data-i="${i}"><b>${esc(m.spec.name)}</b><span>${m.spec.elements.length} elements · ${esc(ago(m.t))}</span><button class="link" data-del="${i}" title="Delete">×</button></div>`).join("")
    : '<p class="muted small-p">UIs you save show up here.</p>';
  $("btn-ub-good").classList.toggle("on", ub.rated > 0);
  $("btn-ub-bad").classList.toggle("on", ub.rated < 0);
  $("btn-ub-go").disabled = ub.busy;
  $("btn-ub-stop").hidden = !ub.busy;
  $("btn-ub-revise").textContent = ub.revs ? `Revise · ${ub.revs}` : "Revise";
  $("ub-stats").hidden = !has;
  if (has) {
    $("ub-stats").textContent = `${ub.spec.elements.length} elements${ub.spec.script.trim() ? " · with LocalScript" : ""}`;
    $("ub-script").textContent = ubLuau();
  }
}
function ubShow(spec, badge) {
  ub.spec = spec; ub.badge = badge; ub.rated = 0;
  ubRender();
  ubDraw(spec);
}
const ubJob = (total) => ({
  pill: "ub-busy", unit: "elements", minKeep: 3, total,
  setBusy(b) { ub.busy = b; $("ub-busy").classList.remove("live"); ubRender(); },
  preview(sp) { ubDraw(sp); $("ub-busy").classList.add("live"); },
});
function ubFinish(job, spec, badge) {
  if (spec) bumpStat("uis");
  if (!spec) { if (ub.spec) ubDraw(ub.spec); else $("ub-view").innerHTML = ""; return false; }
  ubShow(spec, job.note ? "Partial" : badge);
  if (job.note) toast(`${job.note} - kept the ${spec.elements.length} elements it finished. Revise to keep going.`, 6000);
  sfx("done");
  return true;
}
$("ub-ideas").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { $("ub-desc").value = b.textContent; $("ub-desc").focus(); } });
$("btn-ub-go").onclick = async () => {
  const desc = $("ub-desc").value.trim();
  if (!desc) { toast("Describe the UI first."); $("ub-desc").focus(); return; }
  const job = ubJob(35);
  if (!genStart(job)) return;
  let spec = null;
  try {
    spec = await genCall(job, { label: "Designing", sys: UB_SYSTEM, temp: 0.5,
      prompt: VSUI.buildPrompt(desc, ub.style, Object.assign({ image: !!ub.image }, learnFor("ui", desc))),
      image: ub.image,
      live: (t) => VSUI.parse(t, true), final: (t) => VSUI.parse(t) });
  } finally { genEnd(job); }
  if (ubFinish(job, spec, "Generated")) { ub.prompt = desc; ub.revs = 0; }
};
$("btn-ub-stop").onclick = () => { chat.stop = true; invoke("ai_cancel").catch(() => {}); };
async function ubRevise() {
  const change = $("ub-change").value.trim();
  if (!change || !ub.spec || ub.busy) return;
  const job = ubJob(ub.spec.elements.length);
  if (!genStart(job)) return;
  let spec = null;
  try {
    spec = await genCall(job, { label: "Revising", sys: UB_SYSTEM, temp: 0.5,
      prompt: VSUI.revisePrompt(ub.spec, change, learnFor("ui", ub.prompt)),
      live: (t) => VSUI.parse(t, true), final: (t) => VSUI.parse(t) });
  } finally { genEnd(job); }
  addLesson("ui", ub.prompt, change);
  if (ubFinish(job, spec, "Revised")) { ub.revs++; $("ub-change").value = ""; }
}
$("btn-ub-revise").onclick = ubRevise;
$("ub-change").addEventListener("keydown", (e) => { if (e.key === "Enter") ubRevise(); });
$("btn-ub-good").onclick = () => {
  ub.rated = 1; rate("ui", ub.spec, ub.prompt, true); ubRender();
  toast("Liked - new UIs will aim for this level of polish.");
};
$("btn-ub-bad").onclick = () => {
  ub.rated = -1; rate("ui", ub.spec, ub.prompt, false); ubRender();
  $("ub-change").placeholder = "What's wrong with it? It fixes it and remembers for next time";
  $("ub-change").focus();
};
document.querySelectorAll("#ub-tabs button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("#ub-tabs button").forEach((x) => x.classList.toggle("on", x === b));
  $("ub-script").hidden = b.dataset.t !== "script";
}));
$("btn-ub-copy").onclick = async () => {
  try { await navigator.clipboard.writeText(ubLuau()); toast("Script copied - paste it into Studio's command bar."); } catch { toast("Could not copy."); }
};
$("btn-ub-txt").onclick = async () => {
  try { if (await invoke("save_text", { name: ub.spec.name + ".txt", content: ubLuau() })) toast("Saved."); } catch (e) { toast(errText(e)); }
};
$("btn-ub-insert").onclick = () => runLuau(ubLuau(), `${ub.spec.name} is in StarterGui. Press Play to try it.`, $("btn-ub-insert"));
ubRender();
renderLearn();

// Run Luau in Studio (Edit) from a button, with feedback on the button itself.
async function runLuau(code, okMsg, btn) {
  if (!S.state.connected) { toast("Start the bridge and open Roblox Studio first.", 3500); return null; }
  const label = btn && btn.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "Working…"; }
  try {
    const r = await invoke("bridge_request", { payload: { type: "call_tool", name: "execute_luau", arguments: { code, datamodel_type: "Edit" } }, timeoutMs: 90000 });
    if (r && r.type === "tool_result" && r.ok) { if (okMsg) { toast(okMsg, 3500); sfx("done"); } return r.text || ""; }
    toast("Studio said: " + ((r && (r.error || r.text)) || "unknown error"), 6000); sfx("error");
    return null;
  } catch (e) { toast(errText(e), 5000); return null; }
  finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
}

// ── Toolkit: templates, script tools, health check, backups ─────────────────
function kitCards(list) {
  return list.map((t) => `<button class="kit-card" data-id="${t.id}"><span class="ki">${t.icon}</span><b>${esc(t.name)}</b><span>${esc(t.desc)}</span></button>`).join("");
}
$("kit-templates").innerHTML = kitCards(VSKit.TEMPLATES);
$("kit-tools").innerHTML = kitCards(VSKit.TOOLS);
// Templates and tools are build briefs: hand them to the chat agent.
function runBrief(item) {
  if (chat.busy || gen.busy) { toast("The AI is busy - wait for it or press Stop first."); return; }
  if (!keySet()) { toast(`Add your ${PROV_NAME[prov()]} API key in Settings first.`, 3500); go("settings"); return; }
  if (!S.state.connected) toast("Heads up: the bridge is offline, so the AI can't touch Studio yet.", 4000);
  go("chat");
  sendChat(`${item.name}: ${item.brief}`);
}
$("kit-templates").addEventListener("click", (e) => { const b = e.target.closest(".kit-card"); if (b) runBrief(VSKit.TEMPLATES.find((t) => t.id === b.dataset.id)); });
$("kit-tools").addEventListener("click", (e) => { const b = e.target.closest(".kit-card"); if (b) runBrief(VSKit.TOOLS.find((t) => t.id === b.dataset.id)); });

let lastHealth = null;
$("btn-health").onclick = async () => {
  const out = await runLuau(VSKit.HEALTH_LUAU, "", $("btn-health"));
  if (out == null) return;
  try { lastHealth = VSKit.report(out); } catch { toast("Couldn't read the health check result."); return; }
  const h = lastHealth, r = h.raw;
  $("health-out").innerHTML = `
    <div class="hc-top"><span class="hc-grade g-${h.grade}">${h.grade}</span>
      <div><b>${h.score}/100</b><span class="muted">${r.parts.toLocaleString()} parts · ${r.scripts + r.localScripts + r.modules} scripts · ${r.lines.toLocaleString()} lines</span></div></div>
    ${h.issues.length ? `<div class="hc-list">${h.issues.map((i) => `<div class="hc-i s-${i.sev}"><b>${esc(i.title)}</b><span>${esc(i.text)}</span></div>`).join("")}</div>
      <button class="btn sm primary" id="btn-health-fix">Fix with AI</button>` : '<p class="muted small-p">No problems found. Nice.</p>'}`;
  const fix = $("btn-health-fix");
  if (fix) fix.onclick = () => runBrief({ name: "Health check fixes", brief: VSKit.fixPrompt(lastHealth) });
  if (h.issues.some((i) => i.sev === "high")) notify("warn", "Possible backdoor found", "The health check flagged suspicious code. Open Toolkit to review it.", { go: "kit" });
};

async function loadBackups() {
  if (!S.state.connected) { $("kit-backups").innerHTML = '<p class="muted small-p">Start the bridge to see your backups.</p>'; return; }
  try {
    const r = await invoke("bridge_request", { payload: { type: "list_backups" }, timeoutMs: 15000 });
    const list = (r && r.backups) || [];
    $("kit-backups").innerHTML = list.length ? list.slice(0, 12).map((b) => `
      <div class="kit-bk"><b>${esc(b.name)}</b><span>${Math.round(b.size / 1024).toLocaleString()} KB · ${esc(ago(b.mtime * 1000))}</span>
      <button class="btn sm" data-restore="${esc(b.name)}">Restore</button></div>`).join("") : '<p class="muted small-p">No backups yet.</p>';
  } catch (e) { $("kit-backups").innerHTML = `<p class="muted small-p">${esc(errText(e))}</p>`; }
}
$("btn-backup").onclick = async () => {
  try {
    const r = await invoke("bridge_request", { payload: { type: "backup_place" }, timeoutMs: 60000 });
    if (r && r.ok) { toast("Backed up."); loadBackups(); } else toast((r && r.error) || "Backup failed - save the place in Studio first.", 5000);
  } catch (e) { toast(errText(e), 5000); }
};
$("kit-backups").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-restore]");
  if (!b) return;
  if (!(await approve("restore", "Restore backup", "Replace your place file with this backup?", `${b.dataset.restore}\n\nYour current saved file is overwritten. Close and reopen the place in Studio afterwards.`, { once: true }))) return;
  try {
    const r = await invoke("bridge_request", { payload: { type: "restore_backup", name: b.dataset.restore }, timeoutMs: 60000 });
    toast(r && r.ok ? "Restored. Reopen the place in Studio." : (r && r.error) || "Restore failed.", 5000);
  } catch (err) { toast(errText(err), 5000); }
});
// Lighting presets and the terrain generator: deterministic Luau, no AI needed.
$("kit-lighting").innerHTML = VSKit.LIGHTING.map((p) => `<button class="kit-card" data-l="${p.id}"><span class="ki">${p.icon}</span><b>${esc(p.name)}</b><span>apply</span></button>`).join("");
$("kit-lighting").addEventListener("click", (e) => {
  const b = e.target.closest("[data-l]");
  if (b) runLuau(VSKit.lightingLuau(b.dataset.l), `Lighting set: ${VSKit.LIGHTING.find((p) => p.id === b.dataset.l).name}.`, null);
});
let terPreset = "island", terSize = "medium";
$("kit-terrain").innerHTML = VSKit.TERRAIN.map((p) => `<button class="kit-card${p.id === terPreset ? " on" : ""}" data-t="${p.id}"><span class="ki">${p.icon}</span><b>${esc(p.name)}</b><span>preset</span></button>`).join("");
$("kit-terrain").addEventListener("click", (e) => {
  const b = e.target.closest("[data-t]");
  if (!b) return;
  terPreset = b.dataset.t;
  $("kit-terrain").querySelectorAll(".kit-card").forEach((x) => x.classList.toggle("on", x === b));
});
$("ter-size").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-v]");
  if (!b) return;
  terSize = b.dataset.v;
  $("ter-size").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
});
$("btn-ter-dice").onclick = () => { $("ter-seed").value = String(Math.floor(Math.random() * 99999) + 1); };
$("btn-ter-go").onclick = () => runLuau(VSKit.terrainLuau(terPreset, terSize, Number($("ter-seed").value) || 1, $("ter-replace").checked),
  "Terrain generated. Ctrl+Z undoes it.", $("btn-ter-go"));

// Creator Store search + insert, through the Roblox MCP's own tools.
async function callTool(name, args, timeoutMs) {
  if (!S.state.connected) throw new Error("Start the bridge and open Roblox Studio first.");
  const r = await invoke("bridge_request", { payload: { type: "call_tool", name, arguments: args }, timeoutMs: timeoutMs || 60000 });
  if (!r || r.type !== "tool_result" || !r.ok) throw new Error((r && (r.error || r.text)) || "the tool failed");
  return r.text || "";
}
$("btn-as-go").onclick = async () => {
  const q = $("as-q").value.trim();
  if (!q) { $("as-q").focus(); return; }
  const btn = $("btn-as-go");
  btn.disabled = true; btn.textContent = "Searching…";
  try {
    const text = await callTool("search_asset", { query: q, assetType: $("as-type").value, scope: "creator_store", priceFilter: "free", maxResults: 12 });
    const list = VSKit.parseAssets(text);
    $("as-out").innerHTML = list.length ? list.map((a) => `
      <div class="kit-bk"><b>${esc(a.name)}</b><span>${esc([a.type, a.creator].filter(Boolean).join(" · ") || "asset " + a.id)}</span>
      <button class="btn sm" data-ins="${esc(a.id)}" data-name="${esc(a.name)}" data-type="${esc(a.type)}">Insert</button></div>`).join("")
      : `<pre class="kit-out">${esc(text.slice(0, 2000) || "No results.")}</pre>`;
  } catch (e) { $("as-out").innerHTML = `<p class="muted small-p">${esc(errText(e))}</p>`; }
  finally { btn.disabled = false; btn.textContent = "Search"; }
};
$("as-q").addEventListener("keydown", (e) => { if (e.key === "Enter") $("btn-as-go").click(); });
$("as-out").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-ins]");
  if (!b) return;
  b.disabled = true; b.textContent = "Inserting…";
  try {
    const args = { assetId: b.dataset.ins, assetName: b.dataset.name };
    if (b.dataset.type) args.assetType = b.dataset.type;
    await callTool("insert_asset", args, 90000);
    toast(`${b.dataset.name} is in Studio.`); sfx("done");
    b.textContent = "Inserted ✓";
  } catch (err) { toast(errText(err), 5000); b.disabled = false; b.textContent = "Insert"; }
});

// Luau console: run code in Studio and see what it returns.
async function runConsole() {
  const code = $("lc-code").value.trim();
  if (!code) return;
  const out = $("lc-out");
  out.hidden = false; out.className = "kit-out"; out.textContent = "Running…";
  try { out.textContent = (await callTool("execute_luau", { code, datamodel_type: $("lc-dm").value }, 60000)) || "(done - no output; use return to see a value)"; }
  catch (e) { out.classList.add("err"); out.textContent = errText(e); }
}
$("btn-lc-run").onclick = runConsole;
$("lc-code").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runConsole(); } });
$("btn-play").onclick = () => callTool("start_stop_play", { is_start: true }).then(() => toast("Playing in Studio.")).catch((e) => toast(errText(e), 4000));
$("btn-stopplay").onclick = () => callTool("start_stop_play", { is_start: false }).then(() => toast("Stopped.")).catch((e) => toast(errText(e), 4000));

const undoStudio = (btn) => runLuau('game:GetService("ChangeHistoryService"):Undo() return "ok"', "Undid the last Studio change.", btn);
$("btn-undo-studio").onclick = () => undoStudio($("btn-undo-studio"));
// The same Studio controls sit in the chat header.
$("btn-chat-play").onclick = () => $("btn-play").click();
$("btn-chat-stopplay").onclick = () => $("btn-stopplay").click();
$("btn-chat-undo").onclick = () => undoStudio(null);

// Toolkit tabs.
function kitTab(k) {
  $("kit-tabs").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === k));
  document.querySelectorAll("#view-kit .kit-pane").forEach((p) => { p.hidden = p.dataset.k !== k; });
  if (k === "care") loadBackups();
}
$("kit-tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-k]"); if (b) kitTab(b.dataset.k); });

// Script library: ready-made systems, inserted as real scripts without the AI.
$("kit-lib").innerHTML = VSKit.SNIPPETS.map((s) => `<button class="kit-card" data-s="${s.id}"><span class="ki">${s.icon}</span><b>${esc(s.name)}</b><span>${esc(s.desc)}</span></button>`).join("");
function showSnippet(id) {
  const s = VSKit.SNIPPETS.find((x) => x.id === id);
  if (!s) return;
  $("kit-lib").querySelectorAll(".kit-card").forEach((b) => b.classList.toggle("on", b.dataset.s === id));
  $("lib-detail").innerHTML = `
    <div class="lib-head"><span class="ki">${s.icon}</span><div><b>${esc(s.name)}</b><span>${esc(s.kind)} in ${esc(s.where)}</span></div></div>
    <p class="muted small-p">${esc(s.desc[0].toUpperCase() + s.desc.slice(1))}.</p>
    <div class="row"><button class="btn sm primary" id="btn-lib-add">Add to Studio</button><button class="btn sm" id="btn-lib-ai">Customise with AI</button></div>
    ${md("```lua\n" + s.code + "\n```")}`;
  $("btn-lib-add").onclick = async () => {
    const out = await runLuau(VSKit.snippetLuau(s), "", $("btn-lib-add"));
    if (out != null) { toast(out || `${s.name} added.`, 3500); sfx("done"); bumpStat("systems"); }
  };
  $("btn-lib-ai").onclick = () => runBrief({ name: s.name, brief: `Add this ${s.kind} to ${s.where} as "VS_${s.name.replace(/[^A-Za-z0-9]+/g, "")}", adapted to my game (look at what already exists first, and tell me what you changed):\n\n\`\`\`lua\n${s.code}\n\`\`\`` });
}
$("kit-lib").addEventListener("click", (e) => { const b = e.target.closest("[data-s]"); if (b) showSnippet(b.dataset.s); });

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
  $("prov-select").value = p;
  if ($("prov-select").__sync) $("prov-select").__sync();
  $("key-label").textContent = `${PROV_NAME[p]} API key${KEYLESS.has(p) ? " (optional)" : ""}`;
  $("set-key").placeholder = { openrouter: "sk-or-…", google: "AIza…", nvidia: "nvapi-…" }[p] || "Paste your key";
  $("base-field").hidden = p !== "custom";
  if (p === "custom") $("set-base").value = s.custom_base || "";
  const more = MORE_PROVIDERS.find((x) => x[0] === p);
  $("prov-hint").innerHTML = more ? `<b>${PROV_KIND[more[2]]}.</b> ${esc(more[5])}` +
    (more[3] ? ` ${KEYLESS.has(p) ? "More at" : "Get a key at"} <button class="link" data-url="${more[3]}">${esc(more[3].replace(/^https?:\/\//, "").replace(/\/$/, ""))}</button>.` : "") : {
    openrouter: `Hundreds of models (GPT, Claude, Gemini, Llama, Qwen…) with one key. Get one at <button class="link" data-url="${PROV_KEY_URL.openrouter}">openrouter.ai/keys</button> — models ending in <code>:free</code> cost nothing.`,
    google: `Google's Gemini models with a <b>free</b> key - no card needed. Get one in a minute at <button class="link" data-url="${PROV_KEY_URL.google}">aistudio.google.com/apikey</button>.`,
  }[p] || `Free API access to Kimi, GLM, DeepSeek, Nemotron and more. Get a key at <button class="link" data-url="${PROV_KEY_URL.nvidia}">build.nvidia.com</button>.`;
  $("key-status").textContent = s[p + "_key_set"] ? `Key saved (${s[p + "_key_hint"] || "hidden"}).` : "No key saved yet.";
  $("set-model").value = s[p + "_model"] || "";
  $("set-model").placeholder = DEFAULTS[p];
  $("model-hint").textContent = more ? "Load models (or open the model menu in Chat) to pick one. Models that support tool calling can build in Studio." : p === "google"
    ? "Flash models are fast and free-tier friendly; Pro models think harder. Press Test to check your key."
    : p === "openrouter"
    ? "Load models to see which support tools (needed to build in Studio)."
    : "Pick a model that supports tool calling. Flash models (DeepSeek V4.1 Flash, GLM 5.3 Flash) answer fastest; Kimi K2.6 is stronger but slow. Press Test to check your key.";
  $("set-ws-on").checked = !!s.workspace_enabled;
  $("set-ws-dir").value = s.workspace_dir || "";
  $("set-lang").value = s.reply_language || "";
  $("set-autostart").checked = s.auto_start_bridge !== false;
  $("set-tray").checked = s.close_to_tray !== false;
  $("set-discord").checked = s.discord_rpc !== false;
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
$("prov-select").innerHTML = provOptions();
$("prov-select").addEventListener("change", (e) => {
  const v = e.target.value;
  if (v !== prov()) { $("model-list").innerHTML = ""; saveSettings({ provider: v }, `Using ${PROV_NAME[v]}.`); }
});
$("set-base").addEventListener("change", () => { modelCache.custom = null; saveSettings({ custom_base: $("set-base").value.trim() }, "Base URL saved."); });
// The provider picker: a searchable, grouped list drawn over the hidden <select>,
// which keeps the value and fires "change" - so the handlers above don't change.
const PROV_INFO = { nvidia: ["free", "Kimi, GLM, DeepSeek, Nemotron"], google: ["free", "Gemini - fast, sees pictures"], openrouter: ["free", "Hundreds of models, :free ones cost nothing"] };
for (const [id, , kind, , , note] of MORE_PROVIDERS) PROV_INFO[id] = [kind, note];
function provPicker(sel) {
  sel.hidden = true;
  const wrap = document.createElement("div");
  wrap.className = "pp";
  wrap.innerHTML = '<button type="button" class="pp-btn"></button><div class="pp-panel" hidden>' +
    '<input class="input" placeholder="Search providers…" autocomplete="off" spellcheck="false" /><div class="pp-list"></div></div>';
  sel.after(wrap);
  const btn = wrap.querySelector(".pp-btn"), panel = wrap.querySelector(".pp-panel"), q = panel.querySelector("input"), list = panel.querySelector(".pp-list");
  const tag = (id) => { const k = (PROV_INFO[id] || ["other"])[0]; return `<span class="pp-tag ${k}">${PROV_KIND[k]}</span>`; };
  const dot = (id) => `<span class="pp-dot${keySet(id) && !KEYLESS.has(id) ? " key" : ""}" title="${keySet(id) && !KEYLESS.has(id) ? "Key saved" : ""}"></span>`;
  const sync = () => {
    const id = sel.value || "nvidia";
    btn.innerHTML = `${dot(id)}<span class="pp-name">${esc(PROV_NAME[id])}</span>${tag(id)}<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`;
  };
  const draw = () => {
    const f = q.value.trim().toLowerCase();
    let html = "";
    for (const g of sel.querySelectorAll("optgroup")) {
      const items = [...g.children].filter((o) => !f || (PROV_NAME[o.value] + " " + (PROV_INFO[o.value] || [])[1] + " " + g.label + " " + o.value).toLowerCase().includes(f));
      if (!items.length) continue;
      html += `<div class="pp-group">${esc(g.label)}</div>` + items.map((o) => `<button type="button" class="pp-item${o.value === sel.value ? " on" : ""}" data-id="${o.value}">` +
        `${dot(o.value)}<span class="pp-name">${esc(PROV_NAME[o.value])}</span><span class="pp-note">${esc((PROV_INFO[o.value] || [])[1] || "")}</span></button>`).join("");
    }
    list.innerHTML = html || '<div class="pp-empty">No provider matches.</div>';
  };
  const close = () => { panel.hidden = true; };
  btn.onclick = (e) => {
    e.stopPropagation();
    if (!panel.hidden) return close();
    q.value = "";
    draw();
    panel.hidden = false;
    q.focus();
    const on = list.querySelector(".pp-item.on");
    if (on) on.scrollIntoView({ block: "nearest" });
  };
  panel.addEventListener("click", (e) => {
    e.stopPropagation();
    const it = e.target.closest(".pp-item");
    if (!it) return;
    close();
    if (it.dataset.id !== sel.value) { sel.value = it.dataset.id; sel.dispatchEvent(new Event("change")); }
    sync();
  });
  q.addEventListener("input", draw);
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = list.querySelector(".pp-item"); if (first) first.click(); }
    if (e.key === "Escape") { e.stopPropagation(); close(); }
  });
  document.addEventListener("click", close);
  sel.__sync = sync;
  sync();
}
provPicker($("prov-select"));
provPicker($("pop-prov"));


// Models for a provider, cached per session. Tool-capable / well-known coding
// models first, since the chat needs tool calling to build in Studio.
const modelCache = {};
const GOOD_MODEL = /gemini-[\d.]+-(flash|pro)|kimi-k|glm-5|qwen3|deepseek-(v[34]|chat)|nemotron-3|nemotron-ultra|mistral-large|gpt-oss|gpt-4|gpt-5|claude|gemini|llama-3\.[13]-(70b|405b)/i;
function rankModels(list) {
  const score = (m) => (m.tools === true ? 0 : m.tools === false ? 3 : 1) + (GOOD_MODEL.test(m.id) ? 0 : 1);
  return (list || []).slice().sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id));
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

// ── model health: which listed models actually answer ───────────────────────
// Providers list plenty of models that fail for a given key (retired, not on
// the free tier, no access). "Test models" asks each one for a one-word reply
// (with a tool attached, to learn if it can build in Studio) and remembers the
// result for a day. Broken ones are hidden; working ones sort first.
const HEALTH_TTL = 24 * 3600 * 1000;
let health = {};
try { health = JSON.parse(localStorage.getItem("vs-model-health") || "{}"); } catch {}
const saveHealth = () => { try { localStorage.setItem("vs-model-health", JSON.stringify(health)); } catch {} };
function modelHealth(p, id) {
  const h = health[p] && health[p][id];
  return h && Date.now() - h.t < HEALTH_TTL ? h : null;
}
function setHealth(p, id, h) { (health[p] = health[p] || {})[id] = Object.assign({ t: Date.now() }, h); saveHealth(); }
// One model: works? tools? "busy" (rate limited) isn't a verdict - try later.
async function probeModel(p, id) {
  const ask = (tools) => invoke("ai_probe", { provider: p, model: id, tools });
  try { await ask(true); return { ok: true, tools: true }; } catch (e) {
    const msg = errText(e);
    if (/^429|rate.?limit|too many requests/i.test(msg)) return { busy: true, why: "rate limited - try again later" };
    if (/^40[01]|^422/.test(msg) && /tool|function/i.test(msg)) {
      try { await ask(false); return { ok: true, tools: false }; } catch (e2) { return { ok: false, why: errText(e2).slice(0, 140) }; }
    }
    // Some APIs reject the tool shape with a plain 400 - check plain chat before failing it.
    if (/^4\d\d/.test(msg) && !/^40[34]/.test(msg)) {
      try { await ask(false); return { ok: true, tools: false }; } catch {}
    }
    return { ok: false, why: msg.slice(0, 140) };
  }
}
let testing = null; // { p, done, total }
async function testModels(p) {
  if (testing) return;
  const list = modelCache[p] || [];
  if (!list.length) return;
  testing = { p, done: 0, total: list.length, ok: 0 };
  renderPop();
  const queue = list.map((m) => m.id);
  const worker = async () => {
    while (queue.length && testing) {
      const id = queue.shift();
      const r = await probeModel(p, id);
      if (!r.busy) setHealth(p, id, r);
      if (r.ok) testing.ok++;
      testing.done++;
      if (!$("model-pop").hidden) renderPop();
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  const t = testing;
  testing = null;
  if (t) toast(`${t.ok} of ${t.total} ${PROV_NAME[p]} models work with your key.`, 5000);
  if (!$("model-pop").hidden) renderPop();
}
let showBroken = false;

// ── model switcher (chat header) ────────────────────────────────────────────
let popProv = "nvidia";
function renderPop() {
  $("pop-prov").value = popProv;
  if ($("pop-prov").__sync) $("pop-prov").__sync();
  const q = $("pop-search").value.trim();
  const list = modelCache[popProv];
  const cur = popProv === prov() ? curModel() : "";
  const box = $("pop-list");
  const ql = q.toLowerCase();
  const H = (m) => modelHealth(popProv, m.id);
  const broken = (list || []).filter((m) => H(m) && !H(m).ok);
  // Working first, then untested, then (only if asked) broken.
  const rank = (m) => (H(m) ? (H(m).ok ? 0 : 2) : 1);
  const shown = (list || []).filter((m) => (!ql || m.id.toLowerCase().includes(ql)) && (showBroken || ql || !(H(m) && !H(m).ok)))
    .sort((a, b) => rank(a) - rank(b)).slice(0, 200);
  // Offer the typed text as a custom model ID only when it isn't already a listed
  // model - first when nothing matches (so Enter uses it), last otherwise (so Enter
  // picks the real match instead of a half-typed "claude").
  const custom = q && !(list || []).some((m) => m.id === q)
    ? `<button class="pop-item" data-id="${esc(q)}"><span class="id custom">Use “${esc(q)}” as the model ID</span></button>` : "";
  let html = "";
  if (!keySet(popProv)) {
    html = custom + `<div class="pop-note">${popProv === "custom" ? "Set the custom base URL in Settings" : `Add your ${PROV_NAME[popProv]} key in Settings`} to list its models. You can still type a model ID above.</div>`;
  } else if (!list) {
    html = custom + '<div class="pop-note">Loading models…</div>';
  } else if (!shown.length) {
    html = custom + '<div class="pop-note">No listed models match.</div>';
  } else {
    html = shown.map((m) => {
      const h = H(m), tools = h && h.ok ? h.tools : m.tools;
      return `<button class="pop-item${m.id === cur ? " cur" : ""}${h && !h.ok ? " bad" : ""}" data-id="${esc(m.id)}"${h && !h.ok ? ` title="${esc(h.why || "")}"` : ""}><span class="id">${esc(m.id)}</span>${
        h ? (h.ok ? '<span class="tl ok">works</span>' : '<span class="tl bad">broken</span>') : ""}${
        m.reasoning ? '<span class="tl think">thinks</span>' : ""}${
        tools === true ? '<span class="tl">tools</span>' : tools === false ? '<span class="tl no">no tools</span>' : ""}</button>`;
    }).join("") + (q.includes("/") ? custom : "");
  }
  box.innerHTML = html;
  const note = popProv === "google"
    ? "Every Gemini model here can build in Studio. Flash is fastest."
    : popProv === "openrouter"
    ? 'Models tagged <span class="tl">tools</span> can build in Studio. <code>:free</code> models cost nothing.'
    : "Pick a model that supports tool calling to build in Studio.";
  const tested = (list || []).filter((m) => H(m)).length;
  const t = testing && testing.p === popProv ? testing : null;
  $("pop-foot").innerHTML = (list && list.length && keySet(popProv)
    ? `<div class="pop-test">${t ? `<span class="spin"></span> Testing ${t.done}/${t.total} · ${t.ok} work` +
        ` <button class="link" data-pop="stop">Stop</button>`
      : `<button class="btn sm" data-pop="test">${tested ? "Test again" : "Test models"}</button> <span class="muted">${
        tested ? `${tested - broken.length} work, ${broken.length} broken` : "Find out which ones work with your key"}</span>`}${
      broken.length && !t ? ` <button class="link" data-pop="broken">${showBroken ? "Hide" : "Show"} broken</button>` : ""}</div>` : "") + note;
}
$("pop-foot").addEventListener("click", (e) => {
  const b = e.target.closest("[data-pop]");
  if (!b) return;
  if (b.dataset.pop === "test") testModels(popProv);
  else if (b.dataset.pop === "stop") { testing = null; renderPop(); }
  else if (b.dataset.pop === "broken") { showBroken = !showBroken; renderPop(); }
});
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
$("pop-prov").innerHTML = provOptions();
$("pop-prov").addEventListener("change", async (e) => {
  popProv = e.target.value;
  renderPop();
  if (keySet(popProv) && !modelCache[popProv]) {
    try { await loadModels(popProv); } catch (e) { toast(errText(e), 4500); }
    renderPop();
  }
});
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
$("set-discord").addEventListener("change", () => saveSettings({ discord_rpc: $("set-discord").checked },
  $("set-discord").checked ? "Discord status on." : "Discord status off."));
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
  if (mode.agent && !opts.plan) lines.push("", "AGENT MODE: work through the whole request on your own - break it into steps, build every part, and don't stop to ask unless something is truly ambiguous. After you finish, VoidScript playtests the game and sends you any new errors from the Output to fix.");
  if (opts.plan) lines.push("", "PLAN MODE: you only have read-only tools right now. Look at what exists if it helps, then reply with a short numbered plan (what you will add or change, and where) and stop. Do not write code yet - the user will approve the plan first.");
  else if (access() === "ask") lines.push("", "ACCESS: the user approves every change in Studio and every file write and command. If they deny one, don't retry it - ask what they want.");
  const instr = (lsGet("vs-instr") || "").trim();
  if (instr) lines.push("", "The user's standing instructions (follow them unless the current request says otherwise):", instr.slice(0, 3000));
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
    if (/^files_/.test(t.name)) continue; // the app has its own workspace_* tools, with approvals
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

// ── Markdown + code highlighting for replies ────────────────────────────────
const KW = {
  lua: "and|break|do|else|elseif|end|false|for|function|if|in|local|nil|not|or|repeat|return|then|true|until|while|continue|export|type",
  c: "const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|from|export|default|async|await|try|catch|finally|throw|typeof|instanceof|true|false|null|undefined|this|def|elif|pass|lambda|None|True|False|and|or|not|in|is|with|as|yield|fn|pub|use|mut|impl|struct|enum|match|self",
};
const LUA_GLOBALS = "game|workspace|script|plugin|Instance|Vector3|Vector2|CFrame|Color3|UDim2|UDim|Enum|task|math|string|table|print|warn|error|pairs|ipairs|require|typeof|tostring|tonumber|TweenInfo|BrickColor|NumberSequence|ColorSequence|RaycastParams|OverlapParams|os|coroutine|buffer|utf8|bit32";
function hl(code, lang) {
  const lua = !lang || /^(lua|luau|rbx|roblox)$/i.test(lang);
  if (/^(text|txt|plain|output|log)$/i.test(lang)) return esc(code);
  const re = lua
    ? new RegExp(String.raw`(--\[(=*)\[[\s\S]*?\]\2\]|--[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\x60(?:\\.|[^\x60\\])*\x60|\[(=*)\[[\s\S]*?\]\4\])|\b(0x[\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)\b|\b(${KW.lua})\b|\b(${LUA_GLOBALS})\b|([A-Za-z_]\w*)(?=\s*[({"'])`, "g")
    : new RegExp(String.raw`(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)()|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\x60(?:\\.|[^\x60\\])*\x60)()|\b(\d[\d_]*(?:\.\d+)?)\b|\b(${KW.c})\b|()(?!)|([A-Za-z_]\w*)(?=\s*\()`, "g");
  let out = "", last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    const cls = m[1] ? "c" : m[3] ? "s" : m[5] ? "n" : m[6] ? "k" : m[7] ? "g" : "f";
    out += `<span class="t-${cls}">${esc(m[0])}</span>`;
    last = re.lastIndex;
    if (!m[0]) re.lastIndex++;
  }
  return out + esc(code.slice(last));
}
function inlineMd(s) {
  return esc(s)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<i>$2</i>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="#" data-url="$2">$1</a>');
}
function blocksMd(text) {
  const out = [];
  let list = null, para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inlineMd).join("<br>")}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((x) => `<li>${inlineMd(x)}</li>`).join("")}</${list.tag}>`); list = null; } };
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flushPara(); flushList(); out.push(`<h${Math.min(6, m[1].length + 2)} class="md-h">${inlineMd(m[2])}</h${Math.min(6, m[1].length + 2)}>`); continue; }
    if ((m = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/))) {
      flushPara();
      const tag = m[1] ? "ol" : "ul";
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(m[2]);
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote>${inlineMd(m[1])}</blockquote>`); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushPara(); flushList(); out.push("<hr>"); continue; }
    if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += " " + line.trim(); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return out.join("");
}
const RUNNABLE = /^(lua|luau|)$/i;
function md(s) {
  return '<div class="md">' + String(s).split("```").map((part, i) => {
    if (i % 2) {
      const nl = part.indexOf("\n");
      const head = nl >= 0 ? part.slice(0, nl).trim() : "";
      const lang = /^[\w+#.-]*$/.test(head) ? head : "";
      const code = (nl >= 0 && lang === head ? part.slice(nl + 1) : part).replace(/\n$/, "");
      return `<div class="code"><div class="code-h"><span>${esc(lang || "code")}</span>` +
        `<button class="cb" data-cb="copy">${ICONS.copy}Copy</button>` +
        (RUNNABLE.test(lang) ? `<button class="cb" data-cb="script">${ICONS.script}Add as script</button><button class="cb" data-cb="run">${ICONS.play}Run in Studio</button>` : "") +
        `</div><pre><code>${hl(code, lang)}</code></pre></div>`;
    }
    return blocksMd(part);
  }).join("") + "</div>";
}
// Code block buttons (all replies share one listener).
document.addEventListener("click", async (e) => {
  const b = e.target.closest(".code .cb");
  if (!b) return;
  const code = b.closest(".code").querySelector("pre").textContent;
  if (b.dataset.cb === "copy") {
    try { await navigator.clipboard.writeText(code); b.classList.add("done"); setTimeout(() => b.classList.remove("done"), 1400); } catch { toast("Couldn't copy."); }
  } else if (b.dataset.cb === "script") {
    // Client code goes to StarterPlayerScripts, modules to ReplicatedStorage, the rest to ServerScriptService.
    const client = /LocalPlayer|UserInputService|PlayerGui|CurrentCamera|RenderStepped/.test(code);
    const last = code.split("\n").filter((l) => l.trim()).slice(-1)[0] || "";
    const module = /^\s*return\s+[\w{]/.test(last) && !/^\s*return\s+"/.test(last);
    const n = (Number(lsGet("vs-script-n")) || 0) + 1;
    lsSet("vs-script-n", String(n));
    const sn = module ? { name: "Module" + n, kind: "ModuleScript", where: "ReplicatedStorage", code }
      : client ? { name: "ClientScript" + n, kind: "LocalScript", where: "StarterPlayerScripts", code }
      : { name: "ChatScript" + n, kind: "Script", where: "ServerScriptService", code };
    if (code.includes("]==]")) { toast("This code can't be added automatically - copy it instead."); return; }
    const out = await runLuau(VSKit.snippetLuau(sn), "", null);
    if (out != null) { toast(out || "Added.", 4000); b.classList.add("done"); }
  } else if (b.dataset.cb === "run") {
    const out = await runLuau(code, "", null);
    if (out != null) toast(out ? "Studio: " + out.slice(0, 160) : "Ran in Studio.", 4000);
  }
});
// Follow new messages only while you're at the bottom - scrolling up to read stops it.
let follow = true;
const stick = (force) => { if (force) follow = true; if (follow) body.scrollTop = body.scrollHeight; };
body.addEventListener("scroll", () => { follow = body.scrollHeight - body.scrollTop - body.clientHeight < 80; });
function addMsg(role, html) {
  $("chat-empty").hidden = true;
  const m = document.createElement("div");
  m.className = "msg " + role;
  m.innerHTML = `<div class="bubble">${html}</div>`;
  body.appendChild(m);
  stick();
  return m;
}
function typing(label) {
  const m = document.createElement("div");
  m.className = "msg ai";
  m.innerHTML = `<div class="bubble typing"><i></i><i></i><i></i>${label ? `<span>${esc(label)}</span>` : ""}</div>`;
  body.appendChild(m);
  stick();
  return m;
}
// Tool calls read like what they do ("Edited ServerScriptService.Coins"), not raw names.
function toolLabel(name, a) {
  a = a || {};
  const short = (p) => String(p || "").replace(/^game\./, "").split(".").slice(-2).join(".");
  const where = a.file_path || a.target_file || a.path || a.instance_path || a.target || a.script_path || "";
  const L = {
    script_read: ["Read", short(where)], multi_edit: [a.edits && a.edits.length === 1 && !a.edits[0].old_string ? "Created" : "Edited", short(where)],
    execute_luau: ["Ran Luau", ""], search_game_tree: ["Looked through the game", ""], inspect_instance: ["Inspected", short(where)],
    script_search: ["Searched scripts for", a.query || a.pattern || ""], script_grep: ["Searched scripts for", a.pattern || a.query || ""],
    insert_asset: ["Inserted", a.assetName || "an asset"], search_asset: ["Searched the Creator Store for", a.query || ""],
    screen_capture: ["Took a screenshot of Studio", ""], start_stop_play: [a.is_start ? "Started playing" : "Stopped playing", ""],
    get_console_output: ["Read the Output", ""], get_studio_state: ["Checked Studio", ""], generate_mesh: ["Generated a mesh", a.prompt || ""],
    workspace_read: ["Read file", a.path], workspace_write: ["Wrote file", a.path], workspace_list: ["Listed", a.path || "."], workspace_run: ["Ran", a.command], workspace_delete: ["Deleted", a.path],
  }[name];
  if (!L) return { verb: name.replace(/_/g, " "), obj: "" };
  return { verb: L[0], obj: String(L[1] || "").slice(0, 80) };
}
// multi_edit as a red/green diff instead of JSON.
function editDiff(a) {
  if (!a || !Array.isArray(a.edits)) return "";
  return a.edits.slice(0, 12).map((e) => {
    const rows = [];
    if (e.old_string) for (const l of String(e.old_string).split("\n").slice(0, 40)) rows.push(`<div class="dl del">- ${esc(l)}</div>`);
    for (const l of String(e.new_string || "").split("\n").slice(0, 60)) rows.push(`<div class="dl add">+ ${esc(l)}</div>`);
    return `<div class="diff">${rows.join("")}</div>`;
  }).join("");
}
function toolCard(name, args) {
  $("chat-empty").hidden = true;
  const el = document.createElement("div");
  el.className = "msg ai";
  const lab = toolLabel(name, args);
  const diff = name === "multi_edit" ? editDiff(args) : "";
  const body2 = name === "execute_luau" && args && args.code ? `<div class="code"><pre><code>${hl(String(args.code), "lua")}</code></pre></div>` : diff || `<pre>${esc(JSON.stringify(args, null, 2))}</pre>`;
  el.innerHTML = `<div class="tool${diff ? " has-diff" : ""}"><div class="tool-h"><span class="spin"></span><span class="nm"><b>${esc(lab.verb)}</b>${lab.obj ? " " + esc(lab.obj) : ""}</span><span class="st run">running</span></div>
    <div class="tool-b">${body2}<pre class="out"></pre></div></div>`;
  el.querySelector(".tool-h").onclick = () => el.querySelector(".tool").classList.toggle("open");
  body.appendChild(el);
  stick();
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
        if (r.images && r.images.length) {
          if (canSee()) { chat.pendingImages = (chat.pendingImages || []).concat(r.images.slice(0, 2)); t += `\n[${r.images.length} image(s) - attached below so you can see them]`; }
          else t += `\n[${r.images.length} image(s) returned - not visible to this model]`;
        }
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
  if (gen.busy) { gen.onDelta((e.payload || {}).content || "", (e.payload || {}).reasoning || ""); return; }
  if (!live) return;
  const d = e.payload || {};
  live.text += d.content || "";
  live.thought += d.reasoning || "";
  const tag = live.text.match(/<think(?:ing)?>([\s\S]*?)(?:<\/think(?:ing)?>|$)/i);
  const shown = live.text.replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi, "").trim();
  const thought = live.thought || (tag ? tag[1] : "");
  if (!shown && !thought) return;
  live.el.innerHTML = `<div class="bubble live">${!shown ? `<div class="live-th">${esc(thought.slice(-700))}</div>` : md(shown)}</div>`;
  stick();
});

// ── model calls: thinking + recovery ────────────────────────────────────────
// Chat modes, kept per PC: effort, access level and three toggles.
const MODE_DEFAULTS = { effort: "balanced", think: false, selfcheck: false, plan: false, memory: true, agent: false };
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
  $("btn-agent").classList.toggle("on", !!mode.agent);
  $("btn-nro").classList.toggle("on", nroOn());
  if ($("set-nro")) $("set-nro").checked = nroOn();
  // The composer shows the effort and access at a glance, and a chip per mode that's on.
  $("modes-sum").textContent = `${{ fast: "Fast", balanced: "Balanced", deep: "Deep" }[mode.effort] || "Balanced"} · ${{ ask: "Ask", sandbox: "Sandbox", full: "Full PC" }[access()] || "Sandbox"}`;
  const chips = [["agent", "Agent"], ["think", "Thinking"], ["selfcheck", "Self-check"], ["plan", "Plan first"]].filter(([k]) => mode[k]);
  $("mode-chips").innerHTML = chips.map(([k, n]) => `<button data-mode="${k}" title="Turn ${n} off">${esc(n)}${ICONS.x}</button>`).join("");
}
$("mode-chips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mode]");
  if (b) { mode[b.dataset.mode] = false; saveMode(); }
});
$("btn-modes").onclick = (e) => {
  e.stopPropagation();
  const pop = $("modes-pop");
  pop.hidden = !pop.hidden;
  $("btn-modes").classList.toggle("open", !pop.hidden);
};
document.addEventListener("click", (e) => {
  if (!$("modes-pop").hidden && !e.target.closest(".modes-wrap")) { $("modes-pop").hidden = true; $("btn-modes").classList.remove("open"); }
});
$("btn-nro").onclick = () => {
  lsSet("vs-nro", nroOn() ? "off" : "on");
  renderMode();
  toast(nroOn() ? "Never run out on: the chat moves to your next provider when one hits its limit." : "Never run out off.");
};
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
  ["btn-agent", "agent", "Agent on: it builds, playtests in Studio, reads the errors and fixes them by itself.", "Agent off."],
]) $(id).onclick = () => { mode[key] = !mode[key]; saveMode(); toast(mode[key] ? on : off); };
renderMode();

// Studio tools that only look. Anything else changes the place.
const READ_ONLY = /^(script_read|script_search|script_grep|search_game_tree|inspect_instance|get_[a-z_]+|list_[a-z_]+|search_asset|screen_capture|wait_job_finished|skill|http_get|workspace_list|workspace_read)$/;
const isReadOnly = (name) => READ_ONLY.test(String(name));

// Each API spells "think first" differently; models that don't reason ignore it.
function thinkParams(p) {
  if (p === "openrouter") return { reasoning: { effort: effort().reason } };
  if (p === "google") return { reasoning_effort: effort().reason };
  if (p !== "nvidia") return {}; // other APIs reject NVIDIA's switch; their models think on their own
  return { chat_template_kwargs: { thinking: true, enable_thinking: true } };
}

async function pickAvailable(p, current) {
  let list = [];
  try { list = await loadModels(p); } catch { return null; }
  const ids = new Set(list.map((m) => m.id));
  const prefs = p === "nvidia" ? NV_FALLBACK
    : p === "google" ? list.map((m) => m.id).filter((id) => /flash/.test(id) && !/lite|preview|exp/.test(id)).sort().reverse()
    : p === "openrouter" ? [DEFAULTS.openrouter] : [DEFAULTS[p]].filter(Boolean);
  const hit = prefs.find((id) => id !== current && ids.has(id));
  if (hit) return hit;
  const tooled = list.find((m) => m.id !== current && m.tools !== false && GOOD_MODEL.test(m.id));
  return tooled ? tooled.id : null;
}

// One chat-completions call that recovers from the usual provider hiccups: a
// retired model (switch to a listed one), a model without tool calling (retry as
// plain chat), or an API that rejects the thinking switch (retry without it).
// Each API spells "answer straight away" differently; models that don't reason ignore it.
function noThinkParams(p) {
  if (p === "openrouter") return { reasoning: { effort: "low" } };
  if (p === "google") return { reasoning_effort: "low" };
  if (p !== "nvidia") return {};
  return { chat_template_kwargs: { thinking: false, enable_thinking: false } };
}

// opts.model: use this model instead of the chat's (the generators' fast model).
// opts.noThink: ask reasoning models to skip their thinking pass.
// Vision: Studio screenshots go to models that can look at pictures.
const SHOT_NOTE = "Here is what the screen_capture tool returned:";
const VISION = /gemini|gemma-3|gpt-4o|gpt-4\.1|gpt-5|\bo[34]\b|claude|vision|[-_/]vl\b|vl-|llama-4|pixtral|mistral-(small|medium)|qwen.*(vl|omni)|qvq|kimi-(k2\.[5-9]|vl)|glm-4\.\dv|glm-5v|grok-4|phi-4-multimodal|minicpm-v|llava|moondream/i;
const visionNo = {};
function canSee() {
  const m = curModel() || "";
  return lsGet("vs-vision") !== "off" && VISION.test(m) && !visionNo[m];
}
const hasImages = (req) => req.messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"));
function stripImages(req) {
  return Object.assign({}, req, { messages: req.messages.map((m) => Array.isArray(m.content)
    ? Object.assign({}, m, { content: m.content.filter((p) => p.type === "text").map((p) => p.text).join("\n") + " [screenshot not shown - this model can't see pictures]" }) : m) });
}

// "Never run out": when a provider hits its limit (or is down), the same request
// goes to the next provider you have a key for, and the empty one rests a while.
const FALLBACK_ERR = /API (40[123]|408|429|5\d\d)|rate.?limit|quota|exceeded|credits|too many requests|overloaded|capacity|Could not reach|timed? ?out|stopped mid-reply|Add your .* key/i;
const providerRest = {}; // provider -> resting until (ms)
function nroOn() { return lsGet("vs-nro") !== "off"; }
function fallbackChain(first) {
  const local = new Set(["ollama", "lmstudio", "llamacpp", "jan"]);
  const all = ["nvidia", "google", "openrouter"].concat(MORE_PROVIDERS.map((x) => x[0]));
  const rest = all.filter((p) => p !== first && !local.has(p) && keySet(p));
  // Keyless public ones last: they work, but they're the weakest.
  rest.sort((a, b) => (KEYLESS.has(a) ? 1 : 0) - (KEYLESS.has(b) ? 1 : 0));
  return [first].concat(rest);
}
async function callModel(req, opts = {}) {
  const first = prov();
  const chain = nroOn() && !opts.noFallback ? fallbackChain(first) : [first];
  const live = chain.filter((p) => (providerRest[p] || 0) < Date.now());
  const order = live.length ? live : chain;
  let lastErr;
  for (let i = 0; i < order.length; i++) {
    const p = order[i];
    try {
      const r = await callOne(p, req, p === first ? opts : Object.assign({}, opts, { model: null, quiet: true }));
      if (p !== first) { r.fellBack = p; bumpStat("fallbacks"); }
      return r;
    } catch (e) {
      const msg = errText(e);
      if (chat.stop || msg === "cancelled" || order.length < 2 || !FALLBACK_ERR.test(msg)) throw e;
      providerRest[p] = Date.now() + 90000;
      lastErr = e;
      if (order[i + 1]) toast(`${PROV_NAME[p]} ran out for now - switching to ${PROV_NAME[order[i + 1]]}.`, 3500);
    }
  }
  throw lastErr || new Error("Every provider you have a key for is out right now. Add another free key in Settings.");
}

async function callOne(p, req, opts = {}) {
  let model = opts.model || curModel(p), own = !opts.model;
  if (!model && p !== prov()) model = await pickAvailable(p, null);
  if (!model) throw new Error(`Pick a ${PROV_NAME[p]} model first: open the model menu at the top of Chat.`);
  let useTools = !!req.tools, useThink = !!opts.think, noThink = !!opts.noThink && !opts.think;
  for (let attempt = 0; attempt < 7; attempt++) {
    const body = Object.assign({}, req, { model }, useThink ? thinkParams(p) : noThink ? noThinkParams(p) : {});
    if (!useTools) { delete body.tools; delete body.tool_choice; }
    try {
      const res = await untilStopped(invoke("ai_chat", { body, provider: p }));
      if (res === STOPPED) throw new Error("cancelled");
      return { res, model, toolsDropped: !!req.tools && !useTools };
    } catch (e) {
      const msg = errText(e);
      if (chat.stop || msg === "cancelled") throw e;
      if (useThink && /chat_template_kwargs|reasoning|thinking|extra (fields|inputs)|not permitted|unrecognized/i.test(msg)) { useThink = false; continue; }
      if (noThink && /chat_template_kwargs|reasoning|thinking|extra (fields|inputs)|not permitted|unrecognized/i.test(msg)) { noThink = false; continue; }
      // Many models cap their output below what the generators ask for.
      if (req.max_tokens > 4096 && /max_tokens|max_completion_tokens|maximum (output|completion|context)|too many tokens|context length/i.test(msg)) {
        req = Object.assign({}, req, { max_tokens: Math.max(4096, Math.floor(req.max_tokens / 2)) });
        continue;
      }
      if (useTools && /API 4(00|22)/.test(msg) && /tool|function/i.test(msg)) { useTools = false; continue; }
      // A model that can't take pictures after all: send the text only.
      if (hasImages(req) && /image|vision|multimodal|content.*(string|array)|unsupported.*(type|content)/i.test(msg)) { req = stripImages(req); visionNo[model] = true; continue; }
      if (/API 404|not found|does not exist|no such model|unknown model|is not available/i.test(msg)) {
        setHealth(p, model, { ok: false, why: msg.slice(0, 140) });
        // A borrowed fast model that's gone: just use the chat's own model.
        if (!own) { model = curModel(p); own = true; continue; }
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
  stick();
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

// Agent mode: after a build turn, play the game in Studio for a few seconds and
// read the Output. New errors go back to the AI to fix (a few rounds at most).
const AGENT_ROUNDS = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function agentPlaytest(round) {
  const card = toolCard(`playtest · round ${round}`, { play: "8 seconds", then: "read the Output for new errors" });
  try {
    const before = await callTool("get_console_output", {}, 20000).catch(() => "");
    await callTool("start_stop_play", { is_start: true }, 40000);
    for (let i = 0; i < 80 && !chat.stop; i++) await sleep(100);
    const after = await callTool("get_console_output", {}, 20000).catch(() => "");
    await callTool("start_stop_play", { is_start: false }, 40000).catch(() => {});
    const fresh = before && after.startsWith(before) ? after.slice(before.length) : after.split("\n").slice(-120).join("\n");
    const errors = [...new Set(fresh.split("\n").map((l) => l.trim()).filter((l) =>
      /error|exception|attempt to|is not a valid member|infinite yield|stack begin|failed|nil value/i.test(l) && !/VoidScript|MCP|plugin/i.test(l)))].slice(0, 25);
    card.set(errors.length ? "err" : "ok", errors.length ? `${errors.length} error${errors.length === 1 ? "" : "s"}` : "no errors", fresh.trim().slice(-4000) || "(the Output stayed quiet)");
    return errors;
  } catch (e) {
    card.set("err", "couldn't playtest", errText(e));
    callTool("start_stop_play", { is_start: false }, 20000).catch(() => {});
    return null;
  }
}

// Hover actions under a message. data: { text, at (history index to rewind to), node (the user message), meta }
function msgActions(el, kinds, data) {
  const bar = document.createElement("div");
  bar.className = "msg-acts";
  const tips = { copy: "Copy", retry: "Try again", edit: "Edit and resend", save: "Save as a prompt", speak: "Read aloud", fork: "Branch a new chat from here", mem: "Remember this in the project memory" };
  const icon = { copy: ICONS.copy, retry: ICONS.retry, edit: ICONS.edit, save: ICONS.star, speak: ICONS.speak, fork: ICONS.fork, mem: ICONS.mem };
  bar.innerHTML = kinds.map((k) => `<button data-a="${k}" title="${tips[k]}">${icon[k]}</button>`).join("") + (data.meta ? `<span class="msg-meta">${esc(data.meta)}</span>` : "");
  bar.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "copy") {
      try { await navigator.clipboard.writeText(data.text); b.classList.add("done"); setTimeout(() => b.classList.remove("done"), 1400); } catch { toast("Couldn't copy."); }
    } else if (a === "save") {
      savePrompt(data.text); b.classList.add("done");
    } else if (a === "mem") {
      if (chat.busy) { toast("Wait for the reply to finish first."); return; }
      sendChat("Save the lasting facts from your last answer to the project memory (short, factual, in the right section), then reply with one line saying what you saved:\n\n" + String(data.text).slice(0, 2500));
    } else if (a === "speak") {
      speak(data.text, b);
    } else if (a === "fork") {
      forkChat(data.upto);
    } else if (chat.busy) {
      toast("Wait for the reply to finish, or press Stop.");
    } else {
      // Rewind to just before that question, then ask again (or let the user edit it first).
      chat.messages.length = data.at;
      const um = data.node;
      while (um.nextSibling) um.nextSibling.remove();
      um.remove();
      if (!chat.messages.length) $("chat-empty").hidden = false;
      if (a === "retry") sendChat(data.question || data.text);
      else { input.value = data.text; grow(); input.focus(); }
    }
  });
  el.appendChild(bar);
}

async function sendChat(text, opts = {}) {
  if (chat.busy) return;
  if (gen.busy) { toast("Wait for the generator to finish first."); return; }
  const planning = mode.plan && !opts.build;
  if (mode.memory && chat.memory == null) chat.memory = await readMemory();
  // Reference files ride along with THIS message (and so stay in the history).
  const refs = attachments.splice(0);
  renderAttachments();
  const full = refs.length
    ? text + "\n\n---\nReference files the user attached (use them as context):\n\n" +
      refs.map((a) => `### ${a.name}\n\`\`\`\n${a.content}\n\`\`\``).join("\n\n")
    : text;
  const at = chat.messages.length;
  chat.messages.push({ role: "user", content: full });
  if (!chat.title) chat.title = text.replace(/\s+/g, " ").slice(0, 60);
  stick(true);
  const um = addMsg("user", esc(text));
  if (refs.length) {
    const r = document.createElement("div");
    r.className = "refs";
    r.innerHTML = refs.map((a) => `<span>${esc(a.name)}</span>`).join("");
    um.appendChild(r);
  }
  msgActions(um, ["copy", "edit", "retry", "save"], { text, at, node: um });
  bumpStat("messages");
  chat.stop = false;
  setBusy(true);
  const { defs, map } = toolDefs(planning);
  const ef = effort();
  const steps = mode.agent ? ef.steps * 2 : ef.steps;
  chat.changed = false;
  let reviewed = false, lastAi = null, rounds = 0, tools = 0, usedModel = "", fellBack = null;
  const t0 = Date.now();
  try {
    let step = 0;
    let warnedNoTools = false;
    for (; step < steps && !chat.stop; step++) {
      const t = liveStart(mode.think ? "Thinking" : planning ? "Planning" : reviewed ? "Checking" : rounds ? "Fixing" : "");
      const s0 = Date.now();
      let r;
      try {
        const req = { messages: [{ role: "system", content: systemPrompt({ plan: planning }) }].concat(chat.messages), temperature: mode.think ? 0.6 : 0.2, max_tokens: mode.think ? Math.max(12000, ef.tokens) : ef.tokens };
        if (defs.length) { req.tools = defs; req.tool_choice = "auto"; }
        r = await callModel(req, { think: mode.think });
      } finally { t.remove(); live = null; }
      usedModel = r.model;
      if (r.fellBack && fellBack !== r.fellBack) {
        fellBack = r.fellBack;
        addMsg("note", esc(`${PROV_NAME[prov()]} hit its limit, so ${PROV_NAME[r.fellBack]} (${r.model}) answered instead.`));
      }
      const m = r.res && r.res.choices && r.res.choices[0] && r.res.choices[0].message;
      if (!m) throw new Error("The model returned an empty response. Try again, or pick another model.");
      if (r.toolsDropped && !warnedNoTools) {
        warnedNoTools = true;
        addMsg("note", esc(`${r.model} can't use tools, so it can only chat here. Pick a model tagged "tools" in the model menu to build in Studio.`));
      }
      const { content, thought } = splitThinking(m);
      if (thought) thoughtCard(thought, Math.round((Date.now() - s0) / 1000));
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
        // Agent: playtest, and hand any new errors back to fix.
        if (mode.agent && chat.changed && !planning && !chat.stop && rounds < AGENT_ROUNDS && S.state.connected) {
          rounds++;
          chat.changed = false;
          const errors = await agentPlaytest(rounds);
          if (errors && errors.length && !chat.stop) {
            chat.messages.push({ role: "user", content: `Agent playtest (round ${rounds} of ${AGENT_ROUNDS}): I played the game in Studio for 8 seconds and the Output showed these new errors:\n${errors.map((e) => "- " + e).join("\n")}\n\nFind the cause of each (script_read the scripts involved) and fix them with surgical edits. Then say in one sentence what you fixed.` });
            continue;
          }
          if (errors && !errors.length) bumpStat("playtests");
          if (errors && !errors.length) addMsg("note", esc(`Playtest passed: no errors in the Output${rounds > 1 ? ` after ${rounds} rounds` : ""}.`));
        }
        break;
      }
      for (const c of calls) {
        tools++;
        const out = chat.stop ? "Stopped by the user." : await runCall(c, map);
        chat.messages.push({ role: "tool", tool_call_id: c.id, content: out });
      }
      // Screenshots from the tools, shown to models that can see.
      if (chat.pendingImages && chat.pendingImages.length) {
        chat.messages.push({ role: "user", content: [{ type: "text", text: SHOT_NOTE }].concat(chat.pendingImages.slice(0, 3).map((i) => ({ type: "image_url", image_url: { url: `data:${i.mimeType || "image/png"};base64,${i.data}` } }))) });
        chat.pendingImages = [];
      }
    }
    if (step >= steps) {
      const note = addMsg("ai", esc(`Paused after ${steps} steps.`));
      const bar = document.createElement("div");
      bar.className = "plan-actions";
      bar.innerHTML = '<button class="btn primary sm">Continue</button>';
      bar.querySelector("button").onclick = () => { bar.remove(); sendChat("Continue where you left off."); };
      note.appendChild(bar);
    } else if (!chat.stop) { sfx("done"); attention(Date.now() - t0); }
    if (planning && lastAi && !chat.stop) {
      const bar = document.createElement("div");
      bar.className = "plan-actions";
      bar.innerHTML = '<button class="btn primary sm">Build it</button><span class="muted">or reply to change the plan</span>';
      bar.querySelector("button").onclick = () => { bar.remove(); sendChat("The plan looks good. Build it.", { build: true }); };
      lastAi.appendChild(bar);
    }
    if (lastAi && !chat.stop) {
      const secs = Math.round((Date.now() - t0) / 1000);
      const all = chat.messages.slice(at).filter((x) => x.role === "assistant" && x.content).map((x) => x.content).join("\n\n");
      msgActions(lastAi, ["copy", "retry", "speak", "fork", "mem"], { text: all, question: text, at, node: um, upto: chat.messages.length, meta: `${usedModel} · ${secs}s${tools ? ` · ${tools} tool${tools === 1 ? "" : "s"}` : ""}` });
    }
    if (chat.stop) addMsg("ai", esc("Stopped."));
  } catch (e) {
    if (chat.stop) addMsg("ai", esc("Stopped."));
    else { addMsg("err", esc(errText(e))); sfx("error"); }
  } finally {
    setBusy(false);
    saveChat();
    $("chat-input").focus();
  }
}

// Read a reply aloud (Windows' own voices, nothing leaves the PC).
function speak(text, btn) {
  const synth = window.speechSynthesis;
  if (!synth) { toast("Reading aloud isn't available here."); return; }
  if (synth.speaking) { synth.cancel(); if (btn) btn.classList.remove("on"); return; }
  const plain = String(text).replace(/```[\s\S]*?```/g, " (code) ").replace(/[*_`#>]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const u = new SpeechSynthesisUtterance(plain.slice(0, 6000));
  if (btn) { btn.classList.add("on"); u.onend = u.onerror = () => btn.classList.remove("on"); }
  synth.speak(u);
}
// Branch: a new chat holding everything up to this answer.
function forkChat(upto) {
  if (chat.busy) { toast("Wait for the reply to finish first."); return; }
  const msgs = chat.messages.slice(0, upto);
  if (!msgs.length) return;
  saveChat();
  const id = newId();
  chats.push({ id, title: "Branch: " + (chat.title || "chat").slice(0, 50), messages: msgs, t: Date.now(), pinned: false });
  persistChats();
  openChat(id);
  toast("Branched into a new chat.");
}

// Flash the taskbar when a long reply finishes while you're in another window.
async function attention(ms) {
  if (ms < 15000 || lsGet("vs-attn") === "off") return;
  try { if (!(await appWin.isFocused())) await appWin.requestUserAttention(2); } catch {}
}

// ── chat history (kept on this PC) ──────────────────────────────────────────
const CHATS_KEY = "vs-chats", CHATS_MAX = 80;
let chats = [];
try { chats = JSON.parse(lsGet(CHATS_KEY) || "[]"); } catch { chats = []; }
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function persistChats() {
  chats.sort((a, b) => (b.pinned - a.pinned) || (b.t - a.t));
  if (chats.length > CHATS_MAX) chats = chats.filter((c, i) => c.pinned || i < CHATS_MAX);
  for (let tries = 0; tries < 6; tries++) {
    try { localStorage.setItem(CHATS_KEY, JSON.stringify(chats)); break; }
    catch { const old = chats.filter((c) => !c.pinned && c.id !== chat.id).pop(); if (!old) break; chats = chats.filter((c) => c !== old); }
  }
  renderChatList();
  if (typeof renderHome === "function") renderHome();
}
// Tool outputs are trimmed so the history stays small.
function saveChat() {
  if (!chat.messages.length) return;
  if (!chat.id) { chat.id = newId(); bumpStat("chats"); }
  const slim = chat.messages.slice(-240).map((m) => m.role === "tool" ? Object.assign({}, m, { content: cap(String(m.content || ""), 1500) })
    : Array.isArray(m.content) ? Object.assign({}, m, { content: SHOT_NOTE + " [screenshot]" }) : m);
  const rec = chats.find((c) => c.id === chat.id);
  if (rec) Object.assign(rec, { title: rec.renamed ? rec.title : chat.title || rec.title, messages: slim, t: Date.now() });
  else chats.push({ id: chat.id, title: chat.title || "New chat", messages: slim, t: Date.now(), pinned: false });
  persistChats();
}
function stripRefs(t) { t = String(t); const i = t.indexOf("\n\n---\nReference files the user attached"); return i >= 0 ? t.slice(0, i) : t; }
function openChat(id) {
  if (chat.busy) { toast("Stop the current reply first."); return; }
  const rec = chats.find((c) => c.id === id);
  if (!rec) return;
  saveChat();
  clearChatView();
  Object.assign(chat, { id: rec.id, title: rec.title, messages: rec.messages.slice(), memory: null });
  const results = {};
  for (const m of chat.messages) if (m.role === "tool") results[m.tool_call_id] = m.content;
  chat.messages.forEach((m, i) => {
    if (m.role === "user") {
      const text = stripRefs(m.content);
      if (/^(Self-check:|Agent playtest \(round|Here is what the screen_capture)/.test(text)) return;
      const um = addMsg("user", esc(text));
      msgActions(um, ["copy", "edit", "retry", "save"], { text, at: i, node: um });
    } else if (m.role === "assistant") {
      if (m.content) {
        const el = addMsg("ai", md(m.content));
        if (!m.tool_calls || !m.tool_calls.length) msgActions(el, ["copy", "speak", "fork"], { text: m.content, at: i, node: el, upto: i + 1 });
      }
      for (const c of m.tool_calls || []) {
        let args = {};
        try { args = JSON.parse(c.function.arguments || "{}"); } catch {}
        const out = results[c.id];
        toolCard(c.function.name, args).set(out == null ? "deny" : /^ERROR/.test(out) ? "err" : "ok", out == null ? "no result" : /^ERROR/.test(out) ? "error" : "done", out);
      }
    }
  });
  $("chat-empty").hidden = chat.messages.length > 0;
  go("chat");
  stick(true);
  renderChatList();
}
function clearChatView() {
  body.querySelectorAll(".msg").forEach((m) => m.remove());
  $("chat-empty").hidden = false;
}
function newChat() {
  if (chat.busy) { toast("Stop the current reply first."); return; }
  saveChat();
  Object.assign(chat, { id: null, title: "", messages: [], memory: null });
  sessionAllow = {}; attachments = []; renderAttachments();
  clearChatView();
  renderChatList();
  go("chat");
}
function deleteChat(id) {
  if (chat.id === id && chat.busy) { toast("Stop the current reply first."); return; }
  chats = chats.filter((c) => c.id !== id);
  if (chat.id === id) { Object.assign(chat, { id: null, title: "", messages: [] }); clearChatView(); }
  persistChats();
}
function chatGroup(t) {
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(new Date(t))) / 86400000);
  return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? "Previous 7 days" : diff < 30 ? "Previous 30 days" : "Older";
}
function renderChatList() {
  const q = ($("chats-q").value || "").trim().toLowerCase();
  const list = chats.filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.role === "user" && String(m.content).toLowerCase().includes(q)));
  if (!list.length) { $("chats-list").innerHTML = `<div class="cl-empty">${q ? "No chats match." : "Your chats show up here."}</div>`; return; }
  let html = "", group = "";
  for (const c of list) {
    const g = c.pinned ? "Pinned" : chatGroup(c.t);
    if (g !== group) { group = g; html += `<div class="cl-group">${g}</div>`; }
    html += `<div class="cl-item${c.id === chat.id ? " on" : ""}" data-id="${c.id}" role="button" tabindex="0">
      <span class="t">${esc(c.title || "New chat")}</span>
      <span class="cl-acts"><span data-a="pin" title="${c.pinned ? "Unpin" : "Pin"}">${ICONS.pin}</span><span data-a="ren" title="Rename">${ICONS.edit}</span><span data-a="del" title="Delete">${ICONS.trash}</span></span></div>`;
  }
  $("chats-list").innerHTML = html;
}
$("chats-list").addEventListener("click", (e) => {
  const item = e.target.closest(".cl-item");
  if (!item) return;
  const id = item.dataset.id, rec = chats.find((c) => c.id === id);
  const a = e.target.closest("[data-a]");
  if (!a) { if (!e.target.closest("input")) openChat(id); return; }
  if (a.dataset.a === "del") deleteChat(id);
  else if (a.dataset.a === "pin") { rec.pinned = !rec.pinned; persistChats(); }
  else if (a.dataset.a === "ren") {
    const t = item.querySelector(".t");
    t.innerHTML = `<input value="${esc(rec.title)}" maxlength="80" />`;
    const inp = t.querySelector("input");
    inp.focus(); inp.select();
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      if (keep && inp.value.trim()) { rec.title = inp.value.trim(); rec.renamed = true; if (chat.id === id) chat.title = rec.title; }
      persistChats();
    };
    inp.onkeydown = (ev) => { if (ev.key === "Enter") finish(true); if (ev.key === "Escape") finish(false); };
    inp.onblur = () => finish(true);
  }
});
$("chats-q").addEventListener("input", renderChatList);

// Saved prompts (star a message to keep it; they show in the palette and as /p).
let prompts = [];
try { prompts = JSON.parse(lsGet("vs-prompts") || "[]"); } catch {}
function savePrompt(text) {
  if (prompts.includes(text)) { toast("Already saved."); return; }
  prompts.unshift(text); prompts = prompts.slice(0, 50);
  lsSet("vs-prompts", JSON.stringify(prompts));
  toast("Saved. Find it with Ctrl+K, or type /p in the chat.");
}

// Little usage counters for the Home page.
let stats = {};
try { stats = JSON.parse(lsGet("vs-stats") || "{}"); } catch {}
function bumpStat(k, n = 1) { stats[k] = (stats[k] || 0) + n; lsSet("vs-stats", JSON.stringify(stats)); }

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
$("btn-new-chat").onclick = newChat;
renderChatList();
document.querySelectorAll(".sugg").forEach((b) => b.addEventListener("click", () => { input.value = b.textContent; $("btn-send").click(); }));

// ── SpookyScript: VoidScript's Halloween mode (spooky.js) ────────────────────
// All October (and Halloween night into 1 November) the app becomes SpookyScript:
// orange-and-purple look, pumpkin logos, spooky wording, bats, and music that
// starts by itself (mute button in the title bar). Settings can switch it off.
const spooky = { on: false, dev: false, icon: null };
invoke("is_dev").then((v) => { spooky.dev = !!v; applySpooky(); }).catch(() => {});
// Halloween versions of the suggestions and ideas, swapped in while it's on.
const SPOOKY_IDEAS = {
  ".sugg": ["Build a haunted house with flickering lights", "Make a zombie that chases the nearest player", "Add a graveyard with fog and glowing tombstones", "Make a pumpkin that gives candy when touched"],
  "#mg-ideas button": ["Haunted mansion", "Jack-o'-lantern", "Witch's cauldron", "Coffin", "Scarecrow", "Ghost ship"],
  "#ub-ideas button": ["Trick-or-treat shop", "Candy counter HUD", "Haunted main menu", "Costume picker", "Spooky reward chest", "Ghost radar"],
};
const plainIdeas = {};
// [selector, VoidScript text, SpookyScript text]
const SPOOKY_TEXT = [
  ["#chat-empty h2", "What are we building?", "What are we haunting tonight?"],
];
function applySpooky() {
  const on = lsGet("vs-halloween") !== "off" && (VSSpooky.inSeason() || lsGet("vs-spooky-force") === "1");
  spooky.on = on;
  document.documentElement.classList.toggle("spooky", on);
  document.title = on ? "SpookyScript" : "VoidScript";
  document.querySelector(".tb-name").innerHTML = on ? 'Spooky<span class="grad">Script</span>' : 'Void<span class="grad">Script</span>';
  const logo = on ? (spooky.dev ? "assets/logo-spooky-dev.png" : "assets/logo-spooky.png") : "assets/logo.png";
  document.querySelectorAll('img[src$="logo.png"], img[src$="logo-spooky.png"], img[src$="logo-spooky-dev.png"]').forEach((i) => { i.src = logo; });
  if (on && spooky.dev) document.querySelector(".tb-name").insertAdjacentHTML("beforeend", ' <span class="dev-tag">DEV</span>');
  if (spooky.icon !== on) { spooky.icon = on; invoke("set_spooky_icon", { on }).catch(() => {}); }
  for (const [sel, list] of Object.entries(SPOOKY_IDEAS)) {
    const els = [...document.querySelectorAll(sel)];
    if (!plainIdeas[sel]) plainIdeas[sel] = els.map((e) => e.textContent);
    els.forEach((e, i) => { e.textContent = on ? (list[i] || plainIdeas[sel][i]) : plainIdeas[sel][i]; });
  }
  for (const [sel, plain, spook] of SPOOKY_TEXT) { const e = document.querySelector(sel); if (e && plain) e.textContent = on ? spook : plain; }
  $("chat-input").placeholder = on ? "Ask SpookyScript to conjure something…" : "Ask VoidScript to build something…";
  let bats = document.querySelector(".spooky-bats");
  if (on && !bats) { bats = document.createElement("div"); bats.className = "spooky-bats"; bats.innerHTML = "<i></i><i></i><i></i><b></b><b></b>"; $("view").prepend(bats); }
  if (!on && bats) bats.remove();
  let deco = document.querySelector(".spooky-deco");
  if (on && !deco) { deco = document.createElement("div"); deco.className = "spooky-deco"; deco.innerHTML = '<i class="web tl"></i><i class="web br"></i><i class="spider"></i><i class="flash"></i>'; $("view").appendChild(deco); }
  if (!on && deco) deco.remove();
  $("btn-music").hidden = !on;
  const music = on && lsGet("vs-spooky-music") !== "off";
  $("btn-music").classList.toggle("off", !music);
  $("btn-music").title = music ? "Mute the spooky music" : "Play the spooky music";
  if (music) VSSpooky.start(0.35, "assets/spooky.mp3"); else VSSpooky.stop();
  $("set-halloween").checked = lsGet("vs-halloween") !== "off";
  renameAll();
}
// Every "VoidScript" the app itself shows becomes "SpookyScript" (and back) -
// including text written later - but never chat messages or code.
function renameAll(root) {
  const [from, to] = spooky.on ? [/VoidScript/g, "SpookyScript"] : [/SpookyScript/g, "VoidScript"];
  const w = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue.search(from) >= 0 && !n.parentElement.closest(".msg, pre, code, textarea, .mg-script, .term, #chat-body .bubble") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  const hits = [];
  let n;
  while ((n = w.nextNode())) hits.push(n);
  for (const t of hits) t.nodeValue = t.nodeValue.replace(from, to);
}
let renameQueued = false;
new MutationObserver(() => {
  if (!spooky.on || renameQueued) return;
  renameQueued = true;
  setTimeout(() => { renameQueued = false; renameAll(); }, 150);
}).observe(document.body, { childList: true, subtree: true, characterData: true });
$("btn-music").onclick = () => { lsSet("vs-spooky-music", lsGet("vs-spooky-music") === "off" ? "on" : "off"); applySpooky(); };
$("set-halloween").addEventListener("change", (e) => {
  lsSet("vs-halloween", e.target.checked ? "on" : "off");
  applySpooky();
  toast(e.target.checked ? (VSSpooky.inSeason() ? "🎃 SpookyScript is on." : "SpookyScript will appear in October.") : "Halloween mode off.");
});
applySpooky();
setInterval(applySpooky, 60 * 60 * 1000); // switches over by itself on 1 October / 2 November

// ── Prompt Enhancer ────────────────────────────────────────────────────────
// The wand button rewrites what you typed so the AI gets it first time - the SAME request,
// only clearer and more specific. It never adds features you didn't ask for.
// The result replaces the box's text as an edit, so Ctrl+Z gets yours back.
const ENHANCE = {
  chat: "You improve a request that a Roblox developer is about to send to an AI agent that builds directly in Roblox Studio. " +
    "Rewrite THEIR request so it is clear and specific. Keep exactly what they asked for - the same feature, names, numbers and details - " +
    "and never add features, mechanics, content or extra polish they didn't ask for. Only make the implied parts explicit: what it should do, " +
    "where its parts and scripts belong (Workspace, ServerScriptService, StarterGui, ReplicatedStorage), how it behaves, and how to check it works. " +
    "Write it as the developer, in plain sentences or a few bullet points, at most 120 words. Reply with ONLY the improved request.",
  model: "You improve a description for an AI that builds a 3D model out of Roblox parts. Rewrite THEIR description so it is clear and easy to build. " +
    "It must stay the same object - never change what it is or add things that aren't part of it. Spell out its overall shape and real-world proportions, " +
    "its main sections, the details that make it recognisable, and its colours and materials (only where they fit what they described). " +
    "One short paragraph, at most 70 words. Reply with ONLY the improved description.",
  ui: "You improve a description for an AI that designs a Roblox ScreenGui. Rewrite THEIR description so it is clear and easy to build. " +
    "It must stay the same screen - never add screens, features or buttons they didn't ask for. Spell out the layout (what goes where), " +
    "each element and its text, what each button does, and the look (colours, style) only where it fits what they described. " +
    "One short paragraph, at most 80 words. Reply with ONLY the improved description.",
};
async function enhance(kind, box, btn) {
  const text = box.value.trim();
  if (!text) { toast("Type your request first, then press the wand to make it clearer."); box.focus(); return; }
  if (chat.busy || gen.busy) { toast("Wait for the AI to finish first."); return; }
  if (!keySet()) { toast(`Add your ${PROV_NAME[prov()]} API key in Settings first.`, 3500); go("settings"); return; }
  gen.busy = true; gen.onDelta = () => {}; chat.stop = false;
  btn.disabled = true; btn.classList.add("busy");
  try {
    const { res } = await callModel({ messages: [{ role: "system", content: ENHANCE[kind] }, { role: "user", content: text }], temperature: 0.3, max_tokens: 700 },
      { model: (await genModel()) || undefined, noThink: true, quiet: true });
    const m = res && res.choices && res.choices[0] && res.choices[0].message;
    const out = splitThinking(m || {}).content.trim()
      .replace(/^(here(?:'s| is)[^:\n]*:|improved (?:request|description)\s*:)\s*/i, "").replace(/^["“”']+|["“”']+$/g, "").trim();
    if (!out) throw new Error("The AI sent nothing back - try again.");
    // An edit, not a .value swap, so Ctrl+Z restores what you wrote.
    box.focus();
    box.select();
    if (!document.execCommand("insertText", false, out)) box.value = out;
    box.dispatchEvent(new Event("input", { bubbles: true }));
    toast("Clearer now - check it, then send. Ctrl+Z puts yours back.", 4500);
  } catch (e) {
    if (!chat.stop) toast(errText(e), 5000);
  } finally {
    gen.busy = false;
    btn.disabled = false; btn.classList.remove("busy");
  }
}
$("btn-enhance-chat").onclick = () => enhance("chat", $("chat-input"), $("btn-enhance-chat"));
$("btn-enhance-mg").onclick = () => enhance("model", $("mg-desc"), $("btn-enhance-mg"));
$("btn-enhance-ub").onclick = () => enhance("ui", $("ub-desc"), $("btn-enhance-ub"));

// ── Discord status ─────────────────────────────────────────────────────────
// What you're doing, for your Discord profile. The backend sends it (only when it
// changes, and never faster than Discord allows); this just describes the moment.
let studioOpen = false;
const checkStudio = () => invoke("studio_running").then((v) => { studioOpen = !!v; }).catch(() => {});
checkStudio();
setInterval(checkStudio, 10000);
function discordStatus() {
  const studio = !!(S.state && S.state.studio) || studioOpen;
  if (mg.busy) return ["Building a model", "Model maker"];
  if (ub.busy) return ["Designing a UI", "UI builder"];
  if (chat.busy) return studio ? ["Building in Roblox Studio", "Prompting the AI"] : ["Prompting the AI", "In the VoidScript app"];
  if (studio) return ["In Roblox Studio", "Coding next level on Roblox"];
  return ["In the VoidScript app", "Coding next level on Roblox"];
}
setInterval(() => {
  const [d, st] = discordStatus();
  invoke("rpc_set", { details: spooky.on ? "🎃 " + d : d, state: spooky.on ? st.replace("Coding next level on Roblox", "SpookyScript - coding spooky on Roblox") : st, spooky: spooky.on }).catch(() => {});
}, 3000);

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
