// SPDX-License-Identifier: GPL-3.0-or-later
// VoidScript background service worker (self-made, clean-room rebuild — Phase 2).
//
// Owns the single WebSocket to the local bridge (rebuild/bridge.py) and relays
// between it and the rest of the extension. Keeping the socket here (not in a
// content script) avoids https->ws mixed-content blocking on the AI pages.
//
// Bridge protocol (see ../REBUILD.md): we send hello/list_tools/call/ping/
// restart; the bridge replies ready/tools/result/pong/restarted and broadcasts
// status. Extension-facing message API (chrome.runtime):
//   popup    -> bg : {type:"status"}       -> status object (sendResponse)
//   popup    -> bg : {type:"reconnect"}    -> {ok}
//   popup    -> bg : {type:"restart_mcp"}  -> {ok}
//   content  -> bg : {type:"vs-tools"}     -> {tools}
//   content  -> bg : {type:"vs-call", tool, params} -> {ok, output}
//   bg -> popup/content (broadcast) : {type:"zs-status", ...status}
//
// MV3 note: a service worker is torn down when idle. We use chrome.alarms to
// wake it, re-open the socket, and ping. Requires "alarms" in the manifest at
// cutover (this file is staged in rebuild/ and not yet wired into manifest.json).

const BRIDGE_URL = "ws://127.0.0.1:17613";
const CALL_TIMEOUT_MS = 130000;
const RECONNECT_MS = 3000;

let socket = null;
let tools = [];
let status = { connected: false, studio: false, tools: 0, servers: [] };
let nextId = 1;
const pending = new Map(); // call id -> {resolve, timer}
let reconnectTimer = null;

// ── socket lifecycle ────────────────────────────────────────────────────────
function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(reconnectTimer);
  try {
    socket = new WebSocket(BRIDGE_URL);
  } catch {
    scheduleReconnect();
    return;
  }
  socket.onopen = () => send({ type: "hello", version: version() });
  socket.onmessage = (ev) => dispatch(ev.data);
  socket.onclose = () => {
    setStatus({ connected: false, studio: false, tools: 0, servers: [] });
    scheduleReconnect();
  };
  socket.onerror = () => { try { socket.close(); } catch {} };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, RECONNECT_MS);
}

function send(obj) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

// ── incoming bridge messages ────────────────────────────────────────────────
function dispatch(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  switch (msg.type) {
    case "ready":
      tools = msg.tools || [];
      setStatus({ connected: true, studio: !!msg.studio, tools: tools.length, servers: msg.servers || [] });
      break;
    case "tools":
      tools = msg.tools || [];
      break;
    case "status":
    case "pong":
    case "restarted":
      setStatus({
        connected: msg.connected !== false,
        studio: !!msg.studio,
        tools: msg.tools || 0,
        servers: msg.servers || [],
      });
      // The tool LIST can lag behind the count (e.g. the bridge finished booting
      // its MCP servers after our initial hello). If the reported count differs
      // from what we cached, re-fetch the full list so callers get real tools.
      if ((msg.tools || 0) !== tools.length) send({ type: "list_tools" });
      break;
    case "result": {
      const p = pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(msg.id);
        p.resolve({ ok: !!msg.ok, output: msg.output != null ? msg.output : "" });
      }
      break;
    }
    default:
      break; // forward-compatible: ignore unknown types
  }
}

function setStatus(s) {
  status = s;
  broadcast({ type: "zs-status", ...status });
}

function broadcast(obj) {
  // No-op if nothing is listening (popup closed) — swallow the resulting error.
  try { chrome.runtime.sendMessage(obj, () => void chrome.runtime.lastError); } catch {}
}

function version() {
  try { return chrome.runtime.getManifest().version; } catch { return "?"; }
}

// ── tool calls (content script -> bridge -> result) ─────────────────────────
function callTool(tool, params) {
  return new Promise((resolve) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      resolve({ ok: false, output: "bridge offline" });
      return;
    }
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, output: "tool call timed out" });
    }, CALL_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    send({ type: "call", id, tool, params: params || {} });
  });
}

// ── extension message API ───────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case "status":
      connect(); // opening the popup is a good moment to ensure we're connected
      sendResponse(status);
      return; // sync response
    case "reconnect":
      try { if (socket) socket.close(); } catch {}
      connect();
      sendResponse({ ok: true });
      return;
    case "restart_mcp":
      send({ type: "restart", server: "roblox" });
      sendResponse({ ok: true });
      return;
    case "vs-tools":
      sendResponse({ tools });
      return;
    case "vs-call":
      callTool(msg.tool, msg.params).then(sendResponse);
      return true; // async: keep the channel open
    default:
      return;
  }
});

// ── keep-alive / wake ───────────────────────────────────────────────────────
if (chrome.alarms) {
  chrome.alarms.create("vs-keepalive", { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name !== "vs-keepalive") return;
    if (!socket || socket.readyState === WebSocket.CLOSED) connect();
    else send({ type: "ping" });
  });
}

connect();
