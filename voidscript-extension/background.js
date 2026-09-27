// SPDX-License-Identifier: GPL-3.0-or-later
// background.js - service worker.
// Owns ONE resilient WebSocket to the local bridge (ws://127.0.0.1:PORT).
// Keeping the socket here (not in the content script) avoids https→ws mixed
// content issues and centralises reconnect / timeout logic.
//
// Contract with content.js: every sendMessage ALWAYS gets a response object,
// even when the bridge is offline. The agentic loop must never hang waiting.

const PORT = 17613;
const URL = `ws://127.0.0.1:${PORT}`;

// Optional shared bridge secret (matches bridge.py VS_BRIDGE_TOKEN). Read from
// storage; appended to the socket URL as ?token=... so the bridge can enforce
// it. Empty = no token (the default). A non-default value is only useful when
// the user also sets VS_BRIDGE_TOKEN when launching the bridge.
let bridgeToken = "";
try {
  chrome.storage.local.get("vsBridgeToken", (r) => {
    if (r && r.vsBridgeToken) bridgeToken = String(r.vsBridgeToken).slice(0, 128);
  });
} catch {}

// ── Update check (GitHub releases) ─────────────────────────────────────────
// The extension cannot replace its own unpacked files - the actual update is
// done by update.bat / update.py. This only detects a newer release and lets
// the popup + in-page menu show an "update available" notice.
const UPDATE_API = "https://api.github.com/repos/cjl26rg2/Void-Script/releases/latest";
const UPDATE_RELEASES_URL = "https://github.com/cjl26rg2/Void-Script/releases";
const UPDATE_CHECK_MS = 24 * 60 * 60 * 1000; // re-check at most once a day
// Latest release tag we already told the user about. Persisted so a reload of
// the extension doesn't immediately re-announce the same version.
let vsUpdateTag = "";
let vsUpdateTimer = null;

