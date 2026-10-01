# Changelog

All notable changes to VoidScript Free are documented here.

## [5.5.0] - 2026-10-01

### Added
- **OR × VOIDSCRIPT.** With the OR theme on, the extension bar, the popup and the app's title bar read "OR × VOIDSCRIPT".
- **Sound effects (opt-in, off by default).** Short, soft cues when VoidScript connects to Roblox, when the AI finishes, on errors, and when it needs your approval.
  - Extension: **Sound effects** switch in the popup and in the bar's menu (Safety & behavior).
  - App: **Settings → App → Sound effects**, with a volume slider and a Play button to preview.

## [5.4.2] - 2026-10-01

### Fixed
- **Update now said "Already up to date" on an older app.** If the folder already had the new release (the launcher updated it) but the open app was still the old version, it now reopens on the new app instead.
- The release title no longer shows twice in the Updates tab's notes.

## [5.4.1] - 2026-10-01

### Added
- **OR theme** (partner): near-black panels, a warm cream accent and spaced-out caps.
  - Extension: pick **OR** in the popup's theme switch or under **UI theme** in the bar's menu. The popup itself switches to OR too.
  - App: **Settings → App → Theme**.

### Fixed
- The extension's theme is now applied after the page settles, like everything else VoidScript adds (part of the ChatGPT black-page fix).

## [5.4.0] - 2026-10-01

### Desktop app: updates & notifications
- **Updates tab.** Shows your version, the latest release and its notes, with **Update now**. A full-screen "VoidScript is currently updating" screen covers the update, then VoidScript closes and **reopens itself** on the new version. When the launcher's own auto-update runs, the app now reopens itself too instead of asking you to.
- **Notifications.** A bell in the title bar with a 1-5+ badge: new updates, the bridge stopping, Roblox Studio connecting or disconnecting, and failed updates. Click one to jump to the right tab. The app checks for updates on launch and every few hours.

### Desktop app: faster chat
- **Replies stream in** as the AI writes them, instead of all at once at the end.
- **Stop is instant.** It cancels the AI request itself and stops waiting on a Roblox tool call, instead of waiting for the current step to finish.
- **Faster default NVIDIA model:** DeepSeek V4.1 Flash. Kimi K2.6 is stronger but queues for a long time on NVIDIA's free tier; it's still in the model menu. If a model disappears, the chat now falls back to fast models first.

### Faster
- **Batched commands.** The AI can now send up to 5 independent commands in one reply (read several scripts, inspect a few instances, create a couple of scripts). They run in order and all the results go back in one message, so it's one round trip instead of five. If one fails, the rest are skipped and the AI is told why. Before, a reply with more than one command was thrown away entirely.
- **Quicker start.** The command list is handed to the AI in the setup message, so it's ready after one reply instead of two.
- **Fewer pointless screenshots.** Auto-verify only screenshots changes you can actually see (new or moved parts, colours, models). Script edits and Lua that only reads or wires up logic no longer trigger a capture, an image upload and a slower reply.

### Fixed
- **ChatGPT loading as a black page.** ChatGPT's new layout finishes building itself after the page loads, and VoidScript could add its bar or a class in the middle of that, making ChatGPT give up. Whether it happened depended on timing, so it was random. VoidScript now waits until the page has settled (usually under a second) before touching anything.
- **Freezing on AI sites.** The bar's positioning loop ran 60 times a second and searched the page for the composer, Send button and popups every time, plus rewrote styles on the site's own composer each frame. It now reuses those lookups for a moment and only writes styles when something actually moved.
- **Long chats getting slower and slower.** VoidScript re-read every turn several times a second. It now checks the newest few turns right away and the whole chat every 2 seconds.
- The "Agent is working…" cover no longer recalculates its colour every frame.
- **Freezing while "Connecting to Roblox…".** After pasting the setup prompt, VoidScript checked that the chat box held exactly its text and pasted the whole prompt again if not. Rich editors (Gemini, ChatGPT, Kimi…) always reformat a paste, so it kept re-pasting tens of KB every 0.7s or on every retry, freezing the tab. It now ignores formatting differences and re-pastes at most twice.
- **Tab locked solid in background mode.** Switching away from the AI tab mid-reply with "keep working in the background" on made the reply watcher spin without ever pausing, so the page never got control back. It now waits between checks.
- **The debug log** rewrote its whole history (up to 300 entries) into the page on every event, which woke the site's own watchers each time. It's now written at most every 3 seconds.
- **Qwen** re-read every code block in the conversation on each streamed character. It now only reads the blocks that changed.
- **Stuck on "Starting…" when the AI doesn't answer.** There was no way to stop during startup. The button now reads **■ Stop** while connecting and cancels straight away, unlocking the chat box without waiting for the AI.
- **Stuck on "⏳ Stopping…".** After Stop, VoidScript waited for the AI site to finish its reply, forever if the site ignored its own stop. VoidScript is fully stopped within a moment anyway, so the button now frees up after 4 seconds at most; the site's own stop button handles the rest of its reply.
- **Gemini** inserts long text in smaller batches so the page stays clickable, and very long tool results are trimmed sooner.

## [5.3.0] - 2026-10-01

### Desktop app
- **Chat modes** in a bar above the message box:
  - **Effort:** Fast, Balanced or Deep (how much it reads, checks and how many steps it may take).
  - **Access:** **Ask** (approve every Studio change, file write and command), **Sandbox** (Studio plus your workspace folder) or **Full PC** (any file, commands anywhere). Full PC asks once before it turns on; deletes always ask, and drives, your user folder and Windows are protected.
  - **Thinking:** reasoning models think first; their thoughts show folded in the chat.
  - **Self-check:** after building, the AI reviews its own changes and fixes what it finds.
  - **Plan first:** the AI looks around with read-only tools and writes a plan; nothing changes until you press **Build it**.
- **Project memory in the app.** The chat now uses the same memory the extension keeps in `ServerStorage.VoidScript.Memory`, saved inside your place. It's loaded at the start of each chat and kept up to date, so whichever AI opens the game next (in the app or the browser) knows what was built and where. Toggle it with **Memory** in the mode bar.
- **Notion** in the MCP catalog: paste your integration token right on the card.
- **NVIDIA fixed for everyone:** NVIDIA retired Llama 3.3 70B, the old default, so new installs got "model not found". The default is now Kimi K2.6, and if a model ever disappears the chat switches to one that's still listed. Pasted keys are cleaned up (`Bearer`, quotes, line breaks), non-chat models are hidden from the list, and models without tool calling fall back to plain chat with a note.
- **Test** button next to your API key, and clearer API error messages.

### Extension
- **ChatGPT's new layout** is supported: command blocks are hidden and run again.
- **Gemini (and other busy sites) could freeze or crash** on long chats. VoidScript re-read the whole conversation on every animation frame, and reacted to its own changes too. It now ignores its own changes and sweeps at most ~8 times a second.

### Release
- `make-release.bat` leaves the app source (`desktop/`) out of the zip.

## [5.2.0] - 2026-09-29

### VoidScript Desktop (new app)
- **VoidScript.exe is now a real desktop app** (Tauri) — no terminal window. It runs the bridge hidden, keeps it alive in the system tray, and shows everything in one modern window:
  - **Home** — live Bridge, Roblox Studio, Tools and Workspace status, with Start / Stop / Restart.
  - **Chat** — build right inside the app with **NVIDIA** or **OpenRouter** models using real tool-calling (no chat website needed). **Switch model from the chat header** (searchable, shows which models support tools, or type any model ID). **Attach reference files** with the paperclip or by dropping them on the window.
  - **Tools** — every tool the AI can use, grouped by server, with parameters; "Try in terminal" on each.
  - **Terminal** — the live bridge output, plus a runner to call any tool by hand.
  - **Settings** — API keys (stored on this PC only, never shown back in full), model, reply language, start-with-app, close-to-tray.
