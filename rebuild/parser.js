// SPDX-License-Identifier: GPL-3.0-or-later
// VoidScript command parser (self-made, clean-room rebuild — Phase 3).
//
// Pure string logic: no DOM, no provider knowledge. The agent core feeds it the
// AI's reply text and acts on the result. Our command format (see ../REBUILD.md):
//
//   ```void
//   { "tool": "execute_luau", "params": { "code": "..." } }
//   ```
//
//   ```void-luau
//   print("raw luau maps to execute_luau")
//   ```
//
// It deliberately IGNORES ```void-result blocks (our own injected feedback) so a
// quoted result is never mistaken for a new command.
//
// parse(text) -> one of:
//   { status: "none" }                         no command block present
//   { status: "partial" }                      an opening ```void fence, not closed yet (still streaming)
//   { status: "multi", tools: [names] }         more than one command block (act on one at a time)
//   { status: "error", reason, raw }            a single block that could not be turned into a command
//   { status: "ok", command: {tool, params}, raw }
//
// reason ∈ "malformed" (bad JSON) | "envelope" (JSON but no string "tool") | "empty"
(function (root) {
  "use strict";

  // A fenced block opening tagged exactly `void` or `void-luau` (not
  // `void-result`, not `voidx`). The (?![-\w]) stops "void" matching "void-...".
  const OPEN_TAG = "```[ \\t]*(void-luau|void)(?![-\\w])[^\\n]*\\r?\\n";
  const CLOSED = new RegExp("```[ \\t]*(void-luau|void)(?![-\\w])[^\\n]*\\r?\\n([\\s\\S]*?)```", "gi");
  const OPEN = new RegExp(OPEN_TAG, "i");

  function toCommand(tag, body) {
    if (tag.toLowerCase() === "void-luau") {
      const code = body.replace(/\s+$/, "");
      if (!code.trim()) return { status: "error", reason: "empty", raw: body };
      return { status: "ok", command: { tool: "execute_luau", params: { code } }, raw: body };
    }
    const json = body.trim();
    if (!json) return { status: "error", reason: "empty", raw: body };
    let obj;
    try {
      obj = JSON.parse(json);
    } catch {
      return { status: "error", reason: "malformed", raw: json };
    }
    if (!obj || typeof obj !== "object" || typeof obj.tool !== "string" || !obj.tool) {
      return { status: "error", reason: "envelope", raw: json };
    }
    const params = obj.params && typeof obj.params === "object" ? obj.params : {};
    return { status: "ok", command: { tool: obj.tool, params }, raw: json };
  }

  function parse(text) {
    text = text || "";
    const blocks = [];
    let m;
    CLOSED.lastIndex = 0;
    while ((m = CLOSED.exec(text))) blocks.push({ tag: m[1], body: m[2] });

    if (blocks.length === 0) {
      // No complete block. Is there a dangling opening fence (mid-stream)?
      return OPEN.test(text) ? { status: "partial" } : { status: "none" };
    }
    if (blocks.length > 1) {
      const names = blocks.map((b) => {
        const r = toCommand(b.tag, b.body);
        return (r.command && r.command.tool) || "?";
      });
      return { status: "multi", tools: names };
    }
    // Exactly one complete command block — act on it (any trailing open fence is
    // the model continuing to type and is handled on the next parse).
    return toCommand(blocks[0].tag, blocks[0].body);
  }

  const api = { parse };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.VoidParse = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