function semverParts(v) {
  return String(v || "")
    .replace(/^[vV]/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
}

function isNewerTag(tag, current) {
  const a = semverParts(tag);
  const b = semverParts(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

async function checkForUpdate() {
  try {
    // Remember what we already announced so a fresh worker doesn't spam it.
    const stored = await chrome.storage.local.get("vsUpdateTag");
    const announced = (stored && stored.vsUpdateTag) || "";
    const resp = await fetch(UPDATE_API, { cache: "no-store" });
    if (!resp.ok) return;
    const data = await resp.json();
    const tag = String(data.tag_name || "");
    if (!tag) return;
    vsUpdateTag = tag;
    const current = chrome.runtime.getManifest().version;
    const available = isNewerTag(tag, current);
    if (available && announced !== tag) {
      try { await chrome.storage.local.set({ vsUpdateTag: tag }); } catch {}
    }
    broadcastStatus();
  } catch {
    // Offline / rate-limited: stay quiet.
  }
}

function scheduleUpdateCheck() {
  clearTimeout(vsUpdateTimer);
  vsUpdateTimer = setTimeout(() => { checkForUpdate(); scheduleUpdateCheck(); }, UPDATE_CHECK_MS);
}

function currentUpdate() {
  const current = chrome.runtime.getManifest().version;
  return vsUpdateTag && isNewerTag(vsUpdateTag, current) ? vsUpdateTag : "";
}

// Chat sites where a VoidScript provider content script runs. Status pushes go
// to every tab matching these. Add the new provider's URL pattern here (and in
// manifest.json content_scripts + host_permissions) when integrating another AI.
const PROVIDER_URLS = ["https://chat.deepseek.com/*", "https://gemini.google.com/*", "https://kimi.ai/*", "https://www.kimi.com/*", "https://kimi.com/*", "https://chat.z.ai/*", "https://chat.qwen.ai/*", "https://arena.ai/*", "https://www.meta.ai/*", "https://meta.ai/*", "https://chatgpt.com/*", "https://chat.openai.com/*", "https://grok.com/*", "https://www.perplexity.ai/*", "https://perplexity.ai/*", "https://copilot.microsoft.com/*", "https://chat.mistral.ai/*", "https://poe.com/*", "https://huggingface.co/chat/*", "https://www.phind.com/*", "https://www.blackbox.ai/*", "https://you.com/*", "https://groq.com/*", "https://lmarena.ai/*", "https://www.doubao.com/*", "https://yuanbao.tencent.com/*", "https://chat.reka.ai/*", "https://pi.ai/*", "https://coral.cohere.com/*", "https://openrouter.ai/*", "https://v0.app/*", "https://v0.dev/*", "https://www.genspark.ai/*", "https://lambda.chat/*", "https://yiyan.baidu.com/*", "https://chat.minimax.io/*", "https://manus.im/*", "https://chat.together.ai/*", "https://chatai.commander.ai/*", "https://levera.ai/*", "https://mage.space/*", "https://friend.com/*", "https://app.humane.com/*", "https://bolt.new/*", "https://bolt.ai/*", "https://www.perplexity.ai/*", "https://perplexity.ai/*", "https://windsurf.ai/*", "https://pool.smallstep.com/*", "https://ramp.com/*", "https://www.phind.com/*", "https://phind.com/*", "https://copilot.microsoft.com/*", "https://chat.mistral.ai/*", "https://poe.com/*", "https://huggingface.co/chat/*", "https://grok.com/*", "https://chat.reka.ai/*", "https://pi.ai/*", "https://coral.cohere.com/*", "https://openrouter.ai/*", "https://v0.app/*", "https://v0.dev/*", "https://www.genspark.ai/*", "https://lambda.chat/*", "https://yiyan.baidu.com/*", "https://chat.minimax.io/*", "https://manus.im/*", "https://chat.together.ai/*", "https://lmarena.ai/*", "https://www.doubao.com/*", "https://yuanbao.tencent.com/*", "https://moonshot.cn/*", "https://jupi.io/*", "https://wonderseek.com/*", "https://replicate.com/*"];

const RECONNECT_MIN = 1000;
const RECONNECT_MAX = 5000;
const HEARTBEAT_MS = 10000;
// If no message (incl. pong) arrives within this window while we believe we're
// connected, the socket is half-open: force a reconnect instead of letting
// pending requests slowly time out.
const STALE_SOCKET_MS = 25000;
const REQUEST_TIMEOUT_DEFAULT = 130000; // a bit above the 120s tool timeout

let ws = null;
let connected = false;
let reconnectDelay = RECONNECT_MIN;
let reconnectTimer = null;
let heartbeatTimer = null;
let lastMessageAt = 0; // timestamp of the last frame received from the bridge
let nextId = 1;
const pending = new Map(); // id -> {resolve, timer}
let toolsCache = [];
let mcpAlive = false;
let serversCache = [];
// true/false = a PLACE is loaded and usable in Roblox Studio; null = unknown.
// The MCP process stays alive when Studio is closed or its MCP option is off,
// so this is probed separately (bridge "studio_status").
let studioConnected = null;
// true/false = a Roblox Studio app is connected to the MCP server at all; null =
// unknown. studioApp=true with studioConnected=false means "Studio open but no
// place"; studioApp=false means "Studio closed OR its MCP option disabled".
let studioApp = null;
// true/false = a Roblox Studio WINDOW/PROCESS exists on this machine (checked
// bridge-side via tasklist); null = unknown/old bridge. Distinguishes the two
// studioApp=false sub-cases the UI must word differently: Studio genuinely not
// launched ("open Roblox Studio") vs Studio OPEN but its MCP plugin never
// registered with the bridge - the documented fix for the latter is opening
// Assistant Settings > MCP Servers inside Studio (validated live 3x), which
// "open Roblox Studio" wording completely fails to convey.
let studioProc = null;
// Name of the currently open place (Feature: per-project prompts / bar label).
let placeName = null;

function log(...a) {
  console.log("[vs-bg]", ...a);
}

// ── WebSocket lifecycle ─────────────────────────────────────────────────
function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  clearTimeout(reconnectTimer);
  let socketUrl = URL;
  const t = bridgeToken ? bridgeToken.replace(/[^A-Za-z0-9._-]/g, "") : "";
  if (t) socketUrl += "?token=" + encodeURIComponent(t);
  try {
    ws = new WebSocket(socketUrl);
  } catch (e) {
    log("WebSocket ctor failed", e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    connected = true;
    reconnectDelay = RECONNECT_MIN;
    lastMessageAt = Date.now();
    log("connected to bridge");
    startHeartbeat();
    broadcastStatus();
  };

  ws.onmessage = (ev) => {
    lastMessageAt = Date.now();
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    handleBridgeMessage(msg);
  };

  ws.onclose = () => {
    connected = false;
    mcpAlive = false;
    studioConnected = null;
    studioApp = null;
    studioProc = null;
    serversCache = [];
    stopHeartbeat();
    failAllPending("bridge connection closed");
    broadcastStatus();
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose will follow; nothing to do here but avoid an unhandled error.
    try { ws.close(); } catch {}
  };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 1.7, RECONNECT_MAX);
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (connected) {
      // Half-open socket: the WS still reports OPEN but nothing comes through.
      // The pong (and every other frame) refreshes lastMessageAt; if it has
      // gone stale, drop the dead socket so onclose triggers a reconnect.
      if (lastMessageAt && Date.now() - lastMessageAt > STALE_SOCKET_MS) {
        log("socket stale, forcing reconnect");
        try { ws.close(); } catch {}
        return;
      }
      // Keeps the MV3 service worker alive AND detects a half-open socket.
      send({ type: "ping" }).catch(() => {});
      refreshStudioStatus();
    }
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

// Resolve once the socket is OPEN, or false after `timeout` ms.
function waitForConnection(timeout = 8000) {
  return new Promise((resolve) => {
    if (connected && ws && ws.readyState === WebSocket.OPEN) return resolve(true);
    connect(); // nudge a (re)connection - important after a worker wake-up
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (connected && ws && ws.readyState === WebSocket.OPEN) {
        clearInterval(iv);
        resolve(true);
      } else if (Date.now() - t0 > timeout) {
        clearInterval(iv);
        resolve(false);
      }
    }, 100);
  });
}

// ── request/response over the socket ────────────────────────────────────
async function send(obj, timeout = REQUEST_TIMEOUT_DEFAULT) {
  // The MV3 service worker can be suspended; the first message after a wake-up
  // arrives before the socket has re-opened. Wait for it instead of failing -
  // otherwise Kimi wrongly hears "bridge offline".
  if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
    await waitForConnection(8000);
  }
  return new Promise((resolve) => {
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
      resolve({ ok: false, kind: "disconnected", error: "bridge not connected" });
      return;
    }
    const id = nextId++;
    const payload = { ...obj, id };
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ ok: false, kind: "timeout", error: "bridge did not respond in time" });
      }
    }, timeout);
    pending.set(id, { resolve, timer });
    try {
      ws.send(JSON.stringify(payload));
    } catch (e) {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ ok: false, kind: "disconnected", error: String(e) });
    }
  });
}

