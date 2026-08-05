# VoidScript — Free AI Agent for Roblox Studio

![GitHub stars](https://img.shields.io/github/stars/cjl26rg2/Void-Script?style=social)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

**VoidScript** is a free, open-source browser extension that turns a normal AI chat
into a Roblox Studio agent. Describe what you want and the AI reads and edits your
scripts, runs Luau, inspects the game tree, generates assets, and builds your game —
straight from the chat. **No API key, no terminal, no coding.** The whole engine is
self-made and runs entirely on your machine.

> 🌐 **Website: [void-script.vercel.app](https://void-script.vercel.app/)** — the free way to build Roblox games with AI.

> 💬 **Stuck? Join the [Discord](https://discord.gg/9aNyZsMWcb)** — get help, share feedback, follow updates.

## Supported AIs (32)

Every provider runs on one selector-driven adapter (`providers/_generic.js`).
**DeepSeek** and **ChatGPT** are confirmed driving Studio live; the rest load and
drive their site too, but some may need per-site selector tuning — report any that
misbehave and it can be fixed.

DeepSeek · Gemini · Kimi · GLM · Qwen · Arena · Meta AI · ChatGPT · Grok ·
Perplexity · Copilot · Mistral · Poe · HuggingChat · Phind · Blackbox · You ·
Groq · LMArena · Doubao · Yuanbao · Reka · Pi · Coral · OpenRouter · v0 ·
Genspark · Lambda · ERNIE · MiniMax · Manus · Together

> On Arena / LMArena, use **Direct** (single-model) chat — comparison modes aren't supported.

## ⚠️ VoidScript is Free — Beware of Paid Copycats

VoidScript is 100% free and open-source. There is no official paid version, no
subscription, and no sign-in required. If you find a site or extension using the
VoidScript name that asks for payment or an account, it is **not** this project —
the only official links are the ones at the top of this README.

## How it works

```
AI chat (in your browser)  →  VoidScript extension  →  local bridge (your PC)  →  Roblox Studio (MCP)
```

The extension runs inside the chat page. When you ask for something, the AI emits a
fenced ` ```void ` command; the extension runs it through the local bridge, which
drives Roblox Studio through its built-in MCP server, then feeds the result back to
the AI so it can continue — one step at a time until the task is done.

## Setup

### 1. Get the files & load the extension

Download the latest ZIP from the **Releases** page and extract it (it contains the
bridge and the `voidscript-extension` folder).

**Chromium (Chrome, Edge, Brave, Opera, Vivaldi):**
- Go to `chrome://extensions`
- Enable **Developer mode** (top-right)
- Click **Load unpacked** → select the `voidscript-extension` folder

**Firefox (121+):**
- Go to `about:debugging#/runtime/this-firefox`
- Click **Load Temporary Add-on…** → pick `manifest.json` in `voidscript-extension`

**Safari** isn't supported out of the box (needs a one-time Xcode conversion on a Mac:
`xcrun safari-web-extension-converter voidscript-extension`).

### 2. Enable MCP in Roblox Studio

Open Studio and load a place, then (first time only): **Assistant** → **…** →
**Manage MCP Servers** → **Enable Studio as MCP Server**.

### 3. Run the bridge

- **Windows:** double-click `start.bat` (or `run-bridge.bat`).
- **macOS / Linux:** double-click `MacOS_Start.command`. The first time, macOS shows a
  security warning for any downloaded script — click **Done**, then **System Settings →
  Privacy & Security → Open Anyway** (once).

Keep the little window open — that's the bridge.

### 4. Start a session

Open a supported AI, click **Start session** in the VoidScript bar above the chat box,
and tell it what to build.

## What the AI can do

- Read and edit scripts
- Run Luau code directly in Studio
- Inspect the game tree and instances
- Generate meshes, materials, and models
- Browse and insert from the Creator Store
- Control play-testing

## New in 2.0 — VOID

- **Ground-up rewrite — the engine is now self-made.** New command format
  (` ```void ` blocks), new local MCP-host bridge, new WebSocket protocol, new prompt,
  parser, overlay, and agent loop — all built from scratch and verified building in
  Studio live.
- **32 AI providers** on a single selector-driven adapter.
- **New identity** — the "void portal" logo, a top-bar UI that hugs the chat box, and a
  landing site.
- **Cross-browser** — Chromium (Chrome/Edge/Brave/Opera/Vivaldi) and Firefox 121+.
- **Roblox-themed launchers** — `start.bat` / `run-bridge.bat` (Windows),
  `MacOS_Start.command` (macOS/Linux).
- Hides the system prompt and tool-result turns from view, and runs each command exactly
  once.

See [CHANGELOG.md](CHANGELOG.md) for the full history.

## Panel status

| Dot | Meaning |
|-----|---------|
| Green | Bridge + Studio ready (a place is open) |
| Yellow | Bridge OK, but Studio isn't attached yet — open Studio, load a place, or enable its MCP server |
| Grey | Bridge offline — run `start.bat` (Windows) or `MacOS_Start.command` (macOS) |

## Requirements

- Windows or macOS (Linux works for the bridge)
- Roblox Studio (MCP support built-in)
- A Chromium browser (Chrome, Edge, Brave, Opera, Vivaldi) or Firefox 121+
- Python 3.9+ (installed automatically on Windows; on macOS see [python.org/downloads](https://www.python.org/downloads/))

## License

GPL-3.0 — free and open-source. Not affiliated with Roblox Corporation.
