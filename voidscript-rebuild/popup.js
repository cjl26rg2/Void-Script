// SPDX-License-Identifier: GPL-3.0-or-later
// VoidScript popup: shows bridge/Studio status and exposes reconnect, restart,
// settings, website and tip actions. Talks to background.js over the same
// message protocol the rest of the extension uses ("status" / "reconnect" /
// "restart_mcp" requests, "zs-status" broadcasts, "zs-open-menu" to a tab).

const LINKS = {
  site: "https://void-script.vercel.app/",
  kofi: "https://ko-fi.com/sebattfg",
  fallbackAI: "https://chat.deepseek.com/",
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
$("btn-kofi").onclick = () => chrome.tabs.create({ url: LINKS.kofi });

// Settings opens the in-page panel on an already-open supported AI tab (so it
// works before a session is started); otherwise it opens the default AI.
$("btn-settings").onclick = () => {
  chrome.tabs.query({}, (tabs) => {
    const target =
      tabs.find((t) => t.active && isProviderTab(t.url)) ||
      tabs.find((t) => isProviderTab(t.url));
    if (target) {
      chrome.tabs.sendMessage(target.id, { type: "zs-open-menu" });
      chrome.tabs.update(target.id, { active: true });
    } else {
      chrome.tabs.create({ url: LINKS.fallbackAI });
    }
  });
};

// ── live updates ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "zs-status") paint(msg);
});
poll();
setInterval(poll, 2000);
