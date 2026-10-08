// SPDX-License-Identifier: GPL-3.0-or-later
// VoidScript popup: shows bridge/Studio status and exposes reconnect, restart,
// settings, website and tip actions. Talks to background.js over the same
// message protocol the rest of the extension uses ("status" / "reconnect" /
// "restart_mcp" requests, "vs-status" broadcasts, "vs-open-menu" to a tab).

const LINKS = {
  site: "https://voidstudioai.netlify.app/",
  fallbackAI: "https://chat.deepseek.com/",
  releases: "https://github.com/cjl26rg2/Void-Script/releases",
};

// One source of truth for every supported site: its display name and a matcher.
// Both the header pill and the "is this a supported AI tab?" test derive from it.
const PROVIDERS = [
  ["DeepSeek", /deepseek\.com/], ["Gemini", /gemini\.google\.com/],
     ["Kimi", /kimi\.(com|ai)/], ["GLM", /z\.ai/], ["Qwen", /qwen\.ai/],
  ["Arena", /(^|\/\/)arena\.ai/], ["Meta AI", /meta\.ai/],
  ["ChatGPT", /chatgpt\.com|chat\.openai\.com/], ["Grok", /grok\.com/],
  ["Perplexity", /perplexity\.ai/], ["Copilot", /copilot\.microsoft\.com/],
  ["Mistral", /mistral\.ai/], ["Poe", /poe\.com/], ["HuggingChat", /huggingface\.co/],
  ["Phind", /phind\.com/], ["Blackbox", /blackbox\.ai/], ["You", /you\.com/],
  ["Groq", /groq\.com/], ["LMArena", /lmarena\.ai/], ["Doubao", /doubao\.com/],
  ["Yuanbao", /yuanbao\.tencent\.com/], ["Reka", /reka\.ai/], ["Pi", /(^|\/\/)pi\.ai/],
  ["Coral", /coral\.cohere\.com/], ["OpenRouter", /openrouter\.ai/], ["v0", /v0\.(app|dev)/],
  ["Genspark", /genspark\.ai/], ["Lambda Chat", /lambda\.chat/], ["SuperApp", /superapp\.chat/], ["ERNIE", /yiyan\.baidu\.com/],
  ["MiniMax", /minimax\.io/], ["Manus", /manus\.im/], ["Together", /together\.ai/],
  ["Claude", /(^|\/\/)claude\.ai/], ["DuckDuckGo AI", /(^|\/\/)duck\.ai/],
  ["Brave Leo", /leo\.brave\.com/], ["Character.AI", /character\.ai/],
  ["Kagi", /assistant\.kagi\.com/], ["ChatOn", /chaton\.ai/],
  ["SparkDesk", /xinghuo\.xfyun\.cn/], ["Hunyuan", /hunyuan\.tencent\.com/],
  ["Baichuan", /assistant\.baichuan\.com/], ["Jupi", /jupi\.io/],
  ["Coze", /(^|\/\/)coze\.(com|cn)/], ["SciSpace", /scispace\.com/],
  ["Moonshot", /moonshot\.cn/], ["Morph", /themorph\.ai/],
  ["AISearch", /(^|\/\/)aisearch\.com/],
  ["Llama", /(^|\/\/)llama\.com/], ["Sider", /sider\.ai/],
  ["MyShell", /myshell\.ai/], ["TheB.AI", /(^|\/\/)theb\.ai/],
  ["Wonderseek", /wonderseek\.com/], ["Felo", /felo\.ai/],
  ["Writesonic", /writesonic\.com/], ["Jasper", /(^|\/\/)jasper\.ai/],
  ["Consensus", /consensus\.app/], ["ChatHub", /chathub\.gg/],
  ["T3 Chat", /t3\.chat/], ["Poolside AI", /poolside\.ai/],
  ["Inflection AI", /inflection\.com/], ["Hume AI", /hume\.ai/],
  ["Twinny", /twinny\.ai/],
  ["Cody", /sourcegraph\.com/], ["Chatbase", /chatbase\.io/],
  ["Botstack", /botstack\.com/], ["Flowise", /flowise\.ai/],
  ["Lobe", /lobe\.github\.io/],
  ["Chat.AI", /chatai\.commander\.ai/], ["Levera AI", /levera\.ai/],
  ["Mage", /(^|\/\/)mage\.space/], ["Friend", /friend\.com/],
  ["Humane", /app\.humane\.com/], ["Bolt", /bolt\.(new|ai)/],
  ["Perplexity AI", /perplexity\.ai/], ["Windsurf", /windsurf\.ai/],
  ["Pool", /pool\.smallstep\.com/], ["Ramp", /ramp\.com/],
  ["Phind", /phind\.com/], ["Copilot", /copilot\.microsoft\.com/],
  ["Mistral", /chat\.mistral\.ai/], ["Poe", /poe\.com/],
  ["HuggingChat", /huggingface\.co\/chat/], ["Reka", /chat\.reka\.ai/],
  ["Pi", /pi\.ai/], ["Coral", /coral\.cohere\.com/],
  ["OpenRouter", /openrouter\.ai/], ["v0", /v0\.(app|dev)/],
  ["Genspark", /genspark\.ai/], ["Lambda", /lambda\.chat/], ["SuperApp", /superapp\.chat/],
  ["Yiyan", /yiyan\.baidu\.com/], ["Minimax", /chat\.minimax\.io/],
  ["Manus", /manus\.im/], ["Together", /chat\.together\.ai/],
  ["LM Arena", /lmarena\.ai/], ["Doubao", /doubao\.com/],
  ["Yuanbao", /yuanbao\.tencent\.com/], ["Moonshot", /moonshot\.cn/],
  ["Jupi", /jupi\.io/],   ["Wonderseek", /wonderseek\.com/], ["Replicate", /replicate\.com/],
];
const providerName = (url) => (PROVIDERS.find(([, re]) => re.test(url || "")) || [])[0];
const isProviderTab = (url) => PROVIDERS.some(([, re]) => re.test(url || ""));