// Ask the bridge whether a Roblox Studio instance is actually connected to the
// MCP server. Broadcasts only on change so the UI updates promptly but quietly.
let studioProbing = false;
async function refreshStudioStatus() {
  if (studioProbing || !connected) return;
  studioProbing = true;
  try {
    const r = await send({ type: "studio_status" }, 12000);
    const v = r && r.ok && typeof r.studio === "boolean" ? r.studio : null;
    if (v !== studioConnected) {
      studioConnected = v;
      broadcastStatus();
    }
  } finally {
    studioProbing = false;
  }
}

function handleBridgeMessage(msg) {
  if ("studio" in msg && (typeof msg.studio === "boolean" || msg.studio === null)) {
    studioConnected = msg.studio;
  }
  if ("studio_app" in msg && (typeof msg.studio_app === "boolean" || msg.studio_app === null)) {
    studioApp = msg.studio_app;
  }
  if ("studio_proc" in msg && (typeof msg.studio_proc === "boolean" || msg.studio_proc === null)) {
    studioProc = msg.studio_proc;
  }
  if ("place_name" in msg && typeof msg.place_name === "string") {
    if (placeName !== msg.place_name) {
      placeName = msg.place_name;
      broadcastStatus();
    }
  }
  if (msg.type === "studio_status") {
    resolvePending(msg.id, { ok: true, studio: studioConnected });
    broadcastStatus();
    return;
  }
  if (msg.type === "connected") {
    mcpAlive = !!msg.mcp_alive;
    if (Array.isArray(msg.tools)) toolsCache = msg.tools;
    if (Array.isArray(msg.servers)) serversCache = msg.servers;
    broadcastStatus();
    return;
  }
  if (msg.type === "pong") {
    resolvePending(msg.id, { ok: true });
    return;
  }
  if (msg.type === "diagnostics") {
    resolvePending(msg.id, msg);
    return;
  }
  if (msg.type === "backup_place" || msg.type === "backup_restore" || msg.type === "backup_delete") {
    resolvePending(msg.id, { ok: !!msg.ok, error: msg.error || null, path: msg.path, message: msg.message });
    return;
  }
  if (msg.type === "backup_list") {
    resolvePending(msg.id, { ok: true, backups: msg.backups || [] });
    return;
  }
  if (msg.type === "log_written") {
    resolvePending(msg.id, { ok: !!msg.ok, error: msg.error || null });
    return;
  }
  if (msg.type === "tools") {
    if (Array.isArray(msg.tools)) toolsCache = msg.tools;
    if (Array.isArray(msg.servers)) serversCache = msg.servers;
    mcpAlive = !!msg.mcp_alive;
    resolvePending(msg.id, { ok: true, tools: toolsCache });
    broadcastStatus();
    return;
  }
  if (msg.type === "tool_result") {
    resolvePending(msg.id, msg.ok
      ? { ok: true, text: msg.text, images: msg.images || [] }
      : { ok: false, kind: msg.kind, error: msg.error });
    return;
  }
  if (msg.type === "mcp_status") {
    mcpAlive = !!msg.alive;
    if (Array.isArray(msg.tools)) toolsCache = msg.tools;
    if (Array.isArray(msg.servers)) serversCache = msg.servers;
    resolvePending(msg.id, { ok: !!msg.ok, alive: msg.alive, error: msg.error });
    broadcastStatus();
    return;
  }
  if (msg.type === "server_changed") {
    // The bridge acks, then restarts itself to reload config.json. The socket
    // will drop right after this - the content script shows a spinner until the
    // reconnect lands and a fresh status arrives.
    resolvePending(msg.id, { ok: !!msg.ok, error: msg.error, restarting: !!msg.restarting });
    return;
  }
  if (msg.type === "error") {
    resolvePending(msg.id, { ok: false, error: msg.error });
    return;
  }
}

