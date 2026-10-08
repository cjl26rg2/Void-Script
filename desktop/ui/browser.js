// SPDX-License-Identifier: GPL-3.0-or-later
// browser.js - the Browser page: AI sites in tabs, with the VoidScript extension
// built in. Each open tab is a native Chromium (WebView2) view the backend lays
// over #br-view; this file keeps it in place and hides it whenever something
// should be on top (menus, dialogs, other pages).
"use strict";

// [id, name, url, maker, ask URL ("" = the site can't take a prompt in the link)]
const BR_SITES = [
  ["chatgpt", "ChatGPT", "https://chatgpt.com/", "OpenAI", "https://chatgpt.com/?q="],
  ["gemini", "Gemini", "https://gemini.google.com/app", "Google", ""],
  ["deepseek", "DeepSeek", "https://chat.deepseek.com/", "DeepSeek", ""],
  ["claude", "Claude", "https://claude.ai/new", "Anthropic", "https://claude.ai/new?q="],
  ["grok", "Grok", "https://grok.com/", "xAI", "https://grok.com/?q="],
  ["qwen", "Qwen", "https://chat.qwen.ai/", "Alibaba", ""],
  ["copilot", "Copilot", "https://copilot.microsoft.com/", "Microsoft", "https://copilot.microsoft.com/?q="],
  ["perplexity", "Perplexity", "https://www.perplexity.ai/", "Perplexity", "https://www.perplexity.ai/search?q="],
  ["mistral", "Le Chat", "https://chat.mistral.ai/chat", "Mistral", "https://chat.mistral.ai/chat?q="],
  ["meta", "Meta AI", "https://www.meta.ai/", "Meta", ""],
  ["kimi", "Kimi", "https://www.kimi.com/", "Moonshot", ""],
  ["zai", "GLM", "https://chat.z.ai/", "Z.ai", ""],
  ["minimax", "MiniMax", "https://chat.minimax.io/", "MiniMax", ""],
  ["poe", "Poe", "https://poe.com/", "Quora", ""],
  ["huggingchat", "HuggingChat", "https://huggingface.co/chat/", "Hugging Face", ""],
  ["lmarena", "LMArena", "https://lmarena.ai/", "LMArena", ""],
  ["duck", "Duck.ai", "https://duck.ai/", "DuckDuckGo", "https://duckduckgo.com/?ia=chat&q="],
  ["pi", "Pi", "https://pi.ai/", "Inflection", ""],
  ["superapp", "SuperApp", "https://superapp.chat/", "SuperApp", ""],
];
const BR_PROMPTS = ["Build a 10-stage obby with checkpoints", "Make a shop GUI with a coin balance", "Script a pet that follows the player", "Add a round system with intermission"];
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return ""; } };
const siteFor = (url) => BR_SITES.find((s) => url && hostOf(s[2]) === hostOf(url));
const brIcon = (site, cls = "") => `<span class="br-ico ${cls}"><img src="assets/ai/${site[0]}.png" alt="" draggable="false" /></span>`;
const brLetter = (name, cls = "") => `<span class="br-ico letter ${cls}">${esc((name || "?")[0].toUpperCase())}</span>`;
const iconFor = (url, name, cls) => { const s = siteFor(url); return s ? brIcon(s, cls) : brLetter(name || hostOf(url), cls); };

// Not public yet: the page shows "Soon" over it. Ctrl+Shift+Alt+B unlocks it for testing.
// Released in 7.1 - on for everyone. (The "Soon" layer stays in the page for the next preview feature.)
const brLocked = () => false;
function brApplyLock() {
  const locked = brLocked();
  $("br-soon").hidden = !locked;
  $("view-browser").classList.toggle("locked", locked);
  const nav = document.querySelector('.nav-item[data-view="browser"]');
  nav.dataset.tip = locked ? "Browser · soon" : "Browser";
  const dot = nav.querySelector(".nav-soon");
  if (dot) dot.hidden = !locked;
}

