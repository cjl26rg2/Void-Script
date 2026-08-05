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

  // Scan text for the first balanced {...} that parses as JSON and carries a
  // string "tool". This is how we recover a command AFTER a site has rendered
  // the ```void block into a styled code box (the backtick fence is gone from
  // the DOM, but the JSON survives). String-aware so braces inside strings don't
  // throw off the depth count.
  function scanBareCommand(text) {
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== "{") continue;
      let depth = 0, inStr = false, esc = false;
      for (let j = i; j < text.length; j++) {
        const c = text[j];
        if (esc) { esc = false; continue; }
        if (c === "\\") { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) {
            const cand = text.slice(i, j + 1);
            try {
              const obj = JSON.parse(cand);
              if (obj && typeof obj.tool === "string" && obj.tool) return { obj, raw: cand };
            } catch { /* not this one; keep scanning from the next { */ }
            break;
          }
        }
      }
    }
    return null;
  }

  function parse(text) {
    text = text || "";
    const blocks = [];
    let m;
    CLOSED.lastIndex = 0;
    while ((m = CLOSED.exec(text))) blocks.push({ tag: m[1], body: m[2] });

    if (blocks.length === 0) {
      // No fenced block. It may have been rendered (backticks stripped) — try to
      // recover a bare {"tool":...} command from the text.
      const bare = scanBareCommand(text);
      if (bare) {
        const params = bare.obj.params && typeof bare.obj.params === "object" ? bare.obj.params : {};
        return { status: "ok", command: { tool: bare.obj.tool, params }, raw: bare.raw };
      }
      // Otherwise: a dangling opening fence (mid-stream) => partial, else none.
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
