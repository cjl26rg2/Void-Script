# VoidScript (rebuild) — testable build of the self-made engine

This is a **complete, loadable extension** that runs **only the clean-room engine**
from [`../rebuild/`](../rebuild/) — the self-made bridge, background relay,
command parser, prompt/config, overlay UI and agent core. Nothing here uses the
original GPL-derived core.

It exists so you can **validate the rebuilt engine live** before we cut over. The
shipping [`../voidscript-extension/`](../voidscript-extension/) is untouched, so
this is fully reversible — if something's off, you just keep using the shipping
one.

> ⚠️ **Expect rough edges.** Every provider here runs on the generic adapter with
> best-guess selectors (the shipping build has hand-tuned ones). Some sites will
> need selector tuning. The point of this build is to prove the *engine* works
> end-to-end; per-site polish comes after.

## How to test it

1. **Run the rebuilt bridge** (not the old `start.bat`):
   ```bash
   python rebuild/bridge.py
   ```
   Open Roblox Studio, load a place, and enable **Assistant → Manage MCP Servers
   → Enable Studio as MCP Server**. The bridge reads the repo's `config.json`.

2. **Load this folder unpacked:**
   - Chromium: `chrome://extensions` → Developer mode → **Load unpacked** →
     select `voidscript-rebuild`.
   - Firefox: `about:debugging` → **Load Temporary Add-on** → pick
     `voidscript-rebuild/manifest.json`.

3. **Open a supported AI** (e.g. https://chatgpt.com or https://chat.deepseek.com)
   and start a new chat. The VoidScript bar should appear above the composer.
   - The popup shows bridge/Studio status.
   - Click **Start session** in the bar. It sends the system prompt, then runs
     the model's ` ```void ` commands against Studio and feeds results back.

## What "working" looks like
- Bar mounts on the page; popup shows **Connected · Studio ready**.
- After Start, the model emits a ` ```void ` command; a chip appears, the raw
  block is hidden, the tool runs in Studio, and a ` ```void-result ` turn is fed
  back.

## If something's off
- **No bar** → the provider's composer selector didn't match; note the site.
- **Command never runs** → check the popup shows the bridge connected; check the
  browser console for `[void]` logs.
- **Tool errors** → the bridge/Studio connection; check the `python rebuild/
  bridge.py` window.

Report what happened per site and we tune the selectors, then do the final
cutover (Phase 8: replace the shipping files, remove the GPL core, relicense).
