// SPDX-License-Identifier: GPL-3.0-or-later
const KOFI_URL = "https://ko-fi.com/sebattfg";
const SUPPORTED_HOSTS = [
  "chat.deepseek.com", "deepseek.com", "gemini.google.com", "www.kimi.com", "kimi.com",
  "chat.z.ai", "chat.qwen.ai", "arena.ai", "www.meta.ai", "meta.ai",
  // Beta providers (generic adapter — see providers/_generic.js).
  "chatgpt.com", "chat.openai.com", "grok.com", "www.perplexity.ai", "perplexity.ai",
  "copilot.microsoft.com", "chat.mistral.ai",
  "poe.com", "huggingface.co", "www.phind.com", "www.blackbox.ai", "you.com",
  "groq.com", "lmarena.ai", "www.doubao.com", "yuanbao.tencent.com", "chat.reka.ai",
];
const DEFAULT_AI_URL = "https://chat.deepseek.com/";

document.getElementById("ver").textContent = `v${chrome.runtime.getManifest().version}`;

// Map a supported host to its display name for the header pill, so the popup
// reflects whichever AI the user is actually on instead of a hardcoded label.
const HOST_LABELS = [
  [/deepseek\.com/, "DeepSeek"], [/gemini\.google\.com/, "Gemini"],
  [/kimi\.com/, "Kimi"], [/z\.ai/, "GLM"], [/qwen\.ai/, "Qwen"],
  [/arena\.ai/, "Arena"], [/meta\.ai/, "Meta AI"],
  [/chatgpt\.com|openai\.com/, "ChatGPT"], [/grok\.com/, "Grok"],
  [/perplexity\.ai/, "Perplexity"], [/copilot\.microsoft\.com/, "Copilot"],
  [/mistral\.ai/, "Mistral"],
  [/poe\.com/, "Poe"], [/huggingface\.co/, "HuggingChat"], [/phind\.com/, "Phind"],
  [/blackbox\.ai/, "Blackbox"], [/you\.com/, "You"], [/groq\.com/, "Groq"],
  [/lmarena\.ai/, "LMArena"], [/doubao\.com/, "Doubao"],
  [/yuanbao\.tencent\.com/, "Yuanbao"], [/reka\.ai/, "Reka"],
];
function setProviderLabel() {
  const el = document.getElementById("prov");
  if (!el) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = (tabs && tabs[0] && tabs[0].url) || "";
    const hit = HOST_LABELS.find(([re]) => re.test(url));
    el.textContent = hit ? hit[1] : "Ready";
  });
}
setProviderLabel();

function render(s) {
  const dot = document.getElementById("dot");
  const state = document.getElementById("state");
  const tools = document.getElementById("tools");
  const servers = document.getElementById("servers");
  const list = s.servers || [];
  const up = list.filter((x) => x.alive).length;
  const mcpOk = s.connected && (s.mcpAlive || up > 0 || s.tools > 0);
  const studioOff = mcpOk && s.studio === false; // MCP up but no Studio attached
  const ok = mcpOk && !studioOff;
  dot.className = "dot " + (s.connected ? (ok ? "on" : "warn") : "");
  state.textContent = s.connected
    ? (ok ? "Connected · Roblox Studio ready"
        : studioOff ? "Studio not connected · enable the MCP server in Studio"
        : "Bridge OK · open Roblox Studio")
    : "Bridge offline";
  tools.textContent = s.connected ? `${s.tools || 0} tools available` : "Run bridge.py";
  servers.textContent = s.connected
    ? list.map((x) => `${x.alive ? "●" : "○"} ${x.id} (${x.alive ? x.tools + " tools" : "down"})`).join("\n")
    : "";
}

function refresh() {
  chrome.runtime.sendMessage({ type: "status" }, (s) => s && render(s));
}

document.getElementById("reconnect").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "reconnect" }, () => setTimeout(refresh, 600));
});
document.getElementById("restart").addEventListener("click", (e) => {
  e.target.textContent = "Restarting…";
  chrome.runtime.sendMessage({ type: "restart_mcp" }, () => {
    e.target.textContent = "⟳ Restart Roblox server";
    setTimeout(refresh, 600);
  });
});
document.getElementById("kofi").addEventListener("click", () => {
  chrome.tabs.create({ url: KOFI_URL });
});
document.getElementById("settings").addEventListener("click", () => {
  // Same mechanism as the Ko-fi button (chrome.tabs), but tries the in-page
  // panel on an already-open supported AI tab first, so opening it doesn't
  // require a conversation to already be started there.
  chrome.tabs.query({}, (tabs) => {
    const active = tabs.find((t) => t.active && t.url && SUPPORTED_HOSTS.some((h) => t.url.includes(h)));
    const anySupported = active || tabs.find((t) => t.url && SUPPORTED_HOSTS.some((h) => t.url.includes(h)));
    if (anySupported) {
      chrome.tabs.sendMessage(anySupported.id, { type: "zs-open-menu" });
      chrome.tabs.update(anySupported.id, { active: true });
    } else {
      chrome.tabs.create({ url: DEFAULT_AI_URL });
    }
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "zs-status") render(msg);
});
refresh();
setInterval(refresh, 2000);