// Editorial pick labels, shown next to a provider's name (menu + popup tag).
const SITE_LABELS = {
  "Claude": "best",
  "DeepSeek": "recommended",
  "GLM": "recommended",
  "Qwen": "recommended",
};

const $ = (id) => document.getElementById(id);
const send = (msg, cb) => chrome.runtime.sendMessage(msg, cb);

// ── language ────────────────────────────────────────────────────────────────
// UI language (English by default). Static labels carry data-i18n="key"; dynamic
// strings go through T(). The same vsLang setting also makes the AI reply in that
// language - the in-page engine reads it when it builds the system prompt.
let LANG = "en";
const T = (key, vars) => (typeof VS_I18N !== "undefined" ? VS_I18N.t(LANG, key, vars) : key);
const tagLabel = (l) => T(l === "best" ? "bestTag" : l);
function applyI18n() {
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = T(el.dataset.i18n); });
  const tl = $("tl-list");
  if (tl) tl.setAttribute("data-empty", T("noCmds"));
}

// ── header ────────────────────────────────────────────────────────────────
const versionEl = $("version");
if (versionEl) versionEl.textContent = "v" + chrome.runtime.getManifest().version;
let activeTab = null;
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  activeTab = tab || null;
  const tag = $("provider-tag");
  const name = providerName(tab && tab.url) || T("ready");
  tag.textContent = name;
  const label = SITE_LABELS[name];
  if (label) {
    const b = document.createElement("span");
    b.className = `tag-label tag-label-${label}`;
    b.textContent = tagLabel(label);
    tag.appendChild(b);
  }
});

