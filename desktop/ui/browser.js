// SPDX-License-Identifier: GPL-3.0-or-later
// browser.js - the Browser page: AI sites in tabs, with the VoidScript extension
// built in. Each open tab is a native Chromium (WebView2) view the backend lays
// over #br-view; this file keeps it in place and hides it when anything should be
// on top (menus, dialogs, other pages).
"use strict";

// [id, name, url, tile colours (unused), maker]
const BR_SITES = [
  ["chatgpt", "ChatGPT", "https://chatgpt.com/", ["#10a37f", "#0b7a60"], "OpenAI"],
  ["gemini", "Gemini", "https://gemini.google.com/app", ["#4f7cff", "#9b6bff"], "Google"],
  ["deepseek", "DeepSeek", "https://chat.deepseek.com/", ["#4d6bfe", "#2f49c9"], "DeepSeek"],
  ["claude", "Claude", "https://claude.ai/new", ["#d97757", "#b65a3c"], "Anthropic"],
  ["grok", "Grok", "https://grok.com/", ["#3a3b42", "#18191d"], "xAI"],
  ["qwen", "Qwen", "https://chat.qwen.ai/", ["#7a5cff", "#5137d6"], "Alibaba"],
];
// The sites' own icons (assets/ai), on a light tile so dark logos still show.
const brTile = (site, big) => `<span class="br-ico${big ? " big" : ""}"><img src="assets/ai/${site[0]}.png" alt="" draggable="false" /></span>`;
const siteFor = (url) => BR_SITES.find((s) => url && new URL(s[2]).host === (() => { try { return new URL(url).host; } catch { return ""; } })());

// Not public yet: the page shows "Soon" over it. Ctrl+Shift+Alt+B unlocks it for testing.
const brLocked = () => lsGet("vs-browser-beta") !== "on";
function brApplyLock() {
  const locked = brLocked();
  $("br-soon").hidden = !locked;
  $("view-browser").classList.toggle("locked", locked);
  document.querySelector('.nav-item[data-view="browser"]').dataset.tip = locked ? "Browser · soon" : "Browser (beta)";
  const dot = document.querySelector('.nav-item[data-view="browser"] .nav-soon');
  if (dot) dot.hidden = !locked;
}
const br = { tabs: [], active: null, seq: 0 };
try { const saved = JSON.parse(lsGet("vs-br-tabs") || "null"); if (saved && saved.tabs) { br.tabs = saved.tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, open: false })); br.active = saved.active; br.seq = saved.seq || 0; } } catch {}
if (!br.tabs.length) br.tabs = [{ id: "t0", url: null, title: "New tab", open: false }], br.active = "t0";
const brSave = () => lsSet("vs-br-tabs", JSON.stringify({ tabs: br.tabs.map(({ id, url, title }) => ({ id, url, title })), active: br.active, seq: br.seq }));
const brTab = (id) => br.tabs.find((t) => t.id === (id || br.active));

$("br-grid").innerHTML = BR_SITES.map((s) => `<button class="br-site" data-site="${s[0]}">${brTile(s, true)}<b>${esc(s[1])}</b><span>${esc(s[4])}</span></button>`).join("");
$("br-quick").innerHTML = BR_SITES.map((s) => `<button data-site="${s[0]}" title="${esc(s[1])}">${brTile(s)}</button>`).join("");

function brRenderTabs() {
  $("br-tabs").innerHTML = br.tabs.map((t) => {
    const site = siteFor(t.url);
    const icon = site ? brTile(site) : '<span class="br-ico blank"></span>';
    return `<div class="br-tab${t.id === br.active ? " on" : ""}" data-id="${t.id}" title="${esc(t.title || t.url || "New tab")}">${t.loading ? '<span class="spin"></span>' : icon}<span class="br-tt">${esc(t.title || (site ? site[1] : "New tab"))}</span><button class="br-x" data-close="${t.id}" title="Close tab">${ICONS.x}</button></div>`;
  }).join("");
  const t = brTab();
  $("br-url").value = t && t.url ? t.url : "";
  $("br-start").hidden = !!(t && t.url);
  $("br-loading").hidden = !(t && t.url && !t.ready);
  $("br-quick").querySelectorAll("button").forEach((b) => { const s = BR_SITES.find((x) => x[0] === b.dataset.site); b.classList.toggle("on", !!(t && siteFor(t.url) === s)); });
  brSave();
}

// Where the page area is, in window coordinates. Chromium's rects already include
// the app's CSS zoom, so they map straight onto the window.
function brBounds() {
  const r = $("br-view").getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}
const COVERS = ["#palette", ".modal-wrap", "#notif-pop", "#modes-pop", "#model-pop", "#drop-hint", "#updating"];
function brCovered() {
  return COVERS.some((sel) => [...document.querySelectorAll(sel)].some((el) => !el.hidden && el.offsetParent !== null));
}
let brLaidOut = "";
function brLayout() {
  const t = brTab();
  const show = !brLocked() && $("view-browser").classList.contains("active") && t && t.open && !brCovered();
  const b = brBounds();
  const key = show ? `${t.id}|${Math.round(b.x)}|${Math.round(b.y)}|${Math.round(b.w)}|${Math.round(b.h)}` : "none";
  if (key === brLaidOut) return;
  brLaidOut = key;
  invoke("browser_layout", { active: show ? t.id : null, b }).catch(() => {});
}
let brRaf = 0;
const brLayoutSoon = () => { cancelAnimationFrame(brRaf); brRaf = requestAnimationFrame(brLayout); };