// ── state (kept on this PC) ─────────────────────────────────────────────────
const brLoad = (k, d) => { try { return JSON.parse(lsGet(k) || "null") || d; } catch { return d; } };
const br = { tabs: [], active: null, seq: 0, closed: [] };
{
  const saved = brLoad("vs-br-tabs", null);
  if (saved && saved.tabs) { br.tabs = saved.tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, open: false })); br.active = saved.active; br.seq = saved.seq || 0; }
  if (!br.tabs.length) { br.tabs = [{ id: "t0", url: null, title: "New tab", open: false }]; br.active = "t0"; }
}
let brShortcuts = brLoad("vs-br-shortcuts", []);
let brRecent = brLoad("vs-br-recent", []);
let brAsk = lsGet("vs-br-ask") || "chatgpt";
const brSave = () => lsSet("vs-br-tabs", JSON.stringify({ tabs: br.tabs.map(({ id, url, title }) => ({ id, url, title })), active: br.active, seq: br.seq }));
const brTab = (id) => br.tabs.find((t) => t.id === (id || br.active));

// ── rendering ───────────────────────────────────────────────────────────────
function brRenderTabs() {
  $("br-tabs").innerHTML = br.tabs.map((t) => `<div class="br-tab${t.id === br.active ? " on" : ""}" data-id="${t.id}" title="${esc(t.url || "New tab")}">
    ${t.loading ? '<span class="spin"></span>' : t.url ? iconFor(t.url, t.title) : '<span class="br-ico blank"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m15.5 15.5 4 4"/></svg></span>'}
    <span class="br-tt">${esc(t.title || (siteFor(t.url) || [])[1] || "New tab")}</span>
    <button class="br-x" data-close="${t.id}" title="Close tab (Ctrl+W)">${ICONS.x}</button></div>`).join("");
  $("br-count").textContent = br.tabs.length > 1 ? br.tabs.length : "";
  const t = brTab();
  if (document.activeElement !== $("br-url")) $("br-url").value = t && t.url ? t.url : "";
  $("br-start").hidden = !!(t && t.url);
  $("br-loading").hidden = !(t && t.url && !t.ready);
  $("br-quick").querySelectorAll("button").forEach((b) => b.classList.toggle("on", !!(t && siteFor(t.url) && siteFor(t.url)[0] === b.dataset.site)));
  brSave();
}
function brRenderStart() {
  const h = new Date().getHours();
  $("br-greet").textContent = h < 5 ? "Up late?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const ask = BR_SITES.find((s) => s[0] === brAsk) || BR_SITES[0];
  $("br-ask-ai").innerHTML = `${brIcon(ask)}<span>${esc(ask[1])}</span><svg class="cv" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`;
  $("br-search-q").placeholder = `Ask ${ask[1]} anything, or type an address`;
  $("br-chips").innerHTML = BR_PROMPTS.map((p) => `<button data-p="${esc(p)}">${esc(p)}</button>`).join("");
  $("br-grid").innerHTML = BR_SITES.map((s) => `<button class="br-site" data-site="${s[0]}" title="${esc(s[1])} by ${esc(s[3])}">${brIcon(s, "big")}<b>${esc(s[1])}</b></button>`).join("")
    + brShortcuts.map((c, i) => `<button class="br-site" data-url="${esc(c.url)}" title="${esc(c.url)}">${brLetter(c.name, "big")}<b>${esc(c.name)}</b><span class="br-del" data-del="${i}" title="Remove">${ICONS.x}</span></button>`).join("")
    + (brShortcuts.length < 8 ? '<button class="br-site add" id="br-add-btn" title="Add your own shortcut"><span class="br-ico big plus"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><b>Add</b></button>' : "");
  $("br-recent-wrap").hidden = !brRecent.length;
  $("br-recent").innerHTML = brRecent.slice(0, 6).map((r) => `<button class="br-rec" data-url="${esc(r.url)}">${iconFor(r.url, r.title)}<span><b>${esc(r.title || hostOf(r.url))}</b><i>${esc(hostOf(r.url))}</i></span></button>`).join("");
}
$("br-quick").innerHTML = BR_SITES.slice(0, 8).map((s) => `<button data-site="${s[0]}" title="${esc(s[1])}">${brIcon(s)}</button>`).join("");

