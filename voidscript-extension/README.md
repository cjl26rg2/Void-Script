# VoidScript Free - AI Roblox Studio Agent (DeepSeek, Gemini, Kimi, GLM, Qwen, Arena, Meta AI, ChatGPT, Grok, Perplexity, Copilot, Mistral)

Control Roblox Studio with AI, for free. VoidScript turns a normal AI chat into an agent that builds and scripts your Roblox game for you: just describe what you want, and it reads/edits scripts, runs Luau, inspects the game tree, and generates assets directly in Roblox Studio. No API key, no terminal, no coding required.

It's a browser extension plus a small local bridge that connects the chat to Roblox Studio through the official MCP server. **DeepSeek is the recommended provider.**

**Fully supported (hand-tuned providers):** DeepSeek, Google Gemini, Kimi, GLM, Qwen, Arena, Meta AI. These can each vary in stability: Gemini tends to stop using the Roblox tools in long sessions, Kimi sometimes reaches for its own native tools, and on Arena you must keep the mode dropdown on **Direct** (VoidScript only supports Direct mode).

**Beta (generic adapter):** ChatGPT, Grok, Perplexity, Copilot, Mistral, Poe, HuggingChat, Phind, Blackbox, You, Groq, LMArena, Doubao, Yuanbao, Reka, Pi, Coral, OpenRouter, v0, Genspark, Lambda Chat, ERNIE, MiniMax, Manus, Together. These run on a shared, selector-driven adapter (`providers/_generic.js`) instead of a hand-tuned provider, so they load and drive the site but may need per-site tuning — completion timing or the send handshake can be off if the site changed its DOM. The selectors were written from documented/common patterns, **not** validated against each live site, so expect some to need a tweak. If a beta provider stalls or never detects that the reply finished, that's expected roughness; report it so a dedicated provider can be written. The VoidScript panel shows a "BETA" notice on these sites.

## Setup

**Load the extension manually (Chromium browsers — Chrome, Edge, Brave, Opera, Vivaldi):**
1. Go to `chrome://extensions` (or `edge://extensions`, `brave://extensions`, etc.)
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `voidscript-extension` folder
5. The extension is now active

**Load the extension on Firefox (121+):**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` inside the `voidscript-extension` folder
4. The extension loads until Firefox restarts (temporary add-ons are cleared on
   restart — reload it the same way, or package/sign it via `about:addons` for a
   permanent install). The manifest already declares the required
   `browser_specific_settings.gecko` id for Firefox.

**Safari:** Safari does not load unpacked WebExtensions. It needs a one-time
conversion into an Xcode project on a Mac using Apple's converter
(`xcrun safari-web-extension-converter voidscript-extension`), then a build in
Xcode. This can't be done from the repo alone — it requires macOS + Xcode — so
Safari is not supported out of the box.

**Then set up the Bridge:**
1. **Download the Bridge** from the [GitHub releases page](https://github.com/cjl26rg2/Void-Script)
2. **Open Roblox Studio** and load a Place
3. **Enable the MCP server in Roblox Studio** (first time only): click **Assistant AI** in the top bar, then **...** > **Manage MCP Servers** > **Enable Studio as MCP Server**
4. **Run the Bridge** - double-click `start.bat` (Windows) or `MacOS_Start.command` (macOS); a small window opens, the Bridge is running. On macOS, the first launch shows a Gatekeeper warning (normal for any downloaded script): click **Done**, then **System Settings > Privacy & Security**, scroll down, and click **Open Anyway**.
5. **Go to https://chat.deepseek.com** (recommended), https://gemini.google.com, https://www.kimi.com, https://chat.z.ai, https://chat.qwen.ai, https://arena.ai, or https://www.meta.ai — or a **beta** site: https://chatgpt.com, https://grok.com, https://www.perplexity.ai, https://copilot.microsoft.com, https://chat.mistral.ai, https://poe.com, https://huggingface.co/chat, https://www.phind.com, https://www.blackbox.ai, https://you.com, https://groq.com, https://lmarena.ai, https://www.doubao.com, https://yuanbao.tencent.com, https://chat.reka.ai, https://pi.ai, https://coral.cohere.com, https://openrouter.ai, https://v0.app, https://www.genspark.ai, https://lambda.chat, https://yiyan.baidu.com, https://chat.minimax.io, https://manus.im, https://chat.together.ai. Open a new chat (only works on these exact addresses; on Arena use Direct mode)
6. Click **Start session** in the VoidScript panel
7. Type what you want to build

📺 [Watch the setup tutorial](https://youtu.be/kPKiZLZ9_Ps)

## Architecture (for contributors)

The extension is split between a provider-agnostic core and per-AI-site providers:

```
core/config.js        system prompt, feedback strings, tool categories (global ZS)
core/parser.js        VoidScript command parsing - pure string logic   (global ZSParse)
core/main.js          agentic loop, UI, camouflage, session state      (uses ZSProvider)
providers/deepseek.js everything DeepSeek-specific: DOM selectors, generation
                      detection, send mechanics, composer modes…       (global ZSProvider)
