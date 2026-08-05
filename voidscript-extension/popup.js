// SPDX-License-Identifier: GPL-3.0-or-later
// VoidScript popup: shows bridge/Studio status and exposes reconnect, restart,
// settings, website and tip actions. Talks to background.js over the same
// message protocol the rest of the extension uses ("status" / "reconnect" /
// "restart_mcp" requests, "vs-status" broadcasts, "vs-open-menu" to a tab).

const LINKS = {
  site: "https://void-script.vercel.app/",
  fallbackAI: "https://chat.deepseek.com/",
  releases: "https://github.com/cjl26rg2/Void-Script/releases",
};

// One source of truth for every supported site: its display name and a matcher.
// Both the header pill and the "is this a supported AI tab?" test derive from it.
const PROVIDERS = [
  ["DeepSeek", /deepseek\.com/], ["Gemini", /gemini\.google\.com/],
  ["Kimi", /kimi\.com/], ["GLM", /z\.ai/], ["Qwen", /qwen\.ai/],
  ["Arena", /(^|\/\/)arena\.ai/], ["Meta AI", /meta\.ai/],
  ["ChatGPT", /chatgpt\.com|chat\.openai\.com/], ["Grok", /grok\.com/],
  ["Perplexity", /perplexity\.ai/], ["Copilot", /copilot\.microsoft\.com/],
  ["Mistral", /mistral\.ai/], ["Poe", /poe\.com/], ["HuggingChat", /huggingface\.co/],
  ["Phind", /phind\.com/], ["Blackbox", /blackbox\.ai/], ["You", /you\.com/],
  ["Groq", /groq\.com/], ["LMArena", /lmarena\.ai/], ["Doubao", /doubao\.com/],
  ["Yuanbao", /yuanbao\.tencent\.com/], ["Reka", /reka\.ai/], ["Pi", /(^|\/\/)pi\.ai/],
  ["Coral", /coral\.cohere\.com/], ["OpenRouter", /openrouter\.ai/], ["v0", /v0\.(app|dev)/],
  ["Genspark", /genspark\.ai/], ["Lambda Chat", /lambda\.chat/], ["ERNIE", /yiyan\.baidu\.com/],
  ["MiniMax", /minimax\.io/], ["Manus", /manus\.im/], ["Together", /together\.ai/],
  ["Claude", /(^|\/\/)claude\.ai/], ["DuckDuckGo AI", /(^|\/\/)duck\.ai/],
  ["Brave Leo", /leo\.brave\.com/], ["Character.AI", /character\.ai/],
  ["Kagi", /assistant\.kagi\.com/], ["ChatOn", /chaton\.ai/],
  ["SparkDesk", /xinghuo\.xfyun\.cn/], ["Hunyuan", /hunyuan\.tencent\.com/],
  ["Baichuan", /assistant\.baichuan\.com/], ["Jupi", /jupi\.io/],
  ["Coze", /(^|\/\/)coze\.(com|cn)/], ["SciSpace", /scispace\.com/],
  ["Moonshot", /moonshot\.cn/], ["Morph", /themorph\.ai/],
  ["AISearch", /(^|\/\/)aisearch\.com/],
  ["Llama", /(^|\/\/)llama\.com/], ["Sider", /sider\.ai/],
  ["MyShell", /myshell\.ai/], ["TheB.AI", /(^|\/\/)theb\.ai/],
  ["Wonderseek", /wonderseek\.com/], ["Felo", /felo\.ai/],
  ["Writesonic", /writesonic\.com/], ["Jasper", /(^|\/\/)jasper\.ai/],
  ["Consensus", /consensus\.app/], ["ChatHub", /chathub\.gg/],
];
const providerName = (url) => (PROVIDERS.find(([, re]) => re.test(url || "")) || [])[0];
const isProviderTab = (url) => PROVIDERS.some(([, re]) => re.test(url || ""));

const $ = (id) => document.getElementById(id);
const send = (msg, cb) => chrome.runtime.sendMessage(msg, cb);

// ── header ────────────────────────────────────────────────────────────────
$("version").textContent = "v" + chrome.runtime.getManifest().version;
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  $("provider-tag").textContent = providerName(tab && tab.url) || "Ready";
});

// ── status rendering ────────────────────────────────────────────────────────
function paint(s) {
  s = s || {};
  const servers = s.servers || [];
  const anyUp = servers.some((x) => x.alive);
  const mcpUp = s.connected && (s.mcpAlive || anyUp || s.tools > 0);
  const studioMissing = mcpUp && s.studio === false;
  const good = mcpUp && !studioMissing;

  $("status-dot").className = s.connected ? (good ? "up" : "mid") : "";
  $("status-text").textContent = !s.connected
    ? "Bridge offline"
    : good
    ? "Connected · Roblox Studio ready"
    : studioMissing
    ? "Studio not connected · enable its MCP server"
    : "Bridge OK · open Roblox Studio";
  $("tool-count").textContent = s.connected ? `${s.tools || 0} tools available` : "Run start.bat to launch the bridge";
  $("server-list").textContent = s.connected
    ? servers.map((x) => `${x.alive ? "●" : "○"} ${x.id} (${x.alive ? x.tools + " tools" : "down"})`).join("\n")
    : "";

  const up = $("update-row");
  if (up) up.hidden = !s.updateAvailable;
  const upTag = $("update-tag");
  if (upTag) upTag.textContent = s.updateTag ? ` v${s.updateTag.replace(/^[vV]/, "")}` : "";
}