// ── status rendering ────────────────────────────────────────────────────────
function paint(s) {
  s = s || {};
  const servers = s.servers || [];
  const anyUp = servers.some((x) => x.alive);
  const mcpUp = s.connected && (s.mcpAlive || anyUp || s.tools > 0);
  const studioMissing = mcpUp && s.studio === false;
  const good = mcpUp && !studioMissing;

  $("status-dot").className = s.connected ? (good ? "up" : "mid") : "";
  $("status-text").textContent = !s.connected
    ? T("offline")
    : good
    ? T("connected")
    : studioMissing
    ? T("studioMissing")
    : T("bridgeOk");
  $("tool-count").textContent = s.connected
    ? T("tools", { n: s.tools || 0 }) + (s.placeName ? " · " + s.placeName : "")
    : T("runStart");
  $("server-list").textContent = s.connected
    ? servers.map((x) => `${x.alive ? "●" : "○"} ${x.id} (${x.alive ? x.tools + " tools" : "down"})`).join("\n")
    : "";

  // Provider name + success rate (Feature: per-provider stats from leaderboard).
  const provTag = $("provider-tag");
  if (provTag) {
    const name = providerName(activeTab && activeTab.url) || "";
    if (name) {
      // Reset the tag content first (in case paint runs again, e.g. on poll).
      provTag.textContent = "";
      const label = document.createElement("span");
      label.textContent = name;
      provTag.appendChild(label);
      const lbSub = document.createElement("span");
      lbSub.className = "tag-label";
      lbSub.id = "prov-sub";
      lbSub.textContent = "…";
      provTag.appendChild(lbSub);
      const siteLabel = SITE_LABELS[name];
      if (siteLabel) {
        const b = document.createElement("span");
        b.className = `tag-label tag-label-${siteLabel}`;
        b.textContent = tagLabel(siteLabel);
        provTag.appendChild(b);
      }
      chrome.storage.local.get("vsLeaderboard", (r) => {
        const lb = (r && r.vsLeaderboard) || {};
        const entry = lb[name];
        if (entry && entry.ok !== undefined) {
          const total = entry.ok + entry.err;
          if (total > 0) {
            const pct = Math.round((entry.ok / total) * 100);
            lbSub.textContent = T("pctOk", { p: pct });
            lbSub.title = `${entry.ok} ok, ${entry.err} errors across ${total} commands`;
          } else {
            lbSub.textContent = "";
          }
        } else {
          lbSub.textContent = "";
        }
      });
    } else {
      provTag.textContent = T("ready");
    }
  }

  const up = $("update-row");
  if (up) up.hidden = !s.updateAvailable;
  const upTag = $("update-tag");
  if (upTag) upTag.textContent = s.updateTag ? ` v${s.updateTag.replace(/^[vV]/, "")}` : "";
}

const poll = () => send({ type: "status" }, (s) => s && paint(s));

// ── actions ─────────────────────────────────────────────────────────────────
$("btn-reconnect").onclick = () => send({ type: "reconnect" }, () => setTimeout(poll, 600));

$("btn-restart").onclick = (e) => {
  const label = e.currentTarget.querySelector ? e.currentTarget : e.target;
  const original = label.innerHTML;
  label.textContent = T("restarting");
  send({ type: "restart_mcp" }, () => {
    label.innerHTML = original;
    setTimeout(poll, 600);
  });
};

$("btn-site").onclick = () => chrome.tabs.create({ url: LINKS.site });

// Generic "open this URL in a new tab" wiring for the AI quick-launch chips and the
// footer links (Discord / GitHub). Any element with a data-open="<url>" attribute.
document.querySelectorAll("[data-open]").forEach((el) => {
  el.addEventListener("click", () => {
    const url = el.getAttribute("data-open");
    if (url) chrome.tabs.create({ url });
  });
});

// Files folder: where the AI may create and edit files (kept by the bridge).
let filesMode = "off";
function showFiles(r) {
  const note = $("files-note");
  if (!r || !r.ok) { note.className = "files-note bad"; note.textContent = (r && r.error) || "Start VoidScript (the bridge) to change this."; return; }
  filesMode = r.mode || "off";
  if (r.picked) $("files-dir").value = r.picked;
  $("files-mode").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.m === filesMode));
  $("files-folder-row").hidden = filesMode !== "folder";
  note.className = "files-note" + (filesMode === "off" ? "" : " ok");
  note.textContent = filesMode === "anywhere"
    ? "Tell the AI a folder in your message (like C:\\Users\\you\\Documents\\my-site) and it works there. Windows, Program Files and AppData stay off limits."
    : filesMode === "folder" ? (r.dir ? `The AI can only work in: ${r.dir}` : "Paste the one folder the AI may use.")
    : "Let the AI on any site create, edit and open files - like a website it builds for you. It never deletes or runs anything, and keeps a copy of anything it changes.";
}
send({ type: "files_folder" }, showFiles);
$("files-mode").addEventListener("click", (e) => {
  const b = e.target.closest("[data-m]");
  if (b) send({ type: "files_folder", mode: b.dataset.m }, showFiles);
});
$("files-save").onclick = () => send({ type: "files_folder", dir: $("files-dir").value.trim(), mode: "folder" }, showFiles);
$("files-dir").addEventListener("keydown", (e) => { if (e.key === "Enter") $("files-save").click(); });