providers/gemini.js   same interface for Google Gemini (Angular DOM, Quill
                      composer, code-block masking)                    (global ZSProvider)
providers/kimi.js     same interface for Kimi / Moonshot AI (Vue DOM, Lexical
                      composer, segment-code masking)                  (global ZSProvider)
providers/glm.js      same interface for GLM / Z.ai (Svelte DOM, code-block
                      wrapper masking)                                 (global ZSProvider)
providers/qwen.js     same interface for Qwen / chat.qwen.ai (Vue DOM, network-tap
                      SSE stream, Monaco disposal guard)               (global ZSProvider)
providers/qwen-net.js MAIN-world fetch tap for Qwen SSE stream        (injected by manifest)
providers/arena.js    same interface for Arena / arena.ai (React DOM, multi-model
                      playground, A/B-comparison auto-commit, Direct-mode gate) (global ZSProvider)
providers/meta.js     same interface for Meta AI / meta.ai (React DOM, textarea
                      composer, JSON-viewer + code-collapse masking)   (global ZSProvider)
providers/_generic.js selector-driven factory ZSGeneric(cfg) implementing the whole
                      ZSProvider interface with framework-neutral defaults (beta base)
providers/chatgpt.js  BETA: thin config on ZSGeneric for ChatGPT      (global ZSProvider)
providers/grok.js     BETA: thin config on ZSGeneric for Grok         (global ZSProvider)
providers/perplexity.js BETA: thin config on ZSGeneric for Perplexity (global ZSProvider)
providers/copilot.js  BETA: thin config on ZSGeneric for Copilot      (global ZSProvider)
providers/mistral.js  BETA: thin config on ZSGeneric for Mistral      (global ZSProvider)
providers/poe.js, huggingchat.js, phind.js, blackbox.js, you.js, groq.js,
providers/lmarena.js, doubao.js, yuanbao.js, reka.js, pi.js, coral.js,
providers/openrouter.js, v0.js, genspark.js, lambda.js, yiyan.js, minimax.js,
providers/manus.js, together.js
                      BETA: thin ZSGeneric configs for more chat sites (global ZSProvider)
background.js         WebSocket to the local bridge (provider-agnostic)
```

`core/main.js` never touches the host site's DOM directly - it only calls the
`ZSProvider` interface. There are two ways to integrate another AI site:

- **Quick (beta):** add a thin config file that calls `ZSGeneric({ id, displayName,
  selectors: {...} })` from `providers/_generic.js` (see `providers/chatgpt.js`).
  Load `providers/_generic.js` **before** the config file in the `content_scripts`
  `js` array. Fast to stand up; may need per-site tuning.
- **Full (validated):** write a dedicated `providers/<site>.js` exporting the same
  interface by hand (see `providers/gemini.js`), for sites whose DOM you've
  validated live. Preferred once a site is stable.

Either way, add the site's URL pattern to `manifest.json` (`content_scripts` +
`host_permissions`) and to `PROVIDER_URLS` in `background.js`. No core change required.

Run `node test-parser.js` to smoke-test the command parser.

## Support

☕ [Ko-fi](https://ko-fi.com/sebattfg) - Robux tip passes available in the extension panel
