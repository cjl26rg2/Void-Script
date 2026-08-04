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

## Next
- Phase 5 — overlay UI + CSS (bar, chips, command masking), then the agent core
  (Phase 6) that wires bridge + relay + parser + config + UI together.
