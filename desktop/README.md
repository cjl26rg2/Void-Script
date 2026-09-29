# VoidScript Desktop

The `VoidScript.exe` app: runs the Roblox Studio bridge (no terminal window), shows
live Bridge / Studio / tools status, a tools browser, a live terminal, and a built-in
AI chat (NVIDIA or OpenRouter) that builds in Studio with real tool-calling.

Built with [Tauri 2](https://tauri.app): a Rust backend (`src-tauri/`) and a plain
HTML/CSS/JS UI (`ui/`, no bundler).

## Build

Needs Rust (via rustup), Node.js, and the Visual Studio C++ build tools.

```bash
cd desktop
npm install
npm run build        # = tauri build; add -- --no-bundle to skip the installer
```

The app is `src-tauri/target/release/voidscript.exe`. Ship it as **`VoidScript.exe` in
the VoidScript folder, next to `start.bat`** — it finds `start.bat` and `bridge.py` there.

## How it fits together

- **Bridge:** the app runs `start.bat` hidden with `VS_GUI=1` (no banner, no `pause`,
  no prompts) and streams its output. `start.bat` exits with code **99** after installing
  an update; the app then restarts the bridge on the new version.
- **Bridge connection:** the Rust backend connects to `ws://127.0.0.1:17613` as a native
  client (no Origin header), which the bridge's security check allows by design. Browser
  pages still can't connect.
- **API keys** live in `%APPDATA%\app.voidscript.desktop\settings.json` and are only sent
  to their provider. The UI never receives a saved key back.
- **Workspace access** is off by default. When on, file and command tools are confined to
  one folder: absolute paths and `..` are rejected, paths are canonicalised (symlinks
  resolved) and must stay inside it, and the UI asks before every write, delete and command.
