# rebuild/ — self-made VoidScript core (staging)

Clean-room reimplementation of the VoidScript engine, built one component at a
time per [`../REBUILD.md`](../REBUILD.md). Code here is developed and tested in
isolation; the shipping app keeps using the existing files until each component
is validated and cut over. Nothing here is derived from the original source —
it is built from the documented protocols (MCP spec, our own WS/command format).

## Phase 1 — Bridge ✅ core done (mock-tested)

- **`bridge.py`** — a small MCP *host*. Launches the MCP servers from
  `config.json`, speaks MCP JSON-RPC 2.0 over each server's stdio, and exposes
  their tools to the extension over the VoidScript WebSocket protocol
  (`hello` / `list_tools` / `call` / `ping` / `status`).
- **`mock_mcp_server.py`** — a fake stdio MCP server (one `echo` tool) for tests.
- **`test_bridge.py`** — end-to-end test: starts the bridge against the mock and
  exercises the whole WS protocol. Run it with:

  ```bash
  python rebuild/test_bridge.py
  ```

  Expected: `6/6 checks passed`.

### Still to validate (needs a real machine, not mockable here)
- Live round-trip against **Roblox Studio's MCP server** (Studio open, MCP
  enabled, `config.json` pointing at the real Studio MCP command). The protocol
  is standard MCP, so this is a wiring/validation step, not new logic.

## Phase 2 — Background relay ✅ (mock-tested)

- **`background.js`** — the service worker that owns the WebSocket to the bridge
  and relays between it and the extension. Popup API (`status` / `reconnect` /
  `restart_mcp`, `zs-status` broadcast) matches our popup unchanged; content
  scripts get `vs-tools` / `vs-call` (id-correlated). MV3 keep-alive via
  `chrome.alarms`.
- **`test_background.js`** — loads it with a mocked `WebSocket` + `chrome` and
  drives the relay. Run: `node rebuild/test_background.js` → `10/10`.

> **Cutover note:** the real `manifest.json` needs `"alarms"` added to
> `permissions` when this replaces the shipping `background.js`.

## Phase 3 — Command parser ✅ (unit-tested)

- **`parser.js`** — pure string logic (`VoidParse.parse(text)`): extracts our
  ` ```void ` / ` ```void-luau ` blocks, tolerates streaming (`partial`), flags
  `multi`, and ignores our own ` ```void-result ` feedback. Returns
  `ok` / `none` / `partial` / `multi` / `error{reason}`.
- **`test_parser.js`** — 11 cases. Run: `node rebuild/test_parser.js` → `11/11`.

## Phase 4 — Prompt & config ✅ (unit-tested)

- **`config.js`** (`VoidConfig`) — our own system prompt (teaches the ` ```void `
  format + tool list), the feedback strings keyed to the parser's outcomes
  (`malformed`/`envelope`/`empty`/`multi`/unknown-tool/offline), tool-list
  formatting, the ` ```void-result ` builder, and the tool→chip category map.
- **`test_config.js`** — 17 cases. Run: `node rebuild/test_config.js` → `17/17`.

## Phase 5 — Overlay UI + CSS ✅ (visually previewed)

- **`overlay.css`** — the in-page bar, per-category result chips, command-masking
  and the working-cover. Namespaced under `#void-root` / `.void-*`; colours match
  the logo/popup. **`overlay.js`** (`VoidOverlay`) — builds/mounts the bar, sets
  status (idle/ok/working/error/paused), makes & updates chips, and masks the raw
  ` ```void ` block. Design-heavy, so verified with a rendered preview rather than
  a unit test (syntax passes `node --check`).

## Phase 6 — Agent core ✅ (mock-tested)

- **`core.js`** (`VoidAgent`) — the run loop. Dependency-injected (provider,
  overlay, parse, config, callTool, getTools) so it is fully unit-testable and
  the content script just wires in the real pieces. Handles the whole cycle:
  prompt → read reply → parse → run tool / feedback / finalize, with masking +
  chips + bridge-offline handling.
- **`test_core.js`** — drives the loop with mocks + the real parser/config:
  `18/18` (command run, void-luau, parse-error feedback, unknown tool, bridge
  offline, idle finalize, no re-processing).

## Phase 7 — Entry / providers ✅ (wiring mock-tested)

- **`entry.js`** — the content-script seam: builds the overlay + agent, points
  `callTool`/`getTools` at the background relay (`vs-call`/`vs-tools`), mounts the
  bar near the composer, hooks Start/Stop, and reflects bridge/Studio status.
- **`test_entry.js`** — loads it with mocked globals + the real core/parser/
  config: `8/8` (mount, status, Start→prompt+tools, Stop).
- Provider interface is already ours (`../voidscript-extension/providers/
  _generic.js` + 25 beta providers). The 7 hand-tuned providers stay GPL for now;
  at cutover they can be dropped in favour of generic-tuned adapters (a Phase 8
  decision).

## Next — Phase 8 (cutover & relicense)
- Point `manifest.json` at the rebuilt files (config/parser/overlay/core/entry),
  add `"alarms"` to permissions, swap `background.js` and `bridge.py`.
- Decide the 7 tuned providers (keep GPL, or replace with generic adapters).
- Remove the GPL-derived files, set VoidScript's own license.
- **Requires a live browser run on a real AI site + Studio to validate.**
