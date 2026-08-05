// SPDX-License-Identifier: GPL-3.0-or-later
// Unit test for rebuild/background.js: loads it with a mocked WebSocket + chrome
// and drives the relay logic (hello handshake, status, tool-call correlation,
// the popup/content message API). Run: node rebuild/test_background.js
const fs = require("fs");
const vm = require("vm");
const path = require("path");

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("PASS  " + m)) : (fail++, console.log("FAIL  " + m)));
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── mocks ───────────────────────────────────────────────────────────────────
class MockWS {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  constructor(url) { this.url = url; this.readyState = MockWS.CONNECTING; this.sent = []; MockWS.last = this; }
  send(d) { this.sent.push(JSON.parse(d)); }
  close() { this.readyState = MockWS.CLOSED; if (this.onclose) this.onclose(); }
  _open() { this.readyState = MockWS.OPEN; if (this.onopen) this.onopen(); }
  _recv(obj) { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }
}
globalThis.WebSocket = MockWS;

const broadcasts = [];
let onMsg = null;
globalThis.chrome = {
  runtime: {
    onMessage: { addListener: (fn) => { onMsg = fn; } },
    sendMessage: (obj) => { broadcasts.push(obj); },
    getManifest: () => ({ version: "2.0" }),
    lastError: null,
  },
  alarms: { create() {}, onAlarm: { addListener() {} } },
};

// load + execute background.js in this context (its connect() runs immediately)
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "background.js"), "utf8"));

async function main() {
  const ws = MockWS.last;
  ok(!!ws && ws.url.includes("17613"), "opens a socket to the bridge on load");

  ws._open();
  ok(ws.sent[0] && ws.sent[0].type === "hello", "sends 'hello' on open");

  ws._recv({ type: "ready", tools: [{ name: "echo" }], studio: true, servers: [{ id: "roblox", alive: true, tools: 1 }] });
  const st = broadcasts.find((b) => b.type === "zs-status" && b.connected);
  ok(st && st.studio === true && st.tools === 1, "'ready' updates + broadcasts status");

  // popup asks for status
  let statusResp = null;
  onMsg({ type: "status" }, {}, (r) => (statusResp = r));
  ok(statusResp && statusResp.connected === true && statusResp.tools === 1, "status request returns cached status");

  // content script asks for the tool list (async now)
  let toolsResp = null;
  onMsg({ type: "vs-tools" }, {}, (r) => (toolsResp = r));
  await tick();
  ok(toolsResp && toolsResp.tools[0].name === "echo", "vs-tools returns tool list");

  // content script calls a tool -> bridge -> result
  let callResp = null;
  const async1 = onMsg({ type: "vs-call", tool: "echo", params: { text: "hi" } }, {}, (r) => (callResp = r));
  ok(async1 === true, "vs-call keeps the message channel open (async)");
  const callMsg = ws.sent.find((m) => m.type === "call");
  ok(callMsg && callMsg.tool === "echo", "vs-call forwards a 'call' to the bridge");
  ws._recv({ type: "result", id: callMsg.id, ok: true, output: "echoed: hi" });
  await tick();
  ok(callResp && callResp.ok === true && callResp.output === "echoed: hi", "result resolves the caller by id");

  // restart passthrough
  onMsg({ type: "restart_mcp" }, {}, () => {});
  ok(ws.sent.some((m) => m.type === "restart" && m.server === "roblox"), "restart_mcp sends 'restart' to the bridge");

  // disconnect clears status
  ws.close();
  const down = broadcasts[broadcasts.length - 1];
  ok(down.type === "zs-status" && down.connected === false, "socket close broadcasts offline status");

  console.log(`\n${pass}/${pass + fail} checks passed`);
  process.exit(fail ? 1 : 0);
}
main();
