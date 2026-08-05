# VoidScript — AI Roblox Studio Agent (extension)

Turn a normal AI chat into a Roblox Studio agent. Describe what you want and the
AI reads/edits scripts, runs Luau, inspects the game tree, and builds your game —
by emitting ` ```void ` commands that VoidScript executes in Studio through a
local bridge. No API key, no coding.

This folder is the browser extension (self-made engine). It pairs with the
bridge (`../bridge.py`, run via `../start.bat` or `../run-bridge.bat`).

## Load it

**Chromium (Chrome / Edge / Brave / Opera / Vivaldi):** `chrome://extensions` →
enable **Developer mode** → **Load unpacked** → select this `voidscript-extension`
folder.

**Firefox (121+):** `about:debugging#/runtime/this-firefox` → **Load Temporary
Add-on** → pick `manifest.json` here.

Then run the bridge, open Roblox Studio (enable *Studio as MCP server* in the
Assistant settings), go to a supported AI, and click **Start session** in the
VoidScript bar.

## Architecture

A provider-agnostic core plus one thin adapter per AI site:

```
config.js        system prompt, feedback strings, tool categories   (global VoidConfig)
parser.js        parses our ```void / ```void-luau command format    (global VoidParse)
overlay.js       in-page bar, result chips, turn/command hiding       (global VoidOverlay)
core.js          the agent run loop (uses the provider + the above)   (global VoidAgent)
entry.js         content-script seam: wires provider + bridge + UI
background.js     service worker: the WebSocket to the local bridge
providers/_generic.js   VSGeneric(cfg): selector-driven adapter factory
providers/<site>.js     thin config per site → VSProvider = VSGeneric({...})
popup.html / popup.js   toolbar popup: bridge/Studio status + controls
```

The command format is our own: the AI emits a fenced ` ```void ` block with
`{"tool":"name","params":{...}}` (or a ` ```void-luau ` block of raw Luau). The
core parses it, runs the tool via the bridge, injects a ` ```void-result ` turn,
and hides the machine-to-machine turns from view.

### Add another AI site

Write `providers/<site>.js`:

```js
const VSProvider = VSGeneric({
  id: "example",
  displayName: "Example",
  selectors: { userItem: "...", assistantItem: "...", editor: "textarea", sendBtn: "..." },
});
```

Then add its URL to `manifest.json` (`host_permissions` + a `content_scripts`
entry loading `config.js, parser.js, providers/_generic.js, providers/<site>.js,
overlay.js, core.js, entry.js`) and to `PROVIDER_URLS` in `background.js`.

## Tests

Unit tests live in `../tests/` (run with `node ../tests/test_*.js`). They cover
the parser, config, agent loop, background relay, and the content-script wiring.
