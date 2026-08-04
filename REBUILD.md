# VoidScript — Independent Rebuild Plan

Goal: replace the GPL-derived ZeroScript core with a **clean-room, self-made**
implementation, one component at a time, until nothing in VoidScript is a
derivative work and we can relicense freely.

## Ground rules (so the result is genuinely independent)

1. **Clean-room discipline.** We design each component from its *behavior and
   protocol* (documented in this file), **not** by reading or transcribing the
   original source. If a spec detail is missing here, we derive it by observing
   the live system (browser DevTools, the MCP server, the AI sites) — never by
   copying code.
2. **Our own formats.** Where the original invented a convention (command
   envelope, system prompt, status markers), we design our own. Tool *names*
   (`execute_luau`, `multi_edit`, …) come from Roblox's MCP server, not from
   ZeroScript, so they are not derivative and stay as-is.
3. **License bridge.** Until the core is 100% replaced, the project stays
   **GPL-3.0 with ZeroScript credit** (already in the README). Only after Phase 7
   passes do we relicense (Phase 8).
4. **Always shippable.** Each phase leaves the extension working — we swap one
   component at a time behind its interface, never a big-bang rewrite.

## Architecture (target)

```
┌─────────────── Browser ───────────────┐        ┌──────── Your PC ────────┐
│  AI chat page (DeepSeek, ChatGPT, …)   │        │                         │
│  ┌──────────────────────────────────┐ │        │   bridge (Python)       │
│  │ content script                   │ │        │   ┌───────────────────┐ │
│  │  · provider adapter (DOM I/O)    │ │        │   │ WebSocket server  │ │
│  │  · command parser                │ │  ws:// │   │  127.0.0.1:17613  │ │
│  │  · agent loop  ───────────────── │─┼────────┼──▶│                   │ │
│  │  · overlay UI (bar/chips)        │ │        │   │ MCP client  ──────┼─┼─▶ Roblox Studio
│  └──────────────────────────────────┘ │        │   └───────────────────┘ │   MCP server
│         │ chrome.runtime               │        │                         │   (127.0.0.1:13469)
│  ┌──────▼───────────┐                  │        └─────────────────────────┘
│  │ background (WS)  │──────────────────┼─ holds the socket to the bridge
│  └──────────────────┘                  │
└────────────────────────────────────────┘
```

Four layers, each independently replaceable behind an interface:
**A. Bridge** (Python) · **B. Background relay** (WS client) · **C. Extension core**
(parser + agent loop + prompt + UI) · **D. Provider adapters** (DOM I/O per site).

---

## Contracts (our own — the interfaces we build to)

### 1. Extension ⇄ Bridge — WebSocket JSON protocol
Symmetric JSON messages over `ws://127.0.0.1:17613`. Every request carries an
`id`; the reply echoes it. Proposed message set:

| From → To | `type` | payload | reply |
|---|---|---|---|
| bg → bridge | `hello` | `{version}` | `ready {tools:[…], studio:bool, servers:[…]}` |
| bg → bridge | `list_tools` | — | `tools {tools:[{name,description,inputSchema}]}` |
| bg → bridge | `call` | `{id, tool, params}` | `result {id, ok, output}` \| `error {id, message}` |
| bg → bridge | `ping` | — | `pong {studio, servers}` |
| bridge → bg | `status` | `{connected, studio, tools, servers}` | (broadcast) |

This is the popup's status shape too (`{connected, studio, tools, servers[]}`) —
already what our `popup.js` renders, so the popup needs no change.

### 2. AI ⇄ Agent — our command format (replaces `{"command":…}` / `###LUA###`)
The AI is prompted to emit exactly one action per turn as a fenced block:

    ```void
    { "tool": "execute_luau", "params": { "code": "..." } }
    ```

- One fenced ` ```void ` block per reply. The agent extracts it, runs the tool,
  and replies with a fenced ` ```void-result ` block the model reads next turn.
- A Luau convenience form is allowed: a ` ```void-luau ` block whose body is raw
  Luau maps to `execute_luau`. (Our own naming; no `###` markers.)
- Rationale for fenced blocks: every AI renders code fences predictably, they’re
  easy to detect in the DOM, and easy to visually mask (see UI).

