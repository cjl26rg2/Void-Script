// SPDX-License-Identifier: GPL-3.0-or-later
// Headless wiring test for rebuild/entry.js. Provides mocked globals (chrome,
// DOM, provider, overlay) + the real core/parser/config, loads entry.js, and
// checks it wired the seam: mounted the bar, reflected status, and that
// Start/Stop drive the agent through the provider + relay.
// Run: node rebuild/test_entry.js
const fs = require("fs");
const vm = require("vm");
const path = require("path");

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("PASS  " + m)) : (fail++, console.log("FAIL  " + m)));
const tick = () => new Promise((r) => setTimeout(r, 0));

globalThis.__VOID_EXPOSE__ = true;
globalThis.VoidAgent = require("../voidscript-extension/core.js");
globalThis.VoidParse = require("../voidscript-extension/parser.js");
globalThis.VoidConfig = require("../voidscript-extension/config.js");

class MockOverlay {
  constructor(opts) { this.onToggle = (opts && opts.onToggle) || (() => {}); this.calls = { mount: [], status: [], running: [] }; this.root = { nodeType: 1, style: {} }; }
  mount(el, where) { this.calls.mount.push([el, where]); }
  setStatus(t, s) { this.calls.status.push([t, s]); }
  setRunning(b) { this.calls.running.push(b); }
  attachChip() { return { updates: [] }; }
  updateChip() {}
  mask() {}
}
globalThis.VoidOverlay = MockOverlay;

globalThis.ZSProvider = {
  displayName: "MockAI",
  _sent: [],
  init() {},
  barAnchor() { return { nodeType: 1, parentNode: {} }; },
  composerFrame() { return null; },
  async typeAndSend(t) { this._sent.push(t); },
  readAssistant() { return { present: false, reply: "", item: null }; },
  isGenerating() { return false; },
  findToolBlockSpot() { return { ref: {} }; },
};

const chromeMsgs = [];
globalThis.chrome = {
  runtime: {
    lastError: undefined,
    onMessage: { addListener() {} },
    sendMessage(msg, cb) {
      chromeMsgs.push(msg.type);
      const reply =
        msg.type === "vs-tools" ? { tools: [{ name: "execute_luau" }] } :
        msg.type === "status" ? { connected: true, studio: true, tools: 1, servers: [] } :
        msg.type === "vs-call" ? { ok: true, output: "done" } : {};
      if (cb) cb(reply);
    },
  },
};
const bodyAppends = [];
globalThis.document = { getElementById: () => null, body: { appendChild: (n) => bodyAppends.push(n) }, documentElement: {} };
globalThis.window = { addEventListener() {}, innerWidth: 1200, innerHeight: 800 };

// load entry.js (its IIFE runs immediately)
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "../voidscript-extension/entry.js"), "utf8"));

(async () => {
  const V = globalThis.__void;
  ok(!!V, "entry ran and wired the modules");
  ok(bodyAppends.length >= 1 && bodyAppends[0] === V.overlay.root, "mounted the bar onto <body> (survives SPA re-renders)");
  ok(chromeMsgs.includes("status"), "requested bridge status on load");
  ok(V.overlay.calls.status.some((s) => s[1] === "ok"), "painted idle status from a connected bridge");

  // Start
  await V.overlay.onToggle(true);
  await tick();
  ok(V.provider._sent[0] && V.provider._sent[0].includes(VoidConfig.SYS_MARKER), "Start sends the system prompt via the provider");
  ok(chromeMsgs.includes("vs-tools"), "Start fetched the tool list from the relay");
  ok(V.overlay.calls.running.includes(true), "Start flips the bar to running");

  // Stop
  V.overlay.onToggle(false);
  ok(V.overlay.calls.running.includes(false), "Stop flips the bar off");

  console.log(`\n${pass}/${pass + fail} checks passed`);
  process.exit(fail ? 1 : 0);
})();