const poll = () => send({ type: "status" }, (s) => s && paint(s));

// ── actions ─────────────────────────────────────────────────────────────────
$("btn-reconnect").onclick = () => send({ type: "reconnect" }, () => setTimeout(poll, 600));

$("btn-restart").onclick = (e) => {
  const label = e.currentTarget.querySelector ? e.currentTarget : e.target;
  const original = label.innerHTML;
  label.textContent = "Restarting…";
  send({ type: "restart_mcp" }, () => {
    label.innerHTML = original;
    setTimeout(poll, 600);
  });
};

$("btn-site").onclick = () => chrome.tabs.create({ url: LINKS.site });

const btnUpdate = $("btn-update");
if (btnUpdate) btnUpdate.onclick = () => chrome.tabs.create({ url: LINKS.releases });

// Settings opens the in-page panel on an already-open supported AI tab (so it
// works before a session is started); otherwise it opens the default AI.
$("btn-settings").onclick = () => {
  chrome.tabs.query({}, (tabs) => {
    const target =
      tabs.find((t) => t.active && isProviderTab(t.url)) ||
      tabs.find((t) => isProviderTab(t.url));
    if (target) {
      chrome.tabs.sendMessage(target.id, { type: "vs-open-menu" });
      chrome.tabs.update(target.id, { active: true });
    } else {
      chrome.tabs.create({ url: LINKS.fallbackAI });
    }
  });
};

// ── live updates ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "vs-status") paint(msg);
});
poll();
setInterval(poll, 2000);

// ── session timeline ────────────────────────────────────────────────────────
// Renders the last ~18 recorded agent actions (tools, edits, screenshots,
// errors, session start/stop) across conversations, newest first.
const tlList = $("tl-list");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
function fmtTime(t) {
  const d = new Date(t);
  return String(d.getHours()).padStart(2, "0") + ":" +
         String(d.getMinutes()).padStart(2, "0") + ":" +
         String(d.getSeconds()).padStart(2, "0");
}
function tlLabel(e) {
  switch (e.type) {
    case "session_start": return '<span class="tl-evt">▶ session started</span>';
    case "session_stop":  return '<span class="tl-evt">■ session stopped</span>';
    case "shot":          return `<span class="tl-ok">📷 screenshot</span> <span class="tl-conv">${esc(e.tool || "")}</span>`;
    case "tool":
      if (e.ok) return `<span class="tl-ok">⚙ ${esc(e.name || "")} ✓</span>`;
      return `<span class="tl-err">⚙ ${esc(e.name || "")} ✗</span> <span class="tl-conv">${esc((e.err || "").slice(0, 26))}</span>`;
    default: return esc(e.type || "");
  }
}
function renderTimeline() {
  chrome.storage.local.get("vsTimeline", (r) => {
    const arr = (r && r.vsTimeline) || [];
    const recent = arr.slice(-18).reverse();
    tlList.innerHTML = recent.map((e) =>
      `<div class="tl-item"><span class="tl-t">${fmtTime(e.t)}</span><span>${tlLabel(e)}</span></div>`
    ).join("");
  });
}
renderTimeline();
setInterval(renderTimeline, 3000);

// ── provider leaderboard ────────────────────────────────────────────────────
// Ranks providers by build tool success rate (tools completed vs errored across
// sessions), so the user can pick the model that actually builds best for them.
function renderLeaderboard() {
  chrome.storage.local.get("vsLeaderboard", (r) => {
    const lb = (r && r.vsLeaderboard) || {};
    const rows = Object.values(lb)
      .filter((e) => e.runs > 0)
      .map((e) => ({ name: e.name, runs: e.runs, ok: e.ok || 0, err: e.err || 0,
                    rate: ((e.ok || 0) + (e.err || 0)) ? (e.ok / ((e.ok || 0) + (e.err || 0))) : 0 }))
      .sort((a, b) => b.rate - a.rate || b.runs - a.runs)
      .slice(0, 5);
    if (!rows.length) return;
    $("lb").innerHTML = rows.map((e, i) =>
      `<div class="lb-row">
         <span class="lb-rank">${i + 1}</span>
         <span class="lb-name">${esc(e.name)}</span>
         <span class="lb-meta">${e.runs} run${e.runs === 1 ? "" : "s"} · <span class="lb-rate">${Math.round(e.rate * 100)}%</span></span>
       </div>
       <div class="lb-bar"><div class="lb-fill" style="width:${Math.round(e.rate * 100)}%"></div></div>`
    ).join("");
  });
}
renderLeaderboard();
setInterval(renderLeaderboard, 4000);
