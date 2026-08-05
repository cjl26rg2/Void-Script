// SPDX-License-Identifier: GPL-3.0-or-later
// Unit tests for rebuild/config.js. Run: node rebuild/test_config.js
const C = require("../voidscript-extension/config.js");

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("PASS  " + m)) : (fail++, console.log("FAIL  " + m)));

const tools = [
  { name: "execute_luau", description: "Run Luau in Studio.\n(second line)", inputSchema: { properties: { code: {} } } },
  { name: "script_read", description: "Read a script.", inputSchema: { properties: { path: {} } } },
  { name: "screen_capture", description: "Screenshot the viewport.", inputSchema: { properties: {} } },
];

// system prompt
const p = C.buildSystemPrompt({ siteName: "DeepSeek", tools });
ok(p.startsWith(C.SYS_MARKER), "prompt starts with the SYS marker");
ok(p.includes("DeepSeek"), "prompt mentions the site name");
ok(p.includes("```void") && p.includes("```void-luau"), "prompt teaches both block forms");
ok(p.includes('"tool": "TOOL_NAME"'), "prompt shows the JSON envelope shape");
ok(p.includes("execute_luau(code)") && p.includes("script_read(path)"), "prompt lists tools with args");

// tool formatting collapses multi-line descriptions to the first line
ok(C.formatTools(tools).includes("execute_luau(code) - Run Luau in Studio.") &&
   !C.formatTools(tools).includes("second line"), "formatTools uses first description line only");

// result block (prefixed with the hide marker)
const rb = C.formatResult({ ok: true, output: "done" });
ok(rb === C.INJECT_MARK + '\n```void-result\n{"ok":true,"output":"done"}\n```', "formatResult builds a marked void-result block");

// hide marker matches injected turns, not normal text
ok(C.hideRe.test(C.buildSystemPrompt({ siteName: "X", tools })), "hideRe matches the system prompt");
ok(C.hideRe.test(rb), "hideRe matches a tool result");
ok(C.hideRe.test(C.feedback.parseError("malformed")), "hideRe matches feedback");
ok(!C.hideRe.test("Create a red part please"), "hideRe does NOT match normal user text");

// categories for the chips
ok(C.toolCategory("script_read") === "read", "toolCategory: read");
ok(C.toolCategory("execute_luau") === "edit", "toolCategory: edit");
ok(C.toolCategory("screen_capture") === "screen", "toolCategory: screen");
ok(C.toolCategory("generate_mesh") === "generate", "toolCategory: generate");

// feedback strings map to parser reasons
ok(/could not be parsed/.test(C.feedback.parseError("malformed")), "feedback: malformed");
ok(/no "tool" field/.test(C.feedback.parseError("envelope")), "feedback: envelope");
ok(/empty/.test(C.feedback.parseError("empty")), "feedback: empty");
ok(/ONE command at a time/.test(C.feedback.multiTool(["a", "b"])), "feedback: multiTool");
ok(/unknown tool "zzz"/.test(C.feedback.unknownTool("zzz", ["a"])), "feedback: unknownTool");
ok(typeof C.feedback.bridgeOffline === "string" && C.feedback.bridgeOffline.length > 20, "feedback: bridgeOffline");

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