- **Workspace access (off by default).** Lets the in-app Chat read/write files and run commands **inside one folder you choose** — paths can't escape it (no `..`, symlinks resolved), and every write, delete and command asks for approval first.
- **More MCP servers, one click.** A new **MCP servers** tab has a catalog: **Blender**, Web fetch, Context7 docs, Memory, Sequential thinking and Git, plus "Add a custom server" for anything else. Their tools work in the in-app chat and through the extension.
- **Home explains the two ways to build:** the browser extension for ChatGPT, Gemini, DeepSeek and every other site, or the in-app chat with your own NVIDIA / OpenRouter key.
- Website link is now **voidstudioai.netlify.app**.
- The VoidScript logo shows on the taskbar, Alt+Tab and tray.
- **First-run disclaimer** covering AI mistakes, backups, workspace access and privacy.
- Auto-update works with the app: a running `VoidScript.exe` is moved aside and replaced safely, and the app restarts the bridge on the new version by itself.

### Added
- **15 languages.** A new **Language** picker in the popup (English by default): English, Español, Português (BR), Français, Deutsch, Italiano, Русский, Türkçe, Polski, Bahasa Indonesia, Tiếng Việt, ไทย, 日本語, 한국어 and 中文. It translates the popup and the in-page bar's controls (Start/Stop/Pause, Guide, Undo, Steer, quick-steer presets) and switches instantly, no reload.
- **The AI replies in your language.** With a non-English language selected, the agent talks to you in it — while commands, JSON, markers and Luau code stay exactly as specified so nothing breaks. English prompts are unchanged.

### Fixed
- **ChatGPT getting stuck after a command** (e.g. `list_commands` running but the agent sitting on "Agent is working…"). ChatGPT dropped the `data-testid` hooks on its buttons, so VoidScript couldn't find **Send** in non-English ChatGPT and never delivered the result. Send/Stop are now found language-neutrally (the composer's submit button, plus multilingual labels) on every generic-adapter site, and a site with no detectable Send button falls back to Enter after 1.5s instead of stalling ~30s.
- **ChatGPT's new composer** (a plain `textarea`) is now supported alongside the older ProseMirror editor.
- **Clicking Send by hand** in a non-English UI now starts the agent (previously only Enter did).
- **Command blocks stayed visible on ChatGPT.** Hiding now removes the whole code card (language label, copy/run icons) on every site, never the model's prose.
- **First send of a session could silently not go out.** The stream sampler treated its very first reading as "still generating", which blocked the send for a few seconds after load. Fixed across all providers.
- **Updater could leave a half-installed folder.** If a file was locked mid-update (e.g. a running app), the swap failed half-way after the old files were already wiped. Locked files are now renamed aside and replaced, and leftovers are cleaned up on the next start.
- **start.bat under the app:** no more console-only banner, no hung prompts, and the port-release wait no longer depends on a console.
- **Localised site messages.** "Conversation too long" / context-limit notices are recognised in Italian, Spanish, Portuguese, German and French; Arena's Send/Stop detection now covers more languages than English and French.

## [5.1.0] - 2026-09-28

### Agent quality & "acts like a real tool, not a bot"
- **Surgical edits, never rewrites.** The agent is now told to change only the exact lines that must change (a tight multi_edit), not rewrite a whole script to tweak one thing — so it stops making 50-line changes for a 2-line fix and never clobbers your formatting or unrelated logic.
- **Code that reads like a human wrote it.** No filler comments, no "-- Step 1 / -- Step 2" narration, no header banners — clean idiomatic Luau that matches your project's style, so what it leaves behind doesn't look AI-generated.
- **Natural teammate tone.** Brief, plain replies — no "As an AI…", no restating the request, no over-explaining.
- **Human-like send timing by default.** A small randomized pause before every send so the cadence reads as a person typing instead of an instant machine paste (the biggest "this is a bot" tell). "Humanize send timing" widens it further.

### Added
- **Redesigned extension popup.** A cleaner, premium layout — glowing logo header, a status hero card, a prominent gradient **Start VoidScript**, an icon action grid (Reconnect / Quick test / Diagnostics / Settings), and a footer with website / Discord / GitHub links.
- **Jump to an AI.** Quick-launch chips in the popup for DeepSeek, ChatGPT, Gemini, GLM and Claude.
- **Quick settings in the popup.** Toggle **Guide steering**, **Verify edits with a screenshot**, **Guard destructive commands** and **Work while the tab is hidden**, plus a **System / Dark / Light** theme picker — right from the popup.
- **Live settings sync.** Changing a setting in the popup (or another tab) now applies to the running AI page immediately, no reload needed.
- **Copy the session timeline** as plain text (a copy control on "Recent activity", matching the leaderboard).
- **Custom settings UI.** The in-page settings menu's plain checkboxes are now branded toggle switches, with styled dropdowns/number inputs to match.
- **Guide quick-steer presets.** One-click steer chips — *Fix that*, *Undo & retry*, *Keep going*, *Explain first* — so you can redirect the agent without typing.
- **Session stats in the popup.** A Sessions / Commands / Success strip summarising your build history at a glance, with a one-click **reset** to clear your leaderboard, stats and activity.

### Fixed
- **Hidden controls actually hide now.** Several bar controls set an explicit CSS `display`, which overrode the `hidden` attribute — so Guide, the steer row, Undo and the quick screenshot/list/voice buttons stayed visible even when the code hid them (the crowded bar + "Guide always showing"). The `hidden` attribute now wins for every VoidScript control, so Guide's steer tab is fully hidden until you press Guide.
- **DeepSeek "mode not ready" no longer blocks Start.** Switching to Expert/Vision is best-effort; the session now starts as long as the composer is usable, instead of stranding you behind the banner when DeepSeek changes its model-tab layout.
- **Tab freeze on streaming sites (ChatGPT etc.).** The DOM watcher ran a full-page scan on every single streamed token; it's now coalesced to at most once per animation frame, stopping the CPU spikes/freezes on slower machines. (With 5.0.3's fix for the bar fighting framework composers, this is the freeze that made commands like `list_commands` appear to do nothing.)

### Changed
- **Extension version → 5.1.0.**
- **Leaderboard restyled** as a compact, low-key "Best models for you" list instead of a heavy card.

## [5.0.3] - 2026-09-27

