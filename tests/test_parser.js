// SPDX-License-Identifier: GPL-3.0-or-later
// Unit tests for rebuild/parser.js. Run: node rebuild/test_parser.js
const { parse } = require("../voidscript-extension/parser.js");

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + "\n      got : " + JSON.stringify(got) + "\n      want: " + JSON.stringify(want)); }
}

const fence = (tag, body) => "```" + tag + "\n" + body + "\n```";

// no command
check("plain prose -> none", parse("Sure, let me help with that."), { status: "none" });

// a valid void JSON command, surrounded by prose
check("void json -> ok",
  parse('Building it now.\n' + fence("void", '{"tool":"multi_edit","params":{"path":"x"}}') + '\nDone.'),
  { status: "ok", command: { tool: "multi_edit", params: { path: "x" } }, raw: '{"tool":"multi_edit","params":{"path":"x"}}' });

// void with no params -> params defaults to {}
check("void json without params -> {}",
  parse(fence("void", '{"tool":"list_tools"}')),
  { status: "ok", command: { tool: "list_tools", params: {} }, raw: '{"tool":"list_tools"}' });

// void-luau convenience form
check("void-luau -> execute_luau",
  parse(fence("void-luau", 'print("hi")')),
  { status: "ok", command: { tool: "execute_luau", params: { code: 'print("hi")' } }, raw: 'print("hi")\n' });

// malformed JSON
check("bad json -> malformed",
  parse(fence("void", '{"tool": "x", oops}')),
  { status: "error", reason: "malformed", raw: '{"tool": "x", oops}' });

// JSON object but no tool key
check("no tool key -> envelope",
  parse(fence("void", '{"params":{"a":1}}')),
  { status: "error", reason: "envelope", raw: '{"params":{"a":1}}' });

// empty body
check("empty void -> empty", parse(fence("void", "")), { status: "error", reason: "empty", raw: "\n" });

// streaming: opened but not closed yet
check("dangling open fence -> partial",
  parse('Working...\n```void\n{"tool":"execute_luau",'),
  { status: "partial" });

// two commands
check("two blocks -> multi",
  parse(fence("void", '{"tool":"a","params":{}}') + "\n" + fence("void", '{"tool":"b","params":{}}')),
  { status: "multi", tools: ["a", "b"] });

// our own result block must be ignored, not parsed as a command
check("void-result ignored -> none",
  parse(fence("void-result", '{"ok":true,"output":"done"}')),
  { status: "none" });

// rendered pages strip the backtick fence; a bare {"tool":...} is still detected
check("bare/rendered json command -> ok",
  parse('void\n{ "tool": "list_roblox_studios", "params": {} }'),
  { status: "ok", command: { tool: "list_roblox_studios", params: {} }, raw: '{ "tool": "list_roblox_studios", "params": {} }' });

// a JSON object with no tool key is not a command (avoids false positives)
check("bare json without tool -> none",
  parse('here is data { "x": 1, "y": { "z": 2 } }'),
  { status: "none" });

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