async function brOpen(url, id) {
  if (brLocked()) return;
  let t = brTab(id);
  if (!t) return;
  url = String(url || "").trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = /^[\w-]+(\.[\w-]+)+(\/|$)/.test(url) ? "https://" + url : "https://www.google.com/search?q=" + encodeURIComponent(url);
  t.url = url; t.ready = false; t.loading = true;
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
}
function brNewTab(url) {
  const id = "t" + (++br.seq);
  br.tabs.push({ id, url: null, title: "New tab", open: false });
  brActivate(id);
  if (url) brOpen(url);
  else setTimeout(() => $("br-url").focus(), 50);
}
function brClose(id) {
  const i = br.tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const t = br.tabs[i];
  if (t.open) invoke("browser_ctl", { id, op: "close" }).catch(() => {});
  br.tabs.splice(i, 1);
  if (!br.tabs.length) br.tabs.push({ id: "t" + (++br.seq), url: null, title: "New tab", open: false });
  if (br.active === id) brActivate((br.tabs[i] || br.tabs[i - 1]).id);
  else brRenderTabs();
}

// Page events from the backend.
listen("browser-page", (e) => {
  const p = e.payload || {}, t = brTab(p.id);
  if (!t) return;
  t.loading = !!p.loading;
  if (!p.loading) t.ready = true;
  if (p.url && !/^about:/.test(p.url)) t.url = p.url;
  brRenderTabs();
});
listen("browser-title", (e) => {
  const p = e.payload || {}, t = brTab(p.id);
  if (t && p.title) { t.title = p.title.slice(0, 80); brRenderTabs(); }
});

// Controls.
$("br-tabs").addEventListener("click", (e) => {
  const x = e.target.closest("[data-close]");
  if (x) { e.stopPropagation(); brClose(x.dataset.close); return; }
  const tab = e.target.closest(".br-tab");
  if (tab) brActivate(tab.dataset.id);
});
$("br-tabs").addEventListener("auxclick", (e) => { const tab = e.target.closest(".br-tab"); if (tab && e.button === 1) brClose(tab.dataset.id); });
$("br-new").onclick = () => brNewTab();
const brPick = (e) => {
  const b = e.target.closest("[data-site]");
  if (!b) return;
  const s = BR_SITES.find((x) => x[0] === b.dataset.site);
  const t = brTab();
  // From the toolbar: reuse this tab only if it's empty.
  if (e.currentTarget.id === "br-quick" && t && t.url) brNewTab(s[2]); else brOpen(s[2]);
};
$("br-grid").addEventListener("click", brPick);
$("br-quick").addEventListener("click", brPick);
$("br-url").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); brOpen($("br-url").value); $("br-url").blur(); } });
$("br-url").addEventListener("focus", () => $("br-url").select());
for (const [btn, op] of [["br-back", "back"], ["br-fwd", "forward"], ["br-reload", "reload"]]) {
  $(btn).onclick = () => { const t = brTab(); if (t && t.open) invoke("browser_ctl", { id: t.id, op }).catch((e) => toast(errText(e))); };
}
$("br-ext").onclick = () => { const t = brTab(); if (t && t.url) invoke("open_url", { url: t.url }).catch((e) => toast(errText(e))); };

// Keep the native page lined up and out of the way.
new ResizeObserver(brLayoutSoon).observe($("br-view"));
window.addEventListener("resize", brLayoutSoon);
new MutationObserver(brLayoutSoon).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });
const brBaseGo = go;
go = function (view) {
  brBaseGo(view);
  if (view === "browser") { const t = brTab(); if (t && t.url && !t.open) brOpen(t.url); }
  brLaidOut = "";
  brLayoutSoon();
};
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.altKey && e.key.toLowerCase() === "b") {
    e.preventDefault();
    lsSet("vs-browser-beta", brLocked() ? "on" : "off");
    brApplyLock();
    brLaidOut = "";
    brLayoutSoon();
    toast(brLocked() ? "Browser locked again." : "Browser beta unlocked on this PC.");
    return;
  }
  if (brLocked() || !$("view-browser").classList.contains("active") || !(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === "t") { e.preventDefault(); brNewTab(); }
  else if (k === "w") { e.preventDefault(); brClose(br.active); }
  else if (k === "l") { e.preventDefault(); $("br-url").focus(); }
  else if (k === "r") { e.preventDefault(); $("br-reload").click(); }
});
brRenderTabs();
brApplyLock();

// Palette + slash: open an AI in the Browser (once it's unlocked).
const brBasePalette = paletteItems;
paletteItems = function () {
  const items = brBasePalette();
  if (brLocked()) return items;
  const at = items.findIndex((x) => x.g === "Templates");
  items.splice(at, 0, ...BR_SITES.map((s) => ({ g: "Browser", t: "Open " + s[1], d: s[4], i: brTile(s), run: () => { go("browser"); brNewTab(s[2]); } })));
  return items;
};