// ── where the page sits, and when it must hide ──────────────────────────────
// Chromium's rects already include the app's CSS zoom, so they map onto the window.
function brBounds() {
  const r = $("br-view").getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}
const COVERS = ["#palette", ".modal-wrap", "#notif-pop", "#modes-pop", "#model-pop", "#drop-hint", "#updating", ".ctx-menu", "#br-ask-menu"];
const brCovered = () => COVERS.some((sel) => [...document.querySelectorAll(sel)].some((el) => !el.hidden && el.offsetParent !== null));
let brLaidOut = "", brRaf = 0;
function brLayout() {
  const t = brTab();
  const show = !brLocked() && $("view-browser").classList.contains("active") && t && t.open && !brCovered();
  const b = brBounds();
  const key = show ? `${t.id}|${Math.round(b.x)}|${Math.round(b.y)}|${Math.round(b.w)}|${Math.round(b.h)}` : "none";
  if (key === brLaidOut) return;
  brLaidOut = key;
  invoke("browser_layout", { active: show ? t.id : null, b }).catch(() => {});
}
const brLayoutSoon = () => { cancelAnimationFrame(brRaf); brRaf = requestAnimationFrame(brLayout); };

// ── tabs ────────────────────────────────────────────────────────────────────
function brUrl(input) {
  const v = String(input || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(v) && !/\s/.test(v)) return "https://" + v;
  return "https://www.google.com/search?q=" + encodeURIComponent(v);
}
async function brOpen(url, id) {
  if (brLocked()) return;
  const t = brTab(id);
  url = brUrl(url);
  if (!t || !url) return;
  Object.assign(t, { url, ready: false, loading: true });
  const site = siteFor(url);
  if (site) t.title = site[1];
  brRenderTabs();
  try {
    await invoke("browser_open", { id: t.id, url, b: brBounds() });
    t.open = true;
    brLaidOut = "";
    brLayoutSoon();
  } catch (e) { t.loading = false; brRenderTabs(); toast(errText(e), 6000); }
}
function brActivate(id) {
  br.active = id;
  const t = brTab();
  if (t && t.url && !t.open) brOpen(t.url);
  brRenderTabs();
  brLaidOut = "";
  brLayoutSoon();
  if (t && !t.url) setTimeout(() => $("br-search-q").focus(), 30);
}
function brNewTab(url, background) {
  const id = "t" + (++br.seq);
  const t = { id, url: null, title: "New tab", open: false };
  br.tabs.splice(br.tabs.indexOf(brTab()) + 1, 0, t);
  if (background && url) { t.url = brUrl(url); t.title = (siteFor(t.url) || [])[1] || hostOf(t.url); brRenderTabs(); return; }
  brActivate(id);
  if (url) brOpen(url);
}
function brClose(id) {
  const i = br.tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const t = br.tabs[i];
  if (t.open) invoke("browser_ctl", { id, op: "close" }).catch(() => {});
  if (t.url) br.closed = [{ url: t.url, title: t.title }].concat(br.closed).slice(0, 10);
  br.tabs.splice(i, 1);
  if (!br.tabs.length) br.tabs.push({ id: "t" + (++br.seq), url: null, title: "New tab", open: false });
  if (br.active === id) brActivate((br.tabs[i] || br.tabs[i - 1]).id);
  else brRenderTabs();
}
function brReopen() {
  const c = br.closed.shift();
  if (c) brNewTab(c.url); else toast("No closed tabs to bring back.");
}
const brCycle = (dir) => {
  const i = br.tabs.indexOf(brTab());
  brActivate(br.tabs[(i + dir + br.tabs.length) % br.tabs.length].id);
};