// "Open on this page": opens a VoidScript panel on the AI site in this tab.
document.querySelectorAll("[data-act]").forEach((el) => {
  el.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const fail = () => { $("test-result").textContent = "Open an AI site (ChatGPT, DeepSeek…) in this tab first."; };
    if (!tab) return fail();
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: "vs-open", what: el.dataset.act });
      if (r && r.ok) window.close(); else fail();
    } catch { fail(); }
  });
});

// ── quick settings ───────────────────────────────────────────────────────────
// Toggle switches + theme picker write straight to chrome.storage.local; the in-page
// engine live-syncs them via its storage.onChanged listener (no reload needed).
const CFG_DEFAULTS = {
  vsCowork: false, vsAutoVerify: true, vsGuardDestructive: true, vsBackground: true, vsSounds: false, vsTheme: "system", vsLang: "en",
  vsHalloween: true, vsSpookyMusic: true,
};
// SpookyScript (all October): the popup wears the pumpkin and the name too.
// Every "VoidScript" in the popup (button labels are written in after load,
// so a watcher keeps them renamed too).
let spookyOn = false;
function renamePopup() {
  const [from, to] = spookyOn ? [/VoidScript/g, "SpookyScript"] : [/SpookyScript/g, "VoidScript"];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.search(from) >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
  const hits = [];
  let n;
  while ((n = w.nextNode())) hits.push(n);
  for (const t of hits) t.nodeValue = t.nodeValue.replace(from, to);
}
let renameQueued = false;
new MutationObserver(() => {
  if (!spookyOn || renameQueued) return;
  renameQueued = true;
  setTimeout(() => { renameQueued = false; renamePopup(); }, 60);
}).observe(document.body, { childList: true, subtree: true, characterData: true });
function applySpooky(on) {
  spookyOn = on;
  document.documentElement.classList.toggle("spooky", on);
  renamePopup();
  let deco = document.getElementById("spooky-deco");
  if (on && !deco) { deco = document.createElement("div"); deco.id = "spooky-deco"; deco.innerHTML = "<i class='web'></i><i class='bat'></i><i class='ghost'></i>"; document.body.appendChild(deco); }
  if (!on && deco) deco.remove();
  const title = document.querySelector(".title");
  if (title) title.innerHTML = on ? 'Spooky<span class="s">Script</span>' : 'Void<span class="s">Script</span>';
  const mark = document.querySelector("header svg");
  let pk = document.getElementById("spooky-mark");
  if (on && !pk && mark) { pk = document.createElement("img"); pk.id = "spooky-mark"; pk.src = "spooky/icon-48.png"; pk.alt = ""; mark.after(pk); }
  if (mark) mark.style.display = on ? "none" : "";
  if (!on && pk) pk.remove();
}
chrome.storage.local.get(Object.keys(CFG_DEFAULTS), (r) => {
  const cfg = { ...CFG_DEFAULTS, ...(r || {}) };
  // Language picker: native names, English default. Changing it re-translates the
  // popup immediately and, via storage, the in-page bar and the AI's reply language.
  LANG = (typeof VS_I18N !== "undefined" && VS_I18N.has(cfg.vsLang)) ? cfg.vsLang : "en";
  const langSel = $("lang-sel");
  if (langSel && typeof VS_I18N !== "undefined") {
    langSel.innerHTML = VS_I18N.LANGS.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
    langSel.value = LANG;
    langSel.addEventListener("change", () => {
      LANG = langSel.value;
      try { chrome.storage.local.set({ vsLang: LANG }); } catch {}
      applyI18n(); poll(); renderStats(); renderLeaderboard(); renderTimeline();
    });
  }
  // Defer the first translated render until this whole script has run: the render
  // helpers below (esc, tlList…) are consts, and a storage callback that fires early
  // would hit them before initialisation and abort the rest of the popup.
  setTimeout(() => { applyI18n(); poll(); renderStats(); renderLeaderboard(); renderTimeline(); }, 0);
  applySpooky(cfg.vsHalloween !== false && typeof VSSpooky !== "undefined" && VSSpooky.inSeason());
  document.querySelectorAll("input[data-cfg]").forEach((box) => {
    const k = box.dataset.cfg;
    box.checked = cfg[k] !== false;
    box.addEventListener("change", () => {
      try { chrome.storage.local.set({ [k]: box.checked }); } catch {}
      if (k === "vsHalloween") applySpooky(box.checked && typeof VSSpooky !== "undefined" && VSSpooky.inSeason());
    });
  });
  const seg = $("theme-seg");
  if (seg) {
    const buttons = [...seg.querySelectorAll("button")];
    // The popup itself wears the OR theme too; the other themes only restyle the page overlay.
    const setActive = (t) => {
      buttons.forEach((b) => b.classList.toggle("on", b.dataset.theme === t));
      if (t === "or") document.documentElement.setAttribute("data-theme", "or");
      else document.documentElement.removeAttribute("data-theme");
    };
    setActive(cfg.vsTheme || "system");
    buttons.forEach((b) => b.addEventListener("click", () => {
      setActive(b.dataset.theme);
      try { chrome.storage.local.set({ vsTheme: b.dataset.theme }); } catch {}
    }));
  }
});