### 3. Core ⇄ Provider — the adapter interface
**Already ours.** `providers/_generic.js` (`ZSGeneric(cfg)`) defines the full
adapter contract (turn reading, composer I/O, generation detection, send hooks,
command masking). The new core builds to this same interface, so our generic
factory + all 25 beta providers carry over unchanged.

---

## Rebuild order (leaves first, orchestrator last)

Each phase is independently testable and ships behind its interface.

### Phase 1 — Bridge (Python) — `~self-contained`
Fresh `bridge.py` (our design): asyncio WebSocket server + MCP client to Studio.
- Implements the WS protocol above; speaks MCP (JSON-RPC over the Studio socket).
- Port management (free a stale bridge), logging, `websockets` dependency.
- **Test:** a tiny mock WS client (Node/py) drives `hello`/`list_tools`/`call`
  against a running Studio; verify a Luau round-trips.
- **Done when:** the current extension talks to the new bridge with no changes.

### Phase 2 — Background relay — `small`
Fresh `background.js`: owns the WS socket, exposes `status`/`reconnect`/
`restart_mcp` to the popup, relays `call`/`result` to content scripts.
- **Test:** popup shows live status; a content-script `call` gets a `result`.

### Phase 3 — Command parser — `small, pure`
Fresh `parser.js`: extract our ` ```void ` / ` ```void-luau ` blocks, tolerate
partial/streaming text, return `{tool, params}` or a typed parse error.
- **Test:** a standalone `test-parser.js` table of cases (valid, truncated,
  multiple blocks, bad JSON) — same style as today's parser test.

### Phase 4 — Prompt & config — `small`
Fresh `config.js`: our own system prompt (teaches the ` ```void ` format + tool
list), our feedback strings, tool→category map for the UI chips.
- **Test:** prompt renders with a live tool list; a model follows the format.

### Phase 5 — Overlay UI + CSS — `medium`
Fresh `overlay.css` + the UI bits of the core: the composer bar (Start/Stop,
status), the per-turn result "chip", and the command-masking styles.
- **Test:** bar mounts on a provider page; chips render; raw command block is
  visually hidden while the loop runs.

### Phase 6 — Agent core / main loop — `large (the hard one)`
Fresh `main.js`: the orchestrator. Session start/stop; watch the AI reply; on a
detected command → parse → `call` via background → inject a ` ```void-result `
turn → repeat; handle streaming/completion, truncation, errors; drive the UI.
- Built strictly on Phases 1–5 interfaces + the provider contract.
- **Test:** end-to-end on DeepSeek (most reliable) — build something in Studio.

### Phase 7 — Providers — `ongoing`
Interface is already ours. Replace the 7 hand-tuned providers by (a) tuning the
generic factory per site, or (b) writing fresh tuned adapters where needed —
each validated live. Beta providers already ride the factory.

### Phase 8 — Cutover & relicense — `final`
When Phases 1–7 pass with no original files remaining: remove the GPL-derived
files, drop the ZeroScript-required notices we no longer need, and set the
license VoidScript will ship under. Keep a courteous "inspired by ZeroScript"
note if desired (optional once nothing is derivative).

---

## Effort / sequencing notes
- Phases 1–4 are small and satisfying — real, independent wins early.
- Phase 5 is design-heavy (UI polish). Phase 6 is the big one and depends on all
  prior phases; expect it to span multiple sessions.
- We can keep the old core in place and switch to each new component behind its
  interface, so the extension never stops working mid-rebuild.

## Status tracker
- [~] Phase 1 — Bridge — **core built & mock-tested** (`rebuild/bridge.py`, 6/6
  checks); pending live validation against Roblox Studio's MCP server.
- [~] Phase 2 — Background relay — **built & mock-tested** (`rebuild/background.js`,
  10/10). Cutover needs `"alarms"` added to manifest permissions.
- [x] Phase 3 — Parser — **built & unit-tested** (`rebuild/parser.js`, 11/11).
- [ ] Phase 4 — Prompt & config
- [ ] Phase 5 — Overlay UI + CSS
- [ ] Phase 6 — Agent core
- [ ] Phase 7 — Providers
- [ ] Phase 8 — Cutover & relicense