// Ask box: the chosen AI opens with your prompt filled in where it can take one;
// otherwise the AI opens and the prompt is on the clipboard, ready to paste.
async function brGo() {
  const q = $("br-search-q").value.trim();
  if (!q) { $("br-search-q").focus(); return; }
  $("br-search-q").value = "";
  if (/^https?:\/\//i.test(q) || (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(q))) { brOpen(q); return; }
  const ask = BR_SITES.find((s) => s[0] === brAsk) || BR_SITES[0];
  if (ask[4]) { brOpen(ask[4] + encodeURIComponent(q)); return; }
  try { await navigator.clipboard.writeText(q); } catch {}
  brOpen(ask[2]);
  toast(`${ask[1]} can't take a prompt in its link, so it's on your clipboard - press Ctrl+V there.`, 6000);
}

// ── events from the backend ─────────────────────────────────────────────────
listen("browser-page", (e) => {
  const p = e.payload || {}, t = brTab(p.id);
  if (!t) return;
  t.loading = !!p.loading;
  if (!p.loading) t.ready = true;
  if (p.url && !/^about:/.test(p.url)) t.url = p.url;
  if (!p.loading && t.url) {
    brRecent = [{ url: t.url, title: t.title }].concat(brRecent.filter((r) => hostOf(r.url) !== hostOf(t.url))).slice(0, 8);
    lsSet("vs-br-recent", JSON.stringify(brRecent));
  }
  brRenderTabs();
});
listen("browser-title", (e) => {
  const p = e.payload || {}, t = brTab(p.id);
  if (t && p.title) { t.title = p.title.slice(0, 80); brRenderTabs(); }
});

// ── controls ────────────────────────────────────────────────────────────────
$("br-tabs").addEventListener("click", (e) => {
  const x = e.target.closest("[data-close]");
  if (x) { e.stopPropagation(); brClose(x.dataset.close); return; }
  const tab = e.target.closest(".br-tab");
  if (tab) brActivate(tab.dataset.id);
});
$("br-tabs").addEventListener("auxclick", (e) => { const tab = e.target.closest(".br-tab"); if (tab && e.button === 1) brClose(tab.dataset.id); });
$("br-tabs").addEventListener("contextmenu", (e) => {
  const tab = e.target.closest(".br-tab");
  if (!tab || typeof showCtx !== "function") return;
  e.preventDefault();
  const id = tab.dataset.id, t = brTab(id);
  showCtx(e.clientX, e.clientY, [
    { label: "Reload", icon: ICONS.retry, run: () => { if (t.open) invoke("browser_ctl", { id, op: "reload" }).catch(() => {}); } },
    { label: "Duplicate", icon: ICONS.copy, run: () => { if (t.url) brNewTab(t.url); } },
    { label: "Open in my normal browser", icon: ICONS.go, run: () => { if (t.url) invoke("open_url", { url: t.url }).catch(() => {}); } },
    "-",
    { label: "Close other tabs", icon: ICONS.x, run: () => br.tabs.filter((x) => x.id !== id).forEach((x) => brClose(x.id)) },
    { label: "Close", icon: ICONS.trash, danger: true, run: () => brClose(id) },
  ]);
});
$("br-new").onclick = () => brNewTab();
$("br-quick").addEventListener("click", (e) => {
  const b = e.target.closest("[data-site]");
  if (!b) return;
  const s = BR_SITES.find((x) => x[0] === b.dataset.site);
  const t = brTab();
  if (t && t.url) brNewTab(s[2]); else brOpen(s[2]);
});
// Start page tiles: click opens here, Ctrl/middle-click opens in a new background tab.
function brTile(e) {
  const del = e.target.closest("[data-del]");
  if (del) { e.stopPropagation(); brShortcuts.splice(Number(del.dataset.del), 1); lsSet("vs-br-shortcuts", JSON.stringify(brShortcuts)); brRenderStart(); return; }
  if (e.target.closest("#br-add-btn")) { $("br-add").hidden = false; $("br-add-name").focus(); return; }
  const el = e.target.closest("[data-site], [data-url]");
  if (!el) return;
  const url = el.dataset.url || BR_SITES.find((x) => x[0] === el.dataset.site)[2];
  if (e.ctrlKey || e.button === 1) brNewTab(url, true); else brOpen(url);
}
$("br-grid").addEventListener("click", brTile);
$("br-grid").addEventListener("auxclick", (e) => { if (e.button === 1) brTile(e); });
$("br-recent").addEventListener("click", brTile);
$("br-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-p]"); if (b) { $("br-search-q").value = b.dataset.p; brGo(); } });
$("br-ask-go").onclick = brGo;
$("br-search-q").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); brGo(); } });
$("br-ask-ai").onclick = (e) => {
  e.stopPropagation();
  const m = $("br-ask-menu");
  m.hidden = !m.hidden;
  if (!m.hidden) m.innerHTML = BR_SITES.map((s) => `<button data-a="${s[0]}" class="${s[0] === brAsk ? "on" : ""}">${brIcon(s)}<span>${esc(s[1])}</span>${s[4] ? '<i title="Your prompt goes straight in">direct</i>' : ""}</button>`).join("");
};
$("br-ask-menu").addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  brAsk = b.dataset.a;
  lsSet("vs-br-ask", brAsk);
  $("br-ask-menu").hidden = true;
  brRenderStart();
  $("br-search-q").focus();
});
document.addEventListener("click", (e) => { if (!e.target.closest(".br-ask")) $("br-ask-menu").hidden = true; });
$("br-add-ok").onclick = () => {
  const name = $("br-add-name").value.trim(), url = brUrl($("br-add-url").value);
  if (!name || !url) { toast("Give it a name and an address."); return; }
  brShortcuts.push({ name, url });
  lsSet("vs-br-shortcuts", JSON.stringify(brShortcuts));
  $("br-add").hidden = true; $("br-add-name").value = ""; $("br-add-url").value = "";
  brRenderStart();
};
$("br-add-x").onclick = () => { $("br-add").hidden = true; };
$("br-add-url").addEventListener("keydown", (e) => { if (e.key === "Enter") $("br-add-ok").click(); });
$("br-url").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); brOpen($("br-url").value); $("br-url").blur(); } if (e.key === "Escape") { $("br-url").blur(); brRenderTabs(); } });
$("br-url").addEventListener("focus", () => $("br-url").select());
for (const [btn, op] of [["br-back", "back"], ["br-fwd", "forward"], ["br-reload", "reload"]]) {
  $(btn).onclick = () => { const t = brTab(); if (t && t.open) invoke("browser_ctl", { id: t.id, op }).catch((e) => toast(errText(e))); };
}
$("br-ext").onclick = () => { const t = brTab(); if (t && t.url) invoke("open_url", { url: t.url }).catch((e) => toast(errText(e))); };