// Quick round-trip test (Feature): times a list_tools round trip and reports
// the bridge latency + Studio state in one line.
$("btn-test").onclick = async () => {
  const out = $("test-result");
  out.textContent = T("testing");
  const t0 = performance.now();
  const r = await new Promise((res) => send({ type: "list_tools" }, res));
  const ms = Math.round(performance.now() - t0);
  if (!r || !r.ok) {
    out.textContent = T("noResp");
    return;
  }
  const s = await new Promise((res) => send({ type: "status" }, res));
  const tools = (r.tools || []).length;
  const studio = s && s.studio ? T("placeLoaded") : s && s.studioApp ? T("studioNoPlace") : T("studioOff");
  out.textContent = T("testRes", { n: tools, ms, s: studio });
};

// Copy diagnostics (Feature): pulls the full bridge diagnostics payload, keeps
// the long log tail out of the human-readable summary but includes everything
// for pasting into a bug report.
$("btn-diag").onclick = async () => {
  const btn = $("btn-diag");
  const original = btn.innerHTML;
  btn.textContent = T("collecting");
  const r = await new Promise((res) => send({ type: "diagnostics" }, res));
  if (!r || !r.ok || !r.diagnostics) {
    btn.innerHTML = original;
    $("test-result").textContent = T("diagFail");
    return;
  }
  const d = r.diagnostics;
  const summary = [
    `VoidScript bridge v${d.bridge_version} (pid ${d.pid}, up ${Math.round((d.uptime_s || 0) / 60)}m)`,
    `Platform: ${d.platform} · Python ${d.python} · ws://${d.host}:${d.port}`,
    `Origin auth: ${d.origin_auth ? "on" : "OFF"} · Token auth: ${d.token_auth ? "on" : "off"}`,
    `Studio: app=${d.studio && d.studio.app} place=${d.studio && d.studio.place} proc=${d.studio_proc}`,
    `MCP servers: ${(d.servers || []).map((x) => `${x.id}=${x.alive ? "up" : "down"}:${x.tools}tools`).join(", ") || "none"}`,
    `Env: ${Object.entries(d.env || {}).map(([k, v]) => `${k}=${v}`).join(" ")}`,
    `Config servers: ${(d.config_mcp_servers || []).join(", ") || "none"}`,
  ].join("\n");
  const full = summary + "\n\n--- servers ---\n" + JSON.stringify(d.servers, null, 2) +
    "\n--- log tail ---\n" + (d.log_tail || []).join("\n");
  try {
    await navigator.clipboard.writeText(full);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = full;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
  btn.innerHTML = original;
  $("test-result").textContent = T("diagOk");
};

const btnUpdate = $("btn-update");
if (btnUpdate) btnUpdate.onclick = () => chrome.tabs.create({ url: LINKS.releases });

// Settings opens the in-page panel on an already-open supported AI tab (so it
// works before a session is started); otherwise it opens the default AI.
$("btn-settings").onclick = () => {
  chrome.tabs.query({}, (tabs) => {
    const target =
      tabs.find((t) => t.active && isProviderTab(t.url)) ||
      tabs.find((t) => isProviderTab(t.url));
    if (target) {
      chrome.tabs.sendMessage(target.id, { type: "vs-open-menu" });
      chrome.tabs.update(target.id, { active: true });
    } else {
      chrome.tabs.create({ url: LINKS.fallbackAI });
    }
  });
};

// ── live updates ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "vs-status") paint(msg);
});
poll();
setInterval(poll, 2000);

