# VoidScript - Free AI Agent for Roblox Studio

CREDITS TO ZEROSCRIPT, THIS IS JUST A BETTER VERSION.

![GitHub stars](https://img.shields.io/github/stars/cjl26rg2/Void-Script?style=social)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

**VoidScript** is a free browser extension that turns DeepSeek, Gemini, Kimi, GLM, Qwen, Arena, Meta AI, ChatGPT, Grok, Perplexity, Copilot or Mistral into a Roblox Studio AI agent.
Control Roblox Studio with AI directly from your browser - read/edit scripts, run Luau, generate assets, all from a normal AI chat. No API key, no terminal, no coding needed.

> 🌐 **Website: [void-script.vercel.app](https://voidstudioai.netlify.app/)** the free Lemonade.gg / Luamotion alternative for building Roblox games with AI.

**Seven fully-supported (hand-tuned) providers:** **DeepSeek** (chat.deepseek.com, recommended), **Google Gemini** (gemini.google.com), **Kimi** (kimi.com, Moonshot AI), **GLM** (chat.z.ai, Z.ai), **Qwen** (chat.qwen.ai), **Arena** (arena.ai, a multi-model playground) and **Meta AI** (meta.ai). Gemini and Kimi can be unstable: Gemini tends to stop using the Roblox tools in long sessions, and Kimi sometimes uses its own native tools instead of the Roblox commands. On Arena, use **Direct** mode (VoidScript only supports Direct; it blocks Start in Battle / Side-by-Side / Agent modes). DeepSeek is the recommended provider.

**Beta providers (generic adapter):** **ChatGPT** (chatgpt.com), **Grok** (grok.com), **Perplexity** (perplexity.ai), **Copilot** (copilot.microsoft.com), **Mistral** (chat.mistral.ai), **Poe** (poe.com), **HuggingChat** (huggingface.co/chat), **Phind** (phind.com), **Blackbox** (blackbox.ai), **You** (you.com), **Groq** (groq.com), **LMArena** (lmarena.ai — use direct chat, not battle), **Doubao** (doubao.com), **Yuanbao** (yuanbao.tencent.com), **Reka** (chat.reka.ai), **Pi** (pi.ai), **Coral** (Cohere, coral.cohere.com), **OpenRouter** (openrouter.ai), **v0** (v0.app), **Genspark** (genspark.ai), **Lambda Chat** (lambda.chat), **ERNIE** (yiyan.baidu.com), **MiniMax** (chat.minimax.io), **Manus** (manus.im) and **Together** (chat.together.ai). These run on a shared selector-driven adapter (`providers/_generic.js`) rather than a hand-tuned provider, so they load and drive the site but may need per-site tuning — timing or the send handshake can be off if the site changed its layout, and the selectors were written from documented patterns rather than validated against each live site. They show a **BETA** notice in the panel; prefer a fully-supported provider for important work, and report any that misbehave so a dedicated provider can be written.

> 💬 **Stuck? Join the [Discord community](https://discord.gg/EyGxnp2jaw)** get help, share feedback, and follow updates.

> *Also known as: VoidScript Roblox, VoidScript free download, Roblox DeepSeek agent, Roblox Gemini agent, Roblox Kimi agent, Roblox GLM agent, Roblox Qwen agent, Roblox Arena agent, Roblox Meta AI agent, Roblox Studio AI automation, Luau AI, MCP Roblox, lemonade alternative free, lemonade.gg alternative, free Roblox AI agent, free lemonade roblox alternative*

## ⚠️ VoidScript is Free Beware of Paid Copycats

VoidScript is 100% free and open-source. It always has been, and it always will be. There is no official paid version, no subscription, and no sign-in required to use the extension.

If you come across a site or extension using the VoidScript name that asks for payment or account creation, it is **not** this project. The only official links are the ones listed at the top of this README.

## How it works

```
AI chat (DeepSeek / Gemini / Kimi / GLM / Qwen / Arena / Meta AI, in your browser) -> VoidScript Extension -> Bridge (your PC) -> Roblox Studio
```

The extension runs inside the chat page (DeepSeek, Gemini, Kimi, GLM, Qwen, Arena or Meta AI). When you type a request, it sends commands to the Bridge running on your PC, which drives Roblox Studio through the built-in MCP server.

## Setup

> 📺 **Lost? Watch the [setup tutorial on YouTube](https://youtu.be/kPKiZLZ9_Ps) it covers every step below.**

### 1. Download the zip and install the extension

Download the latest zip from the **Releases** page and extract it. The zip contains both the **Bridge** and the **extension folder**.

To load the extension:

**Chromium browsers (Chrome, Edge, Brave, Opera, Vivaldi):**
- Go to `chrome://extensions` (or `edge://extensions`, `brave://extensions`, …)
- Enable **Developer mode** (top right toggle)
- Click **Load unpacked**
- Select the `voidscript-extension` folder from the extracted zip

**Firefox (121+):**
- Go to `about:debugging#/runtime/this-firefox`
- Click **Load Temporary Add-on…** and pick `manifest.json` inside `voidscript-extension`
- (Temporary add-ons clear on restart; reload the same way each session.)

**Safari** is not supported out of the box — it needs a one-time Xcode conversion on a Mac (`xcrun safari-web-extension-converter voidscript-extension`).

### 2. Start Roblox Studio and enable MCP

Open Studio and load a Place, then enable MCP (first time only):

- Click **Assistant AI** in the top bar
- Click **...** (top right of the Assistant panel)
- Click **Manage MCP Servers**
- Click **Enable Studio as MCP Server**

> Not sure where to find these options? The [video tutorial](https://youtu.be/kPKiZLZ9_Ps) shows exactly where to click.

### 3. Run the Bridge

- **Windows:** double-click `start.bat` inside the extracted folder.
- **macOS:** double-click `MacOS_Start.command` inside the extracted folder. The first time, macOS will show a security warning ("could not verify... free of malware") - this is normal for any script downloaded outside the App Store, click **Done**, then go to **System Settings > Privacy & Security**, scroll to the bottom, and click **Open Anyway**. You only need to do this once.

A small window opens, that means the Bridge is running.

### 4. Start a session

Go to a supported AI and open a new chat. The VoidScript bar appears above the input box. Click **Start session**. Type what you want to build.

- **Fully supported:** https://chat.deepseek.com (recommended), https://gemini.google.com, https://www.kimi.com, https://chat.z.ai, https://chat.qwen.ai, https://arena.ai, https://www.meta.ai
- **Beta:** https://chatgpt.com, https://grok.com, https://www.perplexity.ai, https://copilot.microsoft.com, https://chat.mistral.ai, https://poe.com, https://huggingface.co/chat, https://www.phind.com, https://www.blackbox.ai, https://you.com, https://groq.com, https://lmarena.ai, https://www.doubao.com, https://yuanbao.tencent.com, https://chat.reka.ai, https://pi.ai, https://coral.cohere.com, https://openrouter.ai, https://v0.app, https://www.genspark.ai, https://lambda.chat, https://yiyan.baidu.com, https://chat.minimax.io, https://manus.im, https://chat.together.ai

> Only works on the exact addresses listed above - it will not work on any other site.
> On Arena, keep the mode dropdown on **Direct** - VoidScript blocks Start in Battle / Side-by-Side / Agent modes (it only drives a single Direct reply).
> Gemini and Kimi can be unstable (model behavior, not the extension): Gemini may stop using the Roblox tools after a while, and Kimi may use its own native tools instead. If the AI starts answering in plain text instead of acting, remind it to use the commands or start a new session.
### 5. Watch the setup tutorial

[Watch the setup tutorial on YouTube](https://youtu.be/kPKiZLZ9_Ps)

## What the AI can do

- Read and edit scripts
- Run Luau code directly in Studio
- Inspect the game tree and instances
- Generate meshes, materials, and models
- Browse and insert from the Creator Store
- Control play-testing
- **Remember your project across sessions** persistent project memory saved inside your place
