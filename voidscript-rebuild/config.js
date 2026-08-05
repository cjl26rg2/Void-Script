// SPDX-License-Identifier: GPL-3.0-or-later
// VoidScript prompt & config (self-made, clean-room rebuild — Phase 4).
//
// Provider-agnostic: our own system prompt (teaches the ```void command format),
// the feedback strings the agent sends back when the parser rejects a command,
// tool-list formatting for the prompt, a tool->category map for the UI chips,
// and the ```void-result block the agent injects with each tool result. No DOM
// and no site specifics live here.
(function (root) {
  "use strict";

  const APP_NAME = "VoidScript";
  // Marker placed at the very top of the system prompt so the content script can
  // recognise (and hide) the bootstrap turn it sent. Ours, distinct from any
  // prior convention.
  const SYS_MARKER = "⟦VOID:SYS⟧"; // ⟦VOID:SYS⟧
  // Prefix on every OTHER message the agent injects (tool results, feedback) so
  // those user turns can be hidden too. Both markers share the "⟦VOID" stem.
  const INJECT_MARK = "⟦VOID⟧";
  const mark = (s) => INJECT_MARK + " " + s;
  // Matches any agent-injected user turn (prompt or otherwise). The core hides
  // USER turns whose text matches this — never assistant replies.
  const HIDE_RE = /⟦VOID/;

  const BT = "```";

  // Tool -> visual category for the status chips (icon/colour theme).
  //   read | edit | screen | generate | roblox | tool
  function toolCategory(name) {
    const n = (name || "").includes("/") ? name.split("/").pop() : name || "";
    if (/^(list_tools|list_commands)$/.test(n)) return "read";
    if (/(read|search|grep|list|inspect|get_|console|tree|state)/i.test(n)) return "read";
    if (n === "execute_luau" || /(edit|insert|write|create|store_image)/i.test(n)) return "edit";
    if (/screen|capture/i.test(n)) return "screen";
    if (/^generate|_generate/i.test(n)) return "generate";
    if (/studio|luau|instance|workspace|roblox/i.test(n)) return "roblox";
    return "tool";
  }

  // Format the live tool list for the prompt: "  name(arg1, arg2) - summary".
  function formatTools(tools) {
    return (tools || [])
      .map((t) => {
        const props = (t.inputSchema && t.inputSchema.properties) || {};
        const args = Object.keys(props).join(", ");
        const summary = (t.description || "").split("\n")[0].trim();
        return `  ${t.name || "?"}(${args})${summary ? " - " + summary : ""}`;
      })
      .join("\n");
  }

  // The block the agent injects after running a tool. The model reads this next
  // turn; the parser ignores ```void-result so it is never mistaken for input.
  function formatResult(res) {
    const payload = { ok: !!(res && res.ok), output: (res && res.output) || "" };
    return `${INJECT_MARK}\n${BT}void-result\n${JSON.stringify(payload)}\n${BT}`;
  }

  // One unified system prompt. `opts`: { siteName, tools }.
  function buildSystemPrompt(opts) {
    const o = typeof opts === "string" ? { siteName: opts } : opts || {};
    const siteName = o.siteName || "this AI";
    const toolList = formatTools(o.tools) || "  (the tool list will appear once the bridge connects)";
    return [
      SYS_MARKER,
      `You are ${siteName}, acting as a hands-on agent for Roblox Studio through ${APP_NAME}.`,
      `You can build and script a Roblox game by calling tools that run on the user's machine.`,
      ``,
      `HOW TO ACT`,
      `- To run a tool, output exactly one fenced ${BT}void block containing a single JSON object:`,
      ``,
      `${BT}void`,
      `{ "tool": "TOOL_NAME", "params": { ... } }`,
      `${BT}`,
      ``,
      `- For Luau specifically you may instead use a ${BT}void-luau block whose body is raw Luau:`,
      ``,
      `${BT}void-luau`,
      `print("hello from Studio")`,
      `${BT}`,
      ``,
      `RULES`,
      `- Exactly ONE command per message. After it, STOP and wait — you will receive a`,
      `  ${BT}void-result block with { "ok": bool, "output": string }. Read it before the next step.`,
      `- Put nothing else inside the ${BT}void block — just the JSON (or the Luau). You may write`,
      `  normal prose before or after the block.`,
      `- Use only the tools listed below, with their exact names and parameter keys.`,
      `- When the task is finished, say so in plain language with no command block.`,
      ``,
      `AVAILABLE TOOLS`,
      toolList,
    ].join("\n");
  }

  // Feedback the agent sends back (as a normal user turn) when a command can't
  // run. Keyed to the parser's outcomes + bridge/Studio conditions.
  const feedbackRaw = {
    parseError: (reason) => {
      const notes = {
        malformed:
          `ERROR: a ${BT}void command was detected but its JSON could not be parsed. ` +
          `Rewrite it as one valid JSON object, exactly like ` +
          `{"tool":"name","params":{...}}, inside a single ${BT}void block. Please retry.`,
        envelope:
          `ERROR: your ${BT}void block was valid JSON but had no "tool" field, so it is not a ` +
          `command. Use {"tool":"name","params":{...}} — the arguments go inside "params". Please retry.`,
        empty:
          `ERROR: your ${BT}void block was empty. Put a single JSON command inside it, like ` +
          `{"tool":"name","params":{...}}, or use a ${BT}void-luau block with raw Luau. Please retry.`,
      };
      return notes[reason] || notes.malformed;
    },
    multiTool: (names) =>
      `ERROR: you wrote ${(names || []).length} commands in one message (${(names || []).join(", ")}). ` +
      `Send ONE command at a time and wait for its ${BT}void-result. Start with just the first one.`,
    unknownTool: (name, valid) =>
      `ERROR: unknown tool "${name}". Valid tools are: ${(valid || []).join(", ")}. ` +
      `Use an exact name and the parameter keys from the system prompt.`,
    bridgeOffline:
      `ERROR: the local ${APP_NAME} bridge is unreachable, so nothing could run. This is an ` +
      `environment problem on the user's machine (the bridge is not running, or Studio is closed), ` +
      `NOT your mistake. Tell the user in one short sentence, then stop until they confirm it is back.`,
    studioOffline:
      `ERROR: no Roblox Studio is connected, so the command could not run. Studio is closed or its ` +
      `MCP server is disabled. Tell the user in one short sentence to open their place and enable the ` +
      `MCP server (Assistant settings), then wait until they confirm.`,
    truncated:
      `(System note: your previous reply was cut off before it finished. Continue from exactly where ` +
      `you stopped — do not restart and do not repeat what you already wrote.)`,
  };

  // Public feedback: every message gets the INJECT_MARK prefix so its user turn
  // is hidden from view (the model still reads it).
  const feedback = {
    parseError: (reason) => mark(feedbackRaw.parseError(reason)),
    multiTool: (names) => mark(feedbackRaw.multiTool(names)),
    unknownTool: (name, valid) => mark(feedbackRaw.unknownTool(name, valid)),
    bridgeOffline: mark(feedbackRaw.bridgeOffline),
    studioOffline: mark(feedbackRaw.studioOffline),
    truncated: mark(feedbackRaw.truncated),
  };

  const api = { APP_NAME, SYS_MARKER, INJECT_MARK, hideRe: HIDE_RE, toolCategory, formatTools, formatResult, buildSystemPrompt, feedback };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.VoidConfig = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