function resolvePending(id, value) {
  const p = pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(id);
  p.resolve(value);
}

function failAllPending(reason) {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.resolve({ ok: false, kind: "disconnected", error: reason });
  }
  pending.clear();
}

// ── status push to any open DeepSeek tab + popup ─────────────────────────
function statusObj() {
  const updateTag = currentUpdate();
  return { type: "vs-status", connected, mcpAlive, studio: studioConnected, studioApp, studioProc, placeName, tools: toolsCache.length, servers: serversCache, updateAvailable: !!updateTag, updateTag };
}

function broadcastStatus() {
  chrome.runtime.sendMessage(statusObj()).catch(() => {});
  chrome.tabs.query({ url: PROVIDER_URLS }, (tabs) => {
    for (const t of tabs) chrome.tabs.sendMessage(t.id, statusObj()).catch(() => {});
  });
}

// ── messages from content.js / popup.js ─────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "status":
        if (!connected) connect(); // self-heal after a worker wake-up
        sendResponse(statusObj());
        break;
      case "list_tools": {
        // Prefer a live refresh; fall back to cache so the loop never stalls.
        // 10s, not 25s: a catalogue request only blocks this long when one of the
        // MCP servers is dead (typically Roblox in a degraded, Blender-only
        // session), and in that exact case we already hold a perfectly good cached
        // catalogue. Waiting the full 25s just froze the boot for no new data.
        const r = await send({ type: "list_tools" }, 10000);
        if (r.ok) sendResponse({ ok: true, tools: r.tools });
        else sendResponse({ ok: toolsCache.length > 0, tools: toolsCache, error: r.error });
        break;
      }
      case "call_tool": {
        const timeout = (msg.timeout || 120000) + 10000;
        const r = await send(
          { type: "call_tool", name: msg.name, arguments: msg.arguments, timeout: msg.timeout },
          timeout
        );
        sendResponse(r);
        break;
      }
      case "restart_mcp": {
        const r = await send({ type: "restart_mcp" }, 30000);
        sendResponse(r);
        break;
      }
      case "add_server": {
        const r = await send({
          type: "add_server", server_id: msg.server_id,
          command: msg.command, args: msg.args, env: msg.env,
        }, 15000);
        sendResponse(r);
        break;
      }
      case "remove_server": {
        const r = await send({ type: "remove_server", server_id: msg.server_id }, 15000);
        sendResponse(r);
        break;
      }
      case "diagnostics": {
        const r = await send({ type: "diagnostics" }, 20000);
        if (r.ok) sendResponse({ ok: true, diagnostics: r });
        else sendResponse({ ok: false, error: r.error });
        break;
      }
      case "backup_place": {
        const r = await send({ type: "backup_place" }, 45000);
        sendResponse({ ok: !!r.ok, error: r.error || null, path: r.path || null });
        break;
      }
      case "list_backups": {
        const r = await send({ type: "list_backups" }, 15000);
        sendResponse({ ok: !!r.ok, backups: r.backups || [] });
        break;
      }
      case "restore_backup": {
        const r = await send({ type: "restore_backup", name: msg.name }, 20000);
        sendResponse({ ok: !!r.ok, error: r.error || null, message: r.message || null });
        break;
      }
      case "delete_backup": {
        const r = await send({ type: "delete_backup", name: msg.name }, 15000);
        sendResponse({ ok: !!r.ok, error: r.error || null });
        break;
      }
      case "startup_status": {
        const r = await send({ type: "startup_status" }, 8000);
        sendResponse({ ok: !!r.ok, enabled: !!r.enabled, error: r.error || null });
        break;
      }
      case "startup_enable": {
        const r = await send({ type: "startup_enable" }, 8000);
        sendResponse({ ok: !!r.ok, error: r.error || null, message: r.message || null });
        break;
      }
      case "startup_disable": {
        const r = await send({ type: "startup_disable" }, 8000);
        sendResponse({ ok: !!r.ok, error: r.error || null, message: r.message || null });
        break;
      }
      case "write_log": {
        const r = await send({ type: "write_log", text: msg.text || "" }, 15000);
        sendResponse({ ok: !!r.ok, error: r.error || null });
        break;
      }
      case "notify": {
        // System notification for a hidden-tab session end (Feature).
        try {
          await chrome.notifications.create("", {
            type: "basic",
            iconUrl: chrome.runtime.getURL("icon.png"),
            title: String(msg.title || "VoidScript"),
            message: String(msg.message || ""),
            priority: 1,
          });
        } catch {}
        sendResponse({ ok: true });
        break;
      }
      case "reconnect":
        reconnectDelay = RECONNECT_MIN;
        connect();
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true; // async sendResponse
});

// Wake/keepalive hooks.
chrome.runtime.onStartup.addListener(() => { connect(); checkForUpdate(); scheduleUpdateCheck(); });
chrome.runtime.onInstalled.addListener(() => { connect(); checkForUpdate(); scheduleUpdateCheck(); });

connect();
checkForUpdate();
scheduleUpdateCheck();