### Fixed
- **Chrome/Edge crash.** Inside-mounting the bar into framework-reconciled composers (ChatGPT, etc.) could start a per-frame insert↔reconcile fight that pegged the CPU and crashed the tab. Generic sites with rich contenteditable editors now use anchored mode (no DOM insertion into the framework's tree), the bar re-inserts only when it has actually detached, and a runtime thrash guard falls back to anchored if any mount still fights.
- **Guide steer row layout.** The steer box could push the VoidScript controls off the right edge because the bar wasn't wrapping reliably. Wrapping is now built into the base bar, so the steer row always drops to its own line on top with the full controls row below.

### Changed
- **Extension version → 5.0.3.**
- **Guide steer row sits on top** of the VoidScript bar when Guide is on, and hides when off.

## [5.0.2] - 2026-09-27

### Added
- **Guide mode** — human-in-the-loop steering. Toggle it on in the bar (or Settings) and a **Steer the next step…** box appears on its own row while a session runs. Type a correction and it's injected into the agent's next turn as a high-priority note, so the model changes course or fixes a wrong action without stopping the session. Queue multiple steers; the toggle's dot pulses while a steer is pending.
- **Undo button** — one-click revert of the agent's most recent script edit (same restore path as `revert_last`), sits in the steer row whenever there's an edit to undo. Runs immediately, independent of the AI turn.

### Changed
- **Extension version → 5.0.2.**
- **Guide is a focused two-row layout** — the steer box + Undo drop to their own line under the controls, and the secondary quick buttons (screenshot / list / voice) tuck away while Guide is on, returning when it's toggled off.
- **Bar connects to the composer on every site** — all generic-adapter providers (ChatGPT, Grok, Perplexity, Copilot, and ~80 more) plus GLM and Meta now inside-mount the status bar into the chat box like DeepSeek, instead of the detached floating pill. `placeBar` anchors to the composer before ever floating.

### Fixed
- Fixed a corrupted voice-button icon that rendered as a broken glyph; gave the quick-screenshot / quick-list buttons clean, consistent SVG icons (unified icon-button family with light-mode variants).

## [5.0.0] - 2026-09-27

### Added
- **28 new AI providers** including Perplexity AI, Windsurf, Pool, Ramp, Phind, Copilot, Mistral, Poe, HuggingChat, Reka, Pi, Coral, OpenRouter, v0, Genspark, Lambda Chat, Yiyan, MiniMax, Manus, Together, LM Arena, Doubao, Yuanbao, Moonshot, Jupi, Wonderseek, Replicate — site count is now **99**.
- **5 beta AI providers**: Chat.AI (chatai.commander.ai), Levera AI, Mage (mage.space), Friend (friend.com) and Humane (app.humane.com).
- **Bolt provider** — new generic adapter for bolt.new / bolt.ai.
- **Voice transcription input** — a microphone button in the bar that speaks into the Web Speech API and inserts the transcript into the AI composer.
- **CSS theme picker** — system / dark / light / soft-light themes for the VoidScript UI, persisted across sessions.
- **Code block action buttons** — settled `###LUA###` blocks in the chat replay get Copy Luau / Run in Studio buttons.
- **Multi-tab session status** — the popup now lists all browser tabs with an active VS session and a "Go" button to jump to each.
- **Session recording/playback** — record a build session (commands + results) and save/load/replay it step by step.
- **Freeze recovery** — when generation appears stuck (generating flag on but idle >5s), the loop fires a one-shot native stop click to unstick the site.
- **Macro system** — new virtual commands `save_macro`, `run_macro`, `list_macros` let the agent save and replay named Luau snippets without re-pasting code each session.
- **Build wizard** — a 3-question menu flow (what to build, genre, specifics) that assembles a setup prompt and auto-starts a session in a fresh chat.
- **Project type presets** — save/load named bundles of (genre, preferred model, custom prompt, addon MCP servers) for one-click reuse.
- **Drift guard** — after 2 consecutive same-command failures, the loop proactively re-injects that command's exact name + signature to stop name-drift in long sessions.
- **More MCP templates** — added Spotify, Git, Docker, Redis, Google Drive, Google Calendar, IMAP email templates to the addon server list.
- **`extractLua` parser helper** — cleanly extracts Lua source from a `###LUA###` block for the code-block buttons.

### Changed
- **Extension version → 5.0.0** (bridge `BRIDGE_VERSION` kept in sync). Manifest description now advertises 99 supported AI sites.
- **Discord links updated** to https://discord.gg/KmkCKwUbcX across README, landing page, and the in-page bar.
- **Kimi URL updated** from `www.kimi.com` to `kimi.ai` (the live domain).
- **UI text softened** — "Agent active" → "Connected", "Starting the Roblox agent" → "Connecting to Roblox", "No agent here" → "Not monitoring this chat", start button relabeled from "Start Roblox agent" to "Start VoidScript".
- **Tool reminder frequency** lowered from every 20 to every 12 successful calls to stop command-name drift in long sessions.
- **Anti-detection note** added to the system prompt for DeepSeek.

### Fixed
- **DeepSeek: hardened stop-button glyph detection** — `isStopBtn()` now also matches a `<path d="M1…">` variant seen in some V4 builds, so a still-streaming turn is no longer misread as idle.
- **DeepSeek: bot-check overlay detection** — the bar now hides behind DeepSeek's challenge/captcha overlay instead of intercepting clicks on it.
- **Gemini: tool-dropoff in long sessions** — the command-list reminder fires more often and the drift guard re-anchors a drifting command name before the model drifts fully off Roblox commands.
- **Kimi: native-agent mode warning** — Start is now disabled with a clear banner when Kimi's own native agent mode is active, preventing native tool interception.
- **Claude: selector hardening** — the generic provider now falls back to `[data-message-author-role="human"]` for user turns, scopes the editor to Claude's ProseMirror `div[role="textbox"]`, and implements `replyUnsettled` so a mid-render command read does not fire a premature parse error.

## [4.1.0] - 2026-08-27

### Added
- **10 new OP AI providers** across the 3.1/3.2 cycle: T3 Chat, Poolside AI,
  Inflection AI, Hume AI, Twinny, Cody (Sourcegraph), Chatbase, Botstack, Flowise
  and Lobe. Site count is now **67**.
- **Token estimate toggle** (`vsShowTokenEstimate`) in the bar while running.
- **Leaderboard export** — copy button on the popup provider leaderboard.
- **Explain my code wizard** — plain-English walkthrough, sibling to "Review my code".
- **Roblox coordinate & orientation mapping guidance** in the system prompt (left-handed Y-up: X=right, Y=up, Z=forward; Part.Size = Vector3.new(WIDTH, HEIGHT, DEPTH); Rotation degrees applied Z-Y-X; CFrame.Angles in RADIANS) — targets the upside-down / flipped / on-its-side build class of bug.

### Changed
- Extension version → 4.10 (bridge `BRIDGE_VERSION` kept in sync). Manifest
  description now advertises 67 supported AI sites.

## [3.2.0] - 2026-08-27

### Added
- **10 new OP AI providers this cycle.** First batch (3.1.0): T3 Chat (t3.chat),
  Poolside AI (poolside.ai), Inflection AI (inflection.com), Hume AI (hume.ai) and
  Twinny (twinny.ai). Second batch (3.2.0): Cody/Sourcegraph (sourcegraph.com),
  Chatbase (chatbase.io), Botstack (botstack.com), Flowise (flowise.ai) and Lobe
  (lobe.github.io). Each on the selector-driven generic adapter. **Site count is
  now 67.**
- **Token estimate toggle** (from 3.1.0): a "Show token estimate in the bar" setting
  (`vsShowTokenEstimate`) controls the live session token count in the status bar.
  Off by default; persisted via the existing settings export.
- **Leaderboard export** (from 3.1.0): the popup's provider leaderboard now has a
  "✓ copy" button that copies the ranked success-rate table as plain text.
- **Explain my code wizard** (from 3.1.0): a one-click flow (next to "Review my
  code") that makes the agent explain the project in plain, non-technical language.

### Changed
- Extension version → 3.2.0 (bridge `BRIDGE_VERSION` kept in sync). Manifest
  description now advertises 67 supported AI sites.

## [3.0.2] - 2026-08-27

### Added
- **Roblox coordinate & orientation mapping guidance.** The system prompt now
  carries an explicit left-handed Y-up mapping section (X=right, Y=up, Z=forward;
  Part.Size = Vector3.new(WIDTH, HEIGHT, DEPTH); Rotation is degrees applied as
  Z-Y-X; CFrame.Angles takes RADIANS). This targets the recurring "the AI built my
  elevator upside-down / on its side / facing backwards" class of bug - those are
  orientation mistakes, not position bugs, and the guidance tells the model to
  inspect Orientation/CFrame (not Position) and fix the axis mapping.

### Changed
- Extension version → 3.0.2 (bridge `BRIDGE_VERSION` kept in sync).

## [3.0.0] - 2026-08-06

### Added
- **Vault of virtual commands.** `revert_session` restores every script the
  session edited back to its session-start state (the undo stack is now
  persisted across reloads); `export_snapshot` downloads a JSON snapshot of the
  session's edits + pre-edit sources; `command_palette` indexes all virtual
  commands; `plan_build` pauses the loop so the user can review a build plan
  before anything changes; `keep_going` clears the error tally and continues.
- **Command budget.** A per-session tool-call cap (Settings): when the cap is
  hit the loop pauses with an ERROR; Resume grants a fresh batch.
- **Trust levels.** "High" runs every command, "medium" asks before destructive
  commands and pauses after errors, "low" asks before every command.
- **Auto-screenshot on tool error.** With the toggle on, a failed tool captures
  the Studio screen so a vision-capable model can diagnose the failure before
  retrying.
- **Place backups UI.** The menu lists bridge backups with Backup now / Restore /
  Delete (the bridge already auto-backed-up before destructive ops).
- **Launch at login.** Enable/disable the bridge's OS auto-start entry from the
  menu (bridge-side auto-start existed; now it is remote-controllable).
- **Per-place prompts.** Optional separate custom prompt per open place
  (`vsCustomPromptByPlace`), falling back to the global prompt.
- **Settings export/import** and **Session presets**: backup/restore all settings
  as JSON, and save/apply named setups (prompt + genre + addon servers).
- **Token estimate.** The bar shows a running ~token count for the session, and a
  cumulative per-provider lifetime total is kept locally.
- **Provider stability notes.** Curated per-provider reliability notes shown in
  the menu.
- **More genres** (Sports, Sandbox, Life Sim, Battle Royale, Crafting) and
  **more MCP templates** (Everything, Brave Search, Slack, PostgreSQL, Notion,
  YouTube transcripts).
- **Humanize send timing** is now a settings toggle instead of a code constant.
- **Place name shown in the bar** when connected.
- **Bridge security defaults:** origin allow-list + optional shared-secret token,
  full `--diagnose` payload, backup/config/log helpers, stale-child watchdog, and
  startup auto-install.

### Changed
- **Extension version → 3.0.0** (bridge `BRIDGE_VERSION` kept in sync).

### Fixed
- **start.bat opened dozens of windows when an update was available.** After
  applying an update the launcher spawned a fresh window, but the old window
  never actually exited (it carried on and started its own bridge) and the new
  window re-ran the updater - so whenever the updater reported `UPDATE_APPLIED`
  again, yet another window was spawned, and so on. The restart window now runs
  with `--skip-update` (it never re-runs the updater), the old window exits for
  real after spawning, and a restart counter stops the chain after 3. `update.py`
  also no longer drops `applied_tag` when it refreshes its cached release info,
  so a release that was already applied can't be re-applied on a later launch.

## [2.11.0] - 2026-08-05

### Added
- **⏸ Pause / ▶ Resume.** A bar button shown while the agent runs parks the
  loop exactly like a hidden-tab pause (input stays locked, bar shows "Paused ·
  press Resume") and resumes right where it left off.
- **Live session timer in the bar.** While the agent runs, the bar shows the
  elapsed time plus a running command tally, updated live.
- **Completion summary toast.** When a session loop ends, a toast reports
  "Session done · N commands ok · M errors · K screenshots · in mm:ss".
- **Completion chime.** A subtle WebAudio tone at loop end — a rising triple
  note when the run was clean, a descending pair when there were errors.
  Silently no-ops if audio is blocked or unavailable.
- **Copy system prompt.** A menu button copies the exact system prompt a new
  session receives (built-in prompt + custom prompt + project type + preferred
  model), for inspecting or sharing what the agent actually sees.
- **Copy build log / Copy last error.** Menu buttons export this conversation's
  tool activity from the persisted timeline — the full log, or just the most
  recent failed call — handy for bug reports.
- **Alt+V shortcut.** Toggles the Switch AI / options menu even in the minimal
  pre-session bar state.

### Fixed
- **start.bat auto-update never fired.** The `UPDATE_APPLIED` prefix is 14
  characters but the check sliced 15, so a downloaded update was applied on
  launch but never announced nor restarted into. start.bat now matches
  correctly — start.bat alone keeps you updated, no update.bat needed.

### Changed
- **Extension version → 2.11.**

## [2.1.0] - 2026-08-05

### Added
- **Provider labels.** Claude is marked **best** and DeepSeek, GLM and Qwen are
  marked **recommended** in the "Switch AI" menu and in the popup's provider pill,
  so the recommended picks are visible at a glance.
- **Preferred model selector.** A "Preferred model" field in the menu forces a
  model on the current site at session start where the site's picker can be
  driven (DeepSeek: instant/expert/vision; Kimi: e.g. K3). The chosen model is
  also injected into the system prompt so the agent never fights it. Empty keeps
  the site default.
- **Context compaction.** When a provider reports its context limit or a too-long
  conversation, the loop asks the model for a compact "build state" handoff,
  saves it, and the next session started in a fresh chat auto-seeds that handoff
  as its first message — long builds continue in a new chat instead of dying.
- **Session resume across reloads.** The auto-resume watchdog's freshness clock
  is now persisted and restored on reload in the same conversation, so an
  interrupted command turn is picked back up automatically after a page refresh.
  Cleared on any deliberate stop.
- **Pre-flight Luau validation.** Before `execute_luau` is sent to Studio, a
  conservative syntax scanner flags unambiguous errors (unclosed long
  comments/strings, unterminated strings, unbalanced brackets) so the model fixes
  them without burning the ~20s Studio call. `multi_edit` edits are also shape-
  checked before dispatch.
- **Auto-retry rule.** The system prompt now instructs the agent to fix and retry
  a recoverable command error ONCE, then stop and diagnose instead of looping the
  same failing call.
- **Roblox coding conventions in the system prompt.** A new section mandates the
  Luau dialect (not generic Lua), calls out Roblox-vs-Lua differences
  (`typeof`, `task.wait`, `Instance.new`, `Connect`), and names
  `create.roblox.com/docs/reference/engine` as the authoritative API source.
- **One-click code review mode.** A "Review my code" menu action makes the agent
  read the project memory and key scripts, then report bugs, Luau/Roblox issues
  and performance problems — without editing anything until the user approves.
- **15 MCP addon templates with npx/uvx option.** Added Blender, Sketchfab,
  Aseprite, Filesystem, Fetch, Memory, Sequential thinking, Time, SQLite, GitHub,
  Playwright and Puppeteer to the existing Figma/Unreal/Godot. A runtime picker
  offers **npm (npx)** and **Python (uvx)** commands where both exist, and a
  **uvx guide** button shows the full install/setup instructions for Python-based
  servers.
- **5 new build-wizard genres:** Tower Defense, RPG/Quest, Farming Sim, Escape
  Room and Horror, each with curated Roblox best practices.

### Changed
- **Generic provider (Arena Agent etc.) bar placement.** The bar now anchors to
  the first ancestor carrying a `rounded*` class (same rule as the hand-tuned
  providers) and the composer-frame lookup no longer throws on an empty composer
  selector, so the VoidScript bar sits correctly on Arena's agent composer.
- **Auto-updater trusts GitHub tags.** `update.py` now treats the release tag as
  the version source of truth and records `applied_tag`, so a `V2.x` tag is never
  re-applied (fixes the "2.0.1 is not better than 2.0.0" loop). Installed version
  reports the higher of the manifest and the applied tag.
- **`start.bat` no-winget Python installer.** When Python is missing and winget
  isn't available, `:install_python_direct` downloads the official Python 3.12
  installer and sets it up silently, instead of aborting.
- **Extension version → 2.1.**

## [5.0.0] - 2026-09-27

### Added
- **25 new beta AI providers: ChatGPT, Grok, Perplexity, Copilot, Mistral, Poe,
  HuggingChat, Phind, Blackbox, You, Groq, LMArena, Doubao, Yuanbao, Reka, Pi,
  Coral, OpenRouter, v0, Genspark, Lambda Chat, ERNIE, MiniMax, Manus, Together.**
  These run on a new selector-driven adapter factory (`providers/_generic.js`,
  `VSGeneric(cfg)`) that implements the full `VSProvider` interface with
  framework-neutral defaults (textarea *and* contenteditable composers, stop-
  button-or-quiescence generation detection, best-effort image attach). Each new
  provider is a thin config of CSS selectors. They are marked **BETA** in the
  panel; selectors were written from documented/common patterns rather than
  validated live, so some will need per-site tuning. The hand-tuned providers
  remain preferred.
- **Firefox support (121+).** Added `browser_specific_settings.gecko` to the
  manifest and documented the `about:debugging` load flow. Chromium browsers
  (Chrome, Edge, Brave, Opera, Vivaldi) already work. README now documents the
  Safari path (one-time Xcode conversion on macOS; not supported out of the box).

### Changed
- **Popup UI refresh.** Elevated status card, softer palette, hover/press
  feedback on buttons, and a header pill that now shows whichever AI you're on
  (was a hardcoded "DeepSeek" label). The popup's supported-host list now
  includes the beta sites so **Settings** works there too.
- **`start.bat` banners** redrawn with box-drawing characters for a cleaner
  console (launch/Python-detection logic unchanged).
- **Rebranded ZeroScript → VoidScript** across all user-facing text, the manifest
  name, and the extension folder (`voidscript-extension/`). Internal code symbols
  (`VS`, `VSProvider`, `vs-` CSS) are unchanged. GitHub links now point to
  `cjl26rg2/Void-Script`; a **Website** button in the popup opens
  `https://void-script.vercel.app/`.
- **New VoidScript logo** — a glowing "void" portal ring with a `</>` script
  glyph. Source SVGs in `assets/` (`icon.svg`, `banner.svg`); the extension
  toolbar icon (`icon.png`) and `assets/banner.png` were regenerated from them.
- **Landing page (`index.html`)** — a self-contained VoidScript site (void/violet
  + Roblox-red theme, all 32 providers, setup steps) served at the repo root so
  the connected Vercel project deploys it instead of returning 404.
- **Rewrote the launchers and popup from scratch.** `start.bat`,
  `MacOS_Start.command`, `popup.html` and `popup.js` are fresh VoidScript
  implementations (own structure, naming and layout) rather than edits of the
  originals — same behaviour and message protocol. Both launchers share the
  Roblox-themed ASCII "brick" banner with 24-bit ANSI colour (red/violet),
  colour-coded steps and a red "keep this window open" box. ASCII art is used
  deliberately: colour codes + Unicode box glyphs break cmd's parser under
  chcp 65001. Python-detection/winget/port logic is preserved. The popup now
  drives its supported-site list and header pill from one provider table.

## [1.5.0] - 2026-07-30

### Fixed
- **Backgrounding the AI tab no longer strands a pending command as a grey
  "not run".** `waitForResponse` now parks entirely while the tab is hidden and
  shifts every internal deadline (inactivity timeout, warm-up, text-stability,
  etc.) forward by the parked duration, instead of letting them keep ticking
  off-screen. `waitVisible` switched from polling to listening for
  `visibilitychange` - Chrome clamps chained background timers to one tick per
  minute after 5 minutes hidden, which used to delay the resume by up to a
  minute. The bar now shows a **Paused** state while parked, and a genuinely
  empty reply from the site now shows a banner instead of ending the loop
  silently.
- **Gemini: fixed the page freezing (nothing clickable) on a large tool
  result.** Gemini's composer inserts text line by line, synchronously, on the
  main thread - a 2599-line `http_get` result froze the page for about a
  minute. Outgoing text is now capped (120k chars / 1200 lines, head and tail
  kept) and the insert yields to the browser every 120 lines.
- **Gemini: fixed the system prompt occasionally never leaving the composer on
  Start.** The wedged-stop-button detector latches for 2 seconds from the
  first time it sees a stop button, so the single recovery attempt at boot -
  the very first sighting - was refused by its own guard. It now retries
  across that window and retypes as a last resort.
- **Kimi: fixed the model picker opening and closing in a loop.** Kimi's K3
  update removed the model (K2.6) the default-model routine used to select,
  so it kept hunting for a row that no longer exists. It now only acts when
  the current model is **K3 Swarm** (matched by name, any UI language) and
  gives up after a few tries instead of looping. The native-agent warning
  guard was equally broken by the same update and now reads the model label
  at its new location.
- **Degraded mode (Roblox Studio closed, running on an addon server only)
  starts much faster.** The tool catalogue request blocks until timeout when
  Roblox is down, and the boot sequence called it three times in a row. Added
  a 30s cache on the catalogue and cut the request timeout from 25s to 10s.

## [1.4.9] - 2026-07-24

### Added
- **Popup: new Settings button.** Opens the same Switch AI / support panel
  as the in-page bar, without needing an already-started conversation. The
  footer text no longer singles out chat.deepseek.com - it now points to
  "a supported AI" since seven providers are supported.
- **Bridge: auto-recovers its own port on relaunch.** Relaunching `start.bat`
  while a previous Bridge was still holding port 17613 (window closed with
  the X, a crash, a double launch) used to crash with a cryptic, sometimes
  localized `OSError [WinError 10048]`. The Bridge now detects and kills a
  leftover Bridge process it can positively identify (by command line, never
  by process name alone) before binding, and falls through to a clear,
  actionable message - with the exact `netstat`/`taskkill` commands and the
  `VS_BRIDGE_PORT` override - if the port is held by something else.

### Fixed
- **The agent could parse/execute commands while its AI tab was backgrounded
  or the window minimized.** Background tabs throttle rendering and timers,
  which made DOM reads unreliable and could send duplicate feedback or run a
  tool blind (observed live: GLM kept running `execute_luau` while minimized).
  The agent loop, the tool-dispatch step, and the auto-resume watchdog now
  all gate on `document.visibilityState` and park - with no time limit -
  until the AI tab is the foreground tab again, then resume exactly where
  they left off. Working with Roblox Studio focused while the AI tab stays
  the active tab in its own window is unaffected; this only pauses execution
  while that tab is truly backgrounded or its window minimized.

## [1.4.8] - 2026-07-22

### Added
- **macOS and Linux support for the Bridge.** A new self-contained
  `MacOS_Start.command` launcher (double-click in Finder - no Terminal
  knowledge needed) finds Python 3.9+, installs `websockets` if missing,
  frees a previous Bridge still holding the port, and runs `bridge.py`,
  mirroring what `start.bat` already does on Windows. `launch_studio_mcp.py`
  now also locates Roblox Studio's MCP binary inside the macOS app bundle
  (`RobloxStudio.app/Contents/MacOS/StudioMCP`), with a `VS_STUDIO_MCP_PATH`
  override for non-standard installs.
- **DeepSeek: outgoing messages are now truncated to fit its input limit.**
  DeepSeek's composer silently refuses to send past 163840 characters
  (validated live), which could wedge the agent in the input box after a
  large tool result (a big `http_get` / `get_page_text` / Luau dump). Long
  results are now truncated to a safe margin below that limit, keeping both
  the start and the end of the content, the same approach already used for
  Qwen and Arena.

## [1.4.7] - 2026-07-21

### Fixed
- **Qwen: a tool could show a green "done" check while it never ran and returned
  no result** (seen rarely with repeated `multi_edit` / `execute_luau` calls, with
  no Stop or regenerate involved). Qwen virtualizes its message list, so the
  off-DOM "already executed" record was keyed on the positional turn index, and
  two turns that shared the same 60-character command prefix could collide on the
  same index. That false positive made the auto-resume watchdog skip the fresh
  command (so it never ran, no result was injected) while the chip was still
  painted a green check. The dedupe now keys on Qwen's stable per-turn id
  (`chat-response-message-<uuid>`, exposed as `itemKey`) instead of the index, so
  the collision cannot happen.
- **Qwen: the VoidScript bar covered the "Expand more models" submenu.** That
  fly-out is a separate body-portalled `.ant-dropdown` at a low z-index, not the
  main model dropdown, so the bar drew on top of it. Raised just that dropdown
  above the bar (scoped so other Ant menus and tooltips are untouched).

### Added
- **Per-model image support on Qwen.** Qwen offers both multimodal and text-only
  models, switchable mid-conversation, and image input only works on the
  multimodal ones. `screen_capture` and image input are now enabled only on a
  vision-capable model (Qwen3.7-Plus, Qwen3.6-Plus, Qwen3.6-27B, Qwen3.8-Max-Preview)
  and correctly withheld on a text-only one (Qwen3.7-Max, Qwen3.6-Max-Preview),
  read from the selected model and updated when you switch models.
- **Image support on DeepSeek's Vision model.** DeepSeek forces its Expert model
  for the agent, but if you choose the Vision tab that choice is now respected and
  `screen_capture` plus image input are enabled for it. Selecting Vision is
  detected reliably, including after switching conversations. Image attachment was
  also fixed: it used to stage the same image multiple times and never send,
  because the upload went through a paste that only made a local preview and never
  uploaded the file. It now uses DeepSeek's real file upload and sends once the
  upload completes.

## [1.4.6] - 2026-07-19

### Fixed
- **Kimi's login and "priority queue" popups were covered by the VoidScript
  bar**: both render as full-screen fixed masks (`.login-modal-mask` and
  `.modal-mask`) rather than a standard `[role="dialog"]`, so the generic
  overlay probe used by other providers never caught them. The anchored bar
  (a full-width fixed element hugging the composer) and the "unstable"
  warning pill sat on top of the mask and could intercept clicks meant for
  its buttons (e.g. "Continue with Google"). Added a Kimi-specific
  `overlayBlocking()` that detects both mask classes by real visibility; the
  core already hides the whole bar while it reports true, and restores it the
  instant the mask clears.

### Added
- **Kimi now defaults fresh chats to K2.6**: Kimi lands new chats on K3,
  which is flagged unstable here and easy to miss switching away from. A
  brand new or emptied chat now picks K2.6 automatically, once; a deliberate
  manual switch to K3 on that same chat is left alone.

## [1.4.5] - 2026-07-18

### Fixed
- **DeepSeek re-executed old tool commands when scrolling up in a long
  conversation**: DeepSeek virtualizes its message list, so scrolling up makes
  an OLD command turn the last *rendered* assistant turn - its injected result
  sits below the fold (unrendered), the in-memory "already executed" record is
  empty after a page reload, and the node change makes generation detection
  flicker true, refreshing the auto-resume watchdog's freshness clock. The
  watchdog then re-fired the historical tool. Three-layer fix (validated live):
  - The off-DOM executed/halted dedupe maps now key on a virtualization-stable
    per-turn id (`itemKey`, DeepSeek's `data-virtual-list-item-key`) instead of
    the positional assistant index, which collides across scroll windows.
  - The watchdog skips any command turn whose stable id is below the session's
    high-water mark (`A.maxTurnId`) - a scrolled-back old turn can never resume,
    even right after a reload (`resume.skipOld` in the diag ring).
  - The watchdog also skips a command turn whose injected result is rendered
    right below it (settled history), a provider-generic guard.
- **Gemini stranded a tool result in the composer ("Message could not be
  sent")**: after a generation ends, Gemini's action button can stay WEDGED on
  the stop icon instead of reverting to the send arrow. The loop's generation
  *detection* already tolerates this (WEDGE_MS), so the tool ran, but the *send*
  waited for an `arrow_upward` button that never appeared - four retries failed
  and the injected result sat unsent in the composer. `typeAndSend` now resets a
  frozen stop button (clicking it, guarded by the same not-actually-generating
  check) so the send button reappears, then sends (validated live). The native
  stop-click hook now ignores non-trusted (programmatic) clicks, so this
  un-wedge click is never mistaken for the user halting the agent - otherwise
  the next legitimate command was wrongly marked "stopped".

## [1.4.4] - 2026-07-16

### Fixed
- **Qwen fired tool commands mid-stream ("Bad JSON" while Qwen was still
  writing)**: Qwen's frontend update (fe 0.2.73) now emits `status:"finished"`
  in its SSE stream ~12s before the stream actually closes. The network tap
  treated that as the turn's end, so a still-incomplete command (e.g. an
  unclosed `###LUA###` block) was extracted and sent, and the loop's premature
  "unclosed" feedback was injected while the model kept writing. Fixed by no
  longer treating `status:"finished"` as done, and by having generation
  detection check the DOM stop button first (validated live: it now tracks the
  real stream end closely, unlike its old ~6s lag).

### Changed
- **Removed the "⚠ unstable" badge on Qwen's Auto/Think modes**: those modes
  used to make Qwen claim a tool "does not exist" without even trying it. The
  extension never force-switches Qwen's mode, so Auto (Qwen's own default) is
  left untouched.

## [1.4.3] - 2026-07-15

Adds a seventh AI provider (Meta AI) and fixes a Qwen tool-turn regression, plus
further Studio-port recovery hardening and a friendlier system prompt.

### Added
- **Meta AI (www.meta.ai) as a provider**: full VoidScript support on Meta AI -
  new `providers/meta.js`, manifest content script + host permissions, and the
  provider switcher entry. Handles Meta's React DOM: reasoning ("Réflexion")
  chain-of-thought is excluded from the read text, the interactive JSON viewer
  and collapsible code blocks are masked so a streamed command never flashes, and
  the composer card is fully covered while typing. Meta AI accepts very large
  prompts, so no Qwen-style send cap is needed.

### Fixed
- **Qwen tool result took ~30s to inject on every tool turn**: Qwen dropped the
  assistant turn's own `id`, so `lastAssistantId()` returned null and the core
  fell back to the virtualized flat count, waiting the full ~30s NO_TURN_GRACE
  each turn. It now reads the stable `chat-response-message-<uuid>` descendant
  (with the old id kept as a fallback).
- **Qwen refused oversized messages**: a large tool result past Qwen's 131072
  character composer cap silently wedged the loop in the input box. Outgoing text
  is now truncated to a safe margin, keeping the head and tail and marking the gap
  so the model does not re-run the command.

### Changed
- **Friendlier, less restrictive system prompt**: the "do not use native tools"
  wording is reframed as a technical note (the site's own sandbox cannot reach the
  user's Studio) rather than a hard prohibition, with an explicit "you can act
  directly in the user's project" section. Reduces provider refusals.
- **Studio-port recovery hardening**: PID-based reclaim of leftover `StudioMCP`
  zombies and clearer, de-duplicated action banners on top of the 1.4.2 port
  hijack recovery.

## [1.4.2] - 2026-07-13

Follow-up robustness fixes for the Studio-connection failures the 1.4.1 work
did not cover: a rare "0 tools that survives every restart" deadlock, and a
third-party app silently hijacking Studio's MCP port.

### Fixed
- **A third-party app (e.g. ropilot) hijacking Studio's MCP port**: whichever
  program binds Studio's MCP port (13469) FIRST wins it, and if that is not
  Studio, `StudioMCP.exe` connects to the wrong host - the handshake succeeds
  but no tools ever appear. A PC reboot never helps because the offending app
  restarts with Windows and can grab the port before Studio again. The existing
  one-shot port check at boot could miss it. The bridge now detects the hijack
  from an unmistakable, timing-independent signal - `StudioMCP.exe` reporting it
  cannot parse the host's messages on that port - then kills the offending
  process (by port owner, with a fallback that kills the known squatter by
  name), restarts the proxy, and tells the user which app to uninstall or remove
  from Windows startup so it stops coming back. It never stays silent: if it
  cannot identify or kill the squatter it prints how to find it by hand.
- **`_port_owner` was IPv4-only**: the internal port-owner probe ran
  `netstat -p TCP`, so a squatter listening on IPv6 loopback was invisible to
  it; it now scans TCP and TCPv6.
- **A missing custom-MCP command (e.g. `uvx` not installed) looked like an
  endless silent restart loop**: when a configured server's command could not
  be found on PATH, the process never started, so there was no exit code and no
  stderr, and the crash-loop banner printed "the server printed no error output
  before dying". The bridge now catches the launch failure and names the real
  cause ("command not found: 'uvx' ...") both on the first attempt and in the
  crash-loop banner, while auto-restart keeps retrying in case the dependency
  is installed later.

### Changed
- After killing a port squatter, the "toggle Studio's MCP server OFF/ON"
  instruction now prints IMMEDIATELY (right after the kill) instead of only
  after the ~48s server-launch grace loop - so the user acts within seconds
  instead of staring at a seemingly-idle terminal for a minute. Toggling early
  also lets the grace loop pick up the tools and go green right away.
- **0 tools that no restart could fix**: if a `StudioMCP.exe` from a crashed
  session kept listening on Studio's MCP port (13469), reopening Studio made
  its MCP plugin do its one-shot registration against that *zombie* process.
  Because a Studio window was now running, both existing cleanups skipped it
  (the orphan-killer only acts when no Studio runs; the port check treats any
  Roblox-path owner as legitimate), so our fresh proxy could never own the
  port - 0 tools forever, unfixable by restarting Studio or the bridge in any
  order. The bridge now identifies the port owner by process ID: a
  `StudioMCP.exe` holding the port that this bridge did not launch (outside our
  own process tree) is a leftover by definition, so it is killed and the proxy
  restarted - at boot and again in the live watcher if the catalogue stays
  empty with Studio open. It then tells the user the one action that finishes
  recovery: open Assistant Settings > MCP Servers so Studio re-registers. If
  the process tree can't be read, nothing is killed (a healthy connection is
  never put at risk).
- The extension now tells non-technical users to "Run start.bat" instead of
  "Run python bridge.py" / "Run the VoidScript bridge" in the offline panel,
  popup, and startup banner, matching the one-click launcher the README ships.

## [1.4.1] - 2026-07-11

Robustness release focused on the Roblox Studio connection lifecycle. Every
fix below was reproduced and validated live against a real Studio + Blender
setup, including the Roblox-side bugs reported on the devforum (StudioMCP
stale-pipe disconnects, MCP toggle turning off after a Studio update).

### Fixed
- **Phantom "Studio connected" state**: leftover `StudioMCP.exe` processes
  from a previous session or a Studio crash kept answering the bridge as if a
  Studio were attached, so the terminal and the extension showed green with
  Studio fully closed. The bridge now kills orphaned `StudioMCP.exe` at boot
  (only when no real Studio window exists, so a live connection can never be
  hit), and the boot banner re-confirms a positive probe before announcing a
  connection.
- **Status dot stuck green with Studio closed**: when StudioMCP advertised an
  empty tool catalogue (Studio closed at launch), the connectivity probe
  returned "unknown" instead of "disconnected", and the extension's
  don't-degrade-on-unknown rule kept the dot green forever. An alive Roblox
  proxy with an empty catalogue is now an authoritative "not connected".
- **Studio opened after the bridge was never detected** (yellow until a full
  bridge restart): two combined causes. (1) Nothing ever re-asked for the
  tool catalogue once the launch-time retry window expired - the watcher now
  re-polls `tools/list` while the catalogue is empty, so a late-attaching
  Studio is picked up within seconds. (2) Studio's MCP plugin registers with
  the MCP channel exactly ONCE (late in Studio's boot, or when the Assistant
  Settings > MCP Servers panel is opened/toggled) and never retries; the
  bridge's own recovery restarts could kill the MCP listener at that exact
  moment, permanently orphaning the plugin. The bridge no longer restarts the
  Roblox proxy while a Studio window is running, and both the terminal and
  the extension now say the one thing that actually fixes an orphaned
  plugin: open Assistant Settings > MCP Servers in Studio (validated three
  times live; a proxy-side restart provably cannot repair it).
- **Watcher crash silently disabling all Studio monitoring**: an unbound
  variable in the place-churn detector could kill the background watcher
  right after a reconnect, silently stopping every status update until the
  next bridge restart. Fixed, and both watchers are now supervised: a crash
  is logged in red and the watcher restarts itself in 5 seconds.
- Boot/connection messages no longer blame the merged multi-server tool count
  on Roblox ("49 tools loaded but NO Roblox Studio connected" when 22 of
  those were Blender's): every Roblox-specific message now uses the
  Roblox-only count.

### Added
- **Fast startup with addon servers**: MCP servers now launch in parallel and
  the extension-facing socket opens immediately, so a slow or absent Roblox
  Studio no longer delays Blender (or any addon) by up to a minute. The
  Roblox diagnostic continues in the background and the bridge pushes status
  updates to already-connected extensions as servers come up - previously an
  extension that connected early could keep a stale "addon offline" snapshot
  forever (greyed Start button instead of the orange degraded start).
- **Self-healing for Roblox's own disconnect bugs**: sustained loss of the
  Studio connection (stale named-pipe state, periodic silent disconnects)
  now auto-restarts the Roblox proxy - but only when no Studio window is
  running, where it is safe and effective.
- **Studio-update detection**: when a disconnect coincides with a new Studio
  version folder appearing, the terminal says Studio likely turned its MCP
  toggle off after updating (a known Roblox bug) and points at the exact
  setting, instead of retrying a recovery that cannot work.
- Extension messages distinguish "Roblox Studio is not running" from "Studio
  is running but not connected" (new `studio_proc` status field), each with
  its own corrective step.
- Terminal spinner during slow startup phases (server launch, Studio
  attach), so the console never looks frozen; only one spinner animates at a
  time.
- start.bat hardening: refuses to run from an unextracted ZIP, handles
  missing winget, rescans install folders after a winget install (PATH not
  refreshed), prints the Python version and the bridge's exit code on
  screen, and logs the Windows build - so a single screenshot of the
  terminal carries enough context for support.

## [1.4.0] - 2026-07-08

### Added
- Multi-MCP addon servers (experimental): a new "MCP servers" section in the
  panel menu lets you add or remove additional MCP servers (Blender,
  Sketchfab, or any local MCP command) alongside the always-primary Roblox
  Studio connection. The bridge rewrites `config.json` and restarts itself to
  load a change; Roblox stays protected from edits/removal and its status dot
  is scoped to Roblox alone so an addon going down never misrepresents the
  primary connection. New `list_mcp_servers` command and a `server` param on
  `list_commands` let the model discover and use addon tool sets on demand.
  When Roblox is down but an addon server is alive, the panel now offers a
  degraded start instead of refusing to start at all.
- Vision support (screen_capture / other tool-returned images) enabled for
  Arena, Gemini, GLM, Kimi and Qwen, each with a real "upload finished" signal
  before sending instead of trusting the first local preview, fixing several
  silent-attachment-drop and duplicate-attachment-on-retry bugs. A tool from
  any connected server that returns an image now gets the camera chip and is
  remembered for future calls, even for a custom MCP server whose name gives
  no hint it returns images.
- Parser: a JSON command cut off by the model's own output limit, missing
  only its trailing closing brackets, is now auto-completed and executed
  instead of failing with a parse error and forcing a full retry turn.
  Strictly refuses to salvage anything where real content (not just closers)
  was cut off.
- Per-reason parse-error feedback (cut off, bad JSON, missing ###LUA###
  opener, wrong envelope) instead of one generic "bad JSON" message, so the
  model fixes the actual problem instead of guessing.

### Fixed
- DeepSeek: a command's chip could show green "done" while DeepSeek was still
  streaming the reply, on back-to-back calls to the same tool. Caused by
  DeepSeek's list virtualization defeating the turn-count identity guard;
  fixed with a stable per-turn id.
- GLM: new "scroll to bottom" buttons were mistaken for the Stop button and
  permanently latched generation state to "busy." Raw command JSON could leak
  into the visible reply when nested inside a paragraph. An image filename
  could corrupt result-chip detection.
- Kimi: added detection of Kimi's own native "Agent" mode, which conflicts
  with VoidScript's command protocol; Start is disabled with a warning until
  it's turned off. Fixed the hidden file-upload input not existing until the
  "+" menu is opened, raw command text leaking when nested/oversized, and
  normal model prose containing "try again" being misread as a site error.
- Qwen: same "try again" false-busy fix as Kimi. A/B "carousel" comparison
  turns (where the composer disappears mid-carousel) now auto-resolve to
  Response 1 once both candidates finish, instead of stalling or misreading a
  candidate as a truncated command.
- Arena: send is now confirmed until the composer actually clears instead of
  trusting a single click, preventing stranded messages/attachments; the chip
  now anchors below the reply text instead of floating above it.
- A command turn abandoned mid-stream (reload, or superseded by a
  regenerate) no longer shows a false green checkmark; it now shows a
  neutral "not run" state instead.
- A tool's own in-body error (e.g. "Output of '...': Error executing code...")
  now settles the chip red instead of green, even when the tool didn't use
  VoidScript's own ERROR wrapper.
- Regenerating a stopped command no longer briefly re-shows the old call's
  chip before the new one streams in.

### Changed
- The version number next to the VoidScript name in the panel is now small,
  plain text instead of a bordered green badge.
- System prompt updated to cover multiple MCP servers: the model must call
  `list_mcp_servers` before assuming something outside Roblox is unsupported,
  and the tool list is no longer inlined in the prompt (fetched on demand via
  `list_commands`).

## [1.3.9] - 2026-07-04

### Fixed
- Bridge: kill the full process tree on restart instead of just the wrapper
  process, which used to leave orphaned StudioMCP.exe instances behind that
  fought the next launch and caused seemingly random "Studio looks connected
  but nothing responds" failures.
- Bridge: a dead MCP server is now auto-restarted by a background watchdog
  instead of waiting for the next tool call to notice.
- Bridge: a tool call that hits one of Studio's own brief connection blips now
  retries once instead of surfacing a spurious "Studio not connected" error.
- Extension: the status bar no longer shows a falsely healthy "N tools" label
  when the agent is active but Studio, the place, or the bridge itself isn't
  actually usable, it now names the real blocker (open a place / enable the
  MCP server / bridge offline).
- Cross-provider: DeepSeek, Gemini, Kimi, GLM and Qwen composer menus, model
  pickers and tooltips (including GLM's search hover card and Kimi's model
  popover) no longer render clipped or hidden behind VoidScript's own
  bar/pill/cover.
- Cross-provider: a thinking model quoting command JSON in its own reasoning
  area no longer makes the tool chip flap between done/run/done (Gemini, Kimi,
  GLM and Qwen).
- The "Agent is working" composer cover now blocks clicks into the composer
  underneath it instead of letting them through, and can no longer balloon
  past the composer's visible band or drag itself off position when a site
  recreates its editor node mid-session (seen on Kimi).
- A command chip could briefly flash or restart its spinner when revisiting a
  past turn; it now settles to done correctly instead.
- DeepSeek: the raw system-prompt turn no longer flashes for a frame before
  being hidden.
- Gemini: "New chat" no longer gets stuck on "Agent active" from a reused
  previous conversation URL.
- Kimi: reasoning is read separately from the actual reply, so a command
  drafted while the model is still "thinking" is no longer detected or
  executed; input can no longer be typed mid-run after the editor node is
  recreated.
- Arena: unsupported-mode gate now also covers Web Search and Generate Image,
  and chip alignment is fixed when a command turn renders as an A/B
  model-comparison carousel.
- Bridge: a long-running tool call no longer starves the connection's ping
  handling and trips the half-open-socket watchdog.

### Changed
- Bridge and installer logs moved to `logs/bridge_debug.log` and
  `logs/start.log`; the console now only shows what a user actually needs to
  read, full detail still lands in the log files.
- `start.bat` now detects and explains a double launch instead of silently
  replacing the previous instance, and warns clearly if port 17613 stays held
  after trying to free it.
- Removed remaining em dashes from user-visible strings.
- Removed remaining em dashes from user-visible strings.

## [1.3.3] - 2026-06-24

### Fixed
- Bridge no longer depends on Roblox's `mcp.bat`, which hard-coded a single
  Studio version path and broke (0 tools / "Bridge or Studio offline") once
  Studio auto-updated and that version folder was removed. A new
  `launch_studio_mcp.py` finds the newest installed `StudioMCP.exe` and launches
  it directly.
- `bridge.py` now runs a `.py` MCP command with the same Python interpreter as
  the bridge, so it works on installs where only the `py` launcher exists.

## [1.0.0] - 2026-06-09

### Added
- Initial public release of VoidScript Free
- Browser extension for Chrome and Edge (DeepSeek chat integration)
- Local Python bridge (`bridge.py` + `start.bat`) for Roblox Studio communication
- Built-in MCP server support (no plugin required - activate directly in Roblox Studio)
- Read and edit Luau scripts directly from DeepSeek chat
- Run Luau code in real time inside Roblox Studio
- Inspect game tree and instances
- Generate meshes, materials, and models
- Browse and insert assets from the Creator Store
- Control play-testing from chat
- Panel status indicator (green / yellow / grey)
- Auto kill port 17613 on start to avoid conflicts
- Ko-fi support link with Robux tip passes in the extension panel
- Setup tutorial video on YouTube