// ── session timeline ────────────────────────────────────────────────────────
// Renders the last ~18 recorded agent actions (tools, edits, screenshots,
// errors, session start/stop) across conversations, newest first.
const tlList = $("tl-list");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
function fmtTime(t) {
  const d = new Date(t);
  return String(d.getHours()).padStart(2, "0") + ":" +
         String(d.getMinutes()).padStart(2, "0") + ":" +
         String(d.getSeconds()).padStart(2, "0");
}
function tlLabel(e) {
  switch (e.type) {
    case "session_start": return `<span class="tl-evt">▶ ${esc(T("sStart"))}</span>`;
    case "session_stop":  return `<span class="tl-evt">■ ${esc(T("sStop"))}</span>`;
    case "shot":          return `<span class="tl-ok">📷 ${esc(T("shot"))}</span> <span class="tl-conv">${esc(e.tool || "")}</span>`;
    case "tool":
      if (e.ok) return `<span class="tl-ok">⚙ ${esc(e.name || "")} ✓</span>`;
      return `<span class="tl-err">⚙ ${esc(e.name || "")} ✗</span> <span class="tl-conv">${esc((e.err || "").slice(0, 26))}</span>`;
    default: return esc(e.type || "");
  }
}
function renderTimeline() {
  chrome.storage.local.get("vsTimeline", (r) => {
    const arr = (r && r.vsTimeline) || [];
    const recent = arr.slice(-18).reverse();
    tlList.innerHTML = recent.map((e) =>
      `<div class="tl-item"><span class="tl-t">${fmtTime(e.t)}</span><span>${tlLabel(e)}</span></div>`
    ).join("");
  });
}
renderTimeline();
setInterval(renderTimeline, 3000);

// Copy the session timeline as plain text (parity with the leaderboard copy).
const tlCopy = $("tl-copy");
if (tlCopy) {
  tlCopy.title = "Copy the session timeline";
  tlCopy.addEventListener("click", () => {
    chrome.storage.local.get("vsTimeline", (r) => {
      const arr = (r && r.vsTimeline) || [];
      const lines = arr.slice(-40).map((e) => {
        let what = e.type;
        if (e.type === "tool") what = `${e.name || "tool"} ${e.ok ? "ok" : "ERR " + (e.err || "").slice(0, 40)}`;
        else if (e.type === "shot") what = "screenshot";
        else if (e.type === "session_start") what = "session started";
        else if (e.type === "session_stop") what = "session stopped";
        else if (e.type === "event") what = e.name || "event";
        return `${fmtTime(e.t)}  ${what}`;
      });
      const text = lines.length ? lines.join("\n") : "No commands recorded this session.";
      navigator.clipboard.writeText(text).then(() => {
        tlCopy.textContent = T("copied");
        setTimeout(() => { tlCopy.textContent = T("copy"); }, 1600);
      }).catch(() => {});
    });
  });
}

