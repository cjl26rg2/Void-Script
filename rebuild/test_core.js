// SPDX-License-Identifier: GPL-3.0-or-later
// Unit test for rebuild/core.js: drives the agent loop with a mock provider,
// mock overlay, and injected callTool/getTools. No browser. Uses the real
// parser + config. Run: node rebuild/test_core.js
const VoidAgent = require("./core.js");
const parse = require("./parser.js");
const config = require("./config.js");

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("PASS  " + m)) : (fail++, console.log("FAIL  " + m)));
const fence = (tag, body) => "```" + tag + "\n" + body + "\n```";

// A provider that yields scripted assistant replies — one per message we send
// (a real AI answers every turn). Records what we sent.
function mockProvider(replies) {
  let i = 0;
  const items = [], sent = [];
  return {
    displayName: "MockAI",
    _sent: sent, _items: items,
    async typeAndSend(text) { sent.push(text); if (i < replies.length) items.push({ text: replies[i++] }); },
    readAssistant() {
      const it = items[items.length - 1];
      return it ? { present: true, reply: it.text, thinking: "", item: it } : { present: false, reply: "", item: null };
    },
    isGenerating() { return false; },
    findToolBlockSpot() { return { ref: {} }; },
  };
}
function mockOverlay() {
  const calls = { running: [], status: [], chips: [], masks: [] };
  return {
    _calls: calls,
    setRunning: (b) => calls.running.push(b),
    setStatus: (t, s) => calls.status.push([t, s]),
    attachChip: (_t, o) => { const c = { o, updates: [] }; calls.chips.push(c); return c; },
    updateChip: (c, o) => { if (c) c.updates.push(o); },
    mask: (r) => calls.masks.push(r),
  };
}

async function mainFlow() {
  const provider = mockProvider([
    fence("void", '{"tool":"execute_luau","params":{"code":"x"}}'),
    fence("void-luau", 'print("hi")'),
    fence("void", "{bad json}"),
    "All done! Your part is spinning.",
  ]);
  const overlay = mockOverlay();
  const toolCalls = [];
  const agent = new VoidAgent({
    provider, overlay, parse, config,
    getTools: async () => [{ name: "execute_luau" }, { name: "script_read" }],
    callTool: async (tool, params) => { toolCalls.push({ tool, params }); return { ok: true, output: "result of " + tool }; },
    autoWatch: false,
  });

  await agent.start();
  ok(provider._sent[0].includes(config.SYS_MARKER), "start sends the system prompt");
  ok(overlay._calls.running[0] === true, "start flips the bar to running");

  ok((await agent._tick()) === "ran:execute_luau", "reply 1: runs execute_luau");
  ok(toolCalls[0].tool === "execute_luau", "  -> tool called with execute_luau");
  ok(provider._sent[provider._sent.length - 1].includes("void-result"), "  -> injects a void-result turn");
  ok(overlay._calls.masks.length === 1, "  -> masked the raw command block");
  ok(overlay._calls.chips[0].updates[0].ok === true, "  -> chip updated to done/ok");

  ok((await agent._tick()) === "ran:execute_luau", "reply 2: void-luau maps to execute_luau");
  ok(toolCalls[1].params.code === 'print("hi")', "  -> raw luau passed as code");

  ok((await agent._tick()) === "feedback:malformed", "reply 3: malformed -> feedback");
  ok(/could not be parsed/.test(provider._sent[provider._sent.length - 1]), "  -> parse-error feedback sent");

  ok((await agent._tick()) === "idle", "reply 4: plain text -> idle (model done)");
  const lastStatus = overlay._calls.status[overlay._calls.status.length - 1];
  ok(lastStatus[0] === "Done" && lastStatus[1] === "ok", "  -> status shows Done");
  ok((await agent._tick()) === "idle", "re-tick on the same turn stays idle (no reprocessing)");
}

async function offlineAndUnknown() {
  // unknown tool
  const p1 = mockProvider([fence("void", '{"tool":"nonexistent","params":{}}')]);
  const a1 = new VoidAgent({
    provider: p1, overlay: mockOverlay(), parse, config,
    getTools: async () => [{ name: "execute_luau" }],
    callTool: async () => ({ ok: true, output: "" }), autoWatch: false,
  });
  await a1.start();
  ok((await a1._tick()) === "feedback:unknown", "unknown tool -> unknownTool feedback");

  // bridge offline mid-call
  const p2 = mockProvider([fence("void", '{"tool":"execute_luau","params":{}}')]);
  const ov2 = mockOverlay();
  const a2 = new VoidAgent({
    provider: p2, overlay: ov2, parse, config,
    getTools: async () => [{ name: "execute_luau" }],
    callTool: async () => ({ ok: false, output: "bridge offline" }), autoWatch: false,
  });
  await a2.start();
  ok((await a2._tick()) === "offline", "bridge offline -> offline + stop");
  ok(a2.running === false, "  -> agent stopped");
  ok(ov2._calls.status.some((s) => s[1] === "error"), "  -> status shows an error state");
}

(async () => {
  await mainFlow();
  await offlineAndUnknown();
  console.log(`\n${pass}/${pass + fail} checks passed`);
  process.exit(fail ? 1 : 0);
})();