// Keep the native page lined up, and out of the way of menus and dialogs.
new ResizeObserver(brLayoutSoon).observe($("br-view"));
window.addEventListener("resize", brLayoutSoon);
new MutationObserver(brLayoutSoon).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
const brBaseGo = go;
go = function (view) {
  brBaseGo(view);
  if (view === "browser") { const t = brTab(); if (t && t.url && !t.open) brOpen(t.url); brRenderStart(); }
  brLaidOut = "";
  brLayoutSoon();
};
document.addEventListener("keydown", (e) => {
  if (brLocked() || !$("view-browser").classList.contains("active")) return;
  const k = e.key.toLowerCase();
  if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); $("br-back").click(); return; }
  if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); $("br-fwd").click(); return; }
  if (!(e.ctrlKey || e.metaKey)) return;
  if (k === "t" && e.shiftKey) { e.preventDefault(); brReopen(); }
  else if (k === "t") { e.preventDefault(); brNewTab(); }
  else if (k === "w") { e.preventDefault(); brClose(br.active); }
  else if (k === "l") { e.preventDefault(); $("br-url").focus(); }
  else if (k === "r") { e.preventDefault(); $("br-reload").click(); }
  else if (e.key === "Tab") { e.preventDefault(); brCycle(e.shiftKey ? -1 : 1); }
});
brRenderTabs();
brRenderStart();
brApplyLock();

// Palette: open an AI in the Browser (once it's unlocked).
const brBasePalette = paletteItems;
paletteItems = function () {
  const items = brBasePalette();
  if (brLocked()) return items;
  const at = items.findIndex((x) => x.g === "Templates");
  items.splice(at, 0, ...BR_SITES.map((s) => ({ g: "Browser", t: "Open " + s[1], d: s[3], i: brIcon(s), run: () => { go("browser"); brNewTab(s[2]); } })));
  return items;
};