// ── provider leaderboard ────────────────────────────────────────────────────
// Ranks providers by build tool success rate (tools completed vs errored across
// sessions), so the user can pick the model that actually builds best for them.
function renderLeaderboard() {
  chrome.storage.local.get("vsLeaderboard", (r) => {
    const lb = (r && r.vsLeaderboard) || {};
    const rows = Object.values(lb)
      .filter((e) => e.runs > 0)
      .map((e) => ({ name: e.name, runs: e.runs, ok: e.ok || 0, err: e.err || 0,
                    rate: ((e.ok || 0) + (e.err || 0)) ? (e.ok / ((e.ok || 0) + (e.err || 0))) : 0 }))
      .sort((a, b) => b.rate - a.rate || b.runs - a.runs)
      .slice(0, 5);
    const lbEl = $("lb");
    if (!lbEl) return;
    if (!rows.length) {
      lbEl.innerHTML = `<span class="empty">${esc(T("noBuilds"))}</span>`;
      return;
    }
    lbEl.innerHTML = rows.map((e, i) =>
      `<div class="lb-row">
         <span class="lb-rank">${i + 1}</span>
         <span class="lb-name">${esc(e.name)}</span>
         <span class="lb-meta">${esc(T("runs", { n: e.runs }))} · <span class="lb-rate">${Math.round(e.rate * 100)}%</span></span>
       </div>
       <div class="lb-bar"><div class="lb-fill" style="width:${Math.round(e.rate * 100)}%"></div></div>`
    ).join("");
  });
}
renderLeaderboard();
setInterval(renderLeaderboard, 4000);

// ── session stats strip ──────────────────────────────────────────────────────
// Aggregate totals across all providers from the leaderboard store.
function renderStats() {
  chrome.storage.local.get("vsLeaderboard", (r) => {
    const lb = (r && r.vsLeaderboard) || {};
    let runs = 0, ok = 0, err = 0;
    Object.values(lb).forEach((e) => { runs += e.runs || 0; ok += e.ok || 0; err += e.err || 0; });
    const total = ok + err;
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set("st-sessions", runs);
    set("st-cmds", total);
    const rt = $("st-rate");
    if (rt) { rt.textContent = total ? Math.round((ok / total) * 100) + "%" : "–"; rt.classList.toggle("ok", total > 0); }
  });
}
renderStats();
setInterval(renderStats, 4000);

// Reset the leaderboard + timeline + stats (clears the local history).
const lbReset = $("lb-reset");
if (lbReset) {
  lbReset.title = "Clear your leaderboard, stats and activity history";
  lbReset.addEventListener("click", () => {
    try {
      chrome.storage.local.set({ vsLeaderboard: {}, vsTimeline: [] }, () => {
        renderLeaderboard(); renderStats(); renderTimeline();
        lbReset.textContent = T("cleared");
        setTimeout(() => { lbReset.textContent = T("reset"); }, 1500);
      });
    } catch {}
  });
}

// Leaderboard export (Feature): copy the current provider success-rate ranking as
// plain text so it can be pasted into a bug report or shared.
const lbCopy = $("lb-copy");
if (lbCopy) {
  lbCopy.title = "Copy leaderboard to clipboard";
  lbCopy.style.cursor = "pointer";
  lbCopy.addEventListener("click", (e) => {
    e.stopPropagation();
    chrome.storage.local.get("vsLeaderboard", (r) => {
      const lb = (r && r.vsLeaderboard) || {};
      const rows = Object.values(lb)
        .filter((e) => e.runs > 0)
        .map((e) => ({ name: e.name, runs: e.runs, ok: e.ok || 0, err: e.err || 0,
                        rate: ((e.ok || 0) + (e.err || 0)) ? (e.ok / ((e.ok || 0) + (e.err || 0))) : 0 }))
        .sort((a, b) => b.rate - a.rate || b.runs - a.runs);
      const lines = rows.map((e, i) =>
        `${i + 1}. ${e.name} - ${e.ok}/${e.runs} ok (${Math.round(e.rate * 100)}%)`);
      const text = lines.length ? lines.join("\n") : "No builds recorded yet.";
      navigator.clipboard.writeText(text).then(() => {
        lbCopy.textContent = T("copied");
        setTimeout(() => { lbCopy.textContent = T("copy"); }, 1600);
      });
    });
  });
}
