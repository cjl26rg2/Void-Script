// SPDX-License-Identifier: GPL-3.0-or-later
// features.js - the command palette, slash commands, keyboard shortcuts, the Home
// dashboard, appearance settings and chat export. Loaded after app.js and uses
// its helpers ($, go, sendChat, runLuau, VSKit…).
"use strict";

// ── appearance: accent, density, chat text size ─────────────────────────────
function applyLook() {
  const root = document.documentElement;
  const acc = lsGet("vs-accent") || "ember";
  if (acc === "ember") root.removeAttribute("data-accent"); else root.dataset.accent = acc;
  root.dataset.density = lsGet("vs-density") || "cozy";
  root.style.setProperty("--fs", (lsGet("vs-fs") || "14") + "px");
  $("accent-row").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.acc === acc));
  $("density-seg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.d === root.dataset.density));
  $("fs-seg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.fs === (lsGet("vs-fs") || "14")));
}
$("accent-row").addEventListener("click", (e) => { const b = e.target.closest("[data-acc]"); if (b) { lsSet("vs-accent", b.dataset.acc); applyLook(); } });
$("density-seg").addEventListener("click", (e) => { const b = e.target.closest("[data-d]"); if (b) { lsSet("vs-density", b.dataset.d); applyLook(); } });
$("fs-seg").addEventListener("click", (e) => { const b = e.target.closest("[data-fs]"); if (b) { lsSet("vs-fs", b.dataset.fs); applyLook(); } });
applyLook();

$("set-nro").addEventListener("change", (e) => { lsSet("vs-nro", e.target.checked ? "on" : "off"); renderMode(); });
$("set-attn").checked = lsGet("vs-attn") !== "off";
$("set-attn").addEventListener("change", (e) => lsSet("vs-attn", e.target.checked ? "on" : "off"));
function renderNroList() {
  const chain = fallbackChain(prov()).map((p) => PROV_NAME[p]);
  $("nro-list").textContent = chain.length > 1 ? "Order: " + chain.join(" → ") : "Add a key for a second provider to use this.";
}
document.querySelector('[data-view="settings"]').addEventListener("click", renderNroList);

// ── chat list panel ─────────────────────────────────────────────────────────
function setChatList(show) {
  $("view-chat").classList.toggle("no-list", !show);
  $("btn-chats-show").hidden = show;
  lsSet("vs-chatlist", show ? "on" : "off");
}
$("btn-chats-hide").onclick = () => setChatList(false);
$("btn-chats-show").onclick = () => setChatList(true);
setChatList(lsGet("vs-chatlist") !== "off");

// ── composer niceties: character count, jump-to-latest ──────────────────────
input.addEventListener("input", () => {
  const n = input.value.length;
  $("comp-count").textContent = n > 400 ? n.toLocaleString() + " chars" : "";
});
body.addEventListener("scroll", () => {
  $("btn-scroll-down").hidden = body.scrollHeight - body.scrollTop - body.clientHeight < 240;
});
$("btn-scroll-down").onclick = () => body.scrollTo({ top: body.scrollHeight, behavior: "smooth" });

// ── chat export ─────────────────────────────────────────────────────────────
function chatMarkdown() {
  const out = [`# ${chat.title || "VoidScript chat"}`, ""];
  for (const m of chat.messages) {
    if (Array.isArray(m.content)) continue;
    if (m.role === "user") out.push("## You", "", stripRefs(m.content), "");
    else if (m.role === "assistant") {
      if (m.content) out.push("## VoidScript", "", m.content, "");
      for (const c of m.tool_calls || []) out.push(`> tool: \`${c.function.name}\` ${c.function.arguments || ""}`, "");
    }
  }
  return out.join("\n");
}
async function exportChat() {
  if (!chat.messages.length) { toast("Nothing to save yet."); return; }
  const name = (chat.title || "chat").replace(/[^\w -]+/g, "").trim().slice(0, 50) || "chat";
  try { if (await invoke("save_text", { name: name + ".md", content: chatMarkdown() })) toast("Chat saved."); } catch (e) { toast(errText(e)); }
}
$("btn-chat-export").onclick = exportChat;
$("btn-data-export").onclick = async () => {
  const keys = ["vs-chats", "vs-prompts", "vs-learn", "vs-stats", "vs-models", "vs-uis", "vs-mode"];
  const data = {};
  for (const k of keys) { const v = lsGet(k); if (v) try { data[k] = JSON.parse(v); } catch { data[k] = v; } }
  try { if (await invoke("save_text", { name: "voidscript-data.json", content: JSON.stringify(data, null, 2) })) toast("Exported."); } catch (e) { toast(errText(e)); }
};
$("btn-chats-wipe").onclick = async () => {
  if (!chats.length) { toast("No chats to delete."); return; }
  if (!(await approve("delete", "Delete chats", `Delete all ${chats.length} chats?`, "They're only stored on this PC, so this can't be undone.", { once: true }))) return;
  chats = [];
  if (!chat.busy) { Object.assign(chat, { id: null, title: "", messages: [] }); clearChatView(); }
  persistChats();
  toast("All chats deleted.");
};

// ── Home dashboard ──────────────────────────────────────────────────────────
function renderHome() {
  const h = new Date().getHours();
  $("home-greet").textContent = h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const recent = chats.slice().sort((a, b) => b.t - a.t).slice(0, 5);
  $("home-chats").innerHTML = recent.length
    ? recent.map((c) => `<button class="hc-row" data-id="${c.id}"><b>${esc(c.title || "New chat")}</b><span>${esc(ago(c.t))}</span></button>`).join("")
    : '<p class="muted small-p">No chats yet. Ask for something and it shows up here.</p>';
  const n = (k) => (stats[k] || 0).toLocaleString();
  $("home-stats").innerHTML = [["messages", "messages sent"], ["chats", "chats"], ["systems", "systems added"], ["fallbacks", "provider saves"]]
    .map(([k, l]) => `<div><b>${n(k)}</b><span>${l}</span></div>`).join("");
}
$("home-chats").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) openChat(b.dataset.id); });
$("btn-home-chats").onclick = () => { setChatList(true); go("chat"); };
$("home-quick").addEventListener("click", (e) => {
  const b = e.target.closest("[data-qa]");
  if (!b) return;
  const a = b.dataset.qa;
  if (a === "chat") newChat();
  else if (a === "health") { go("kit"); kitTab("care"); $("btn-health").click(); }
  else if (a === "palette") openPalette();
  else go(a);
});
renderHome();

// ── slash commands ──────────────────────────────────────────────────────────
const SLASH = [
  ["/new", "Start a new chat", () => newChat()],
  ["/agent", "Turn Agent mode on or off", () => { mode.agent = !mode.agent; saveMode(); toast(mode.agent ? "Agent on." : "Agent off."); }],
  ["/plan", "Turn Plan first on or off", () => { mode.plan = !mode.plan; saveMode(); toast(mode.plan ? "Plan first on." : "Plan first off."); }],
  ["/think", "Turn Thinking on or off", () => { mode.think = !mode.think; saveMode(); toast(mode.think ? "Thinking on." : "Thinking off."); }],
  ["/export", "Save this chat as Markdown", () => exportChat()],
  ["/play", "Play the game in Studio", () => $("btn-play").click()],
  ["/stop", "Stop playing in Studio", () => $("btn-stopplay").click()],
  ["/undo", "Undo the last change in Studio", () => undoStudio(null)],
  ["/health", "Run the place health check", () => { go("kit"); kitTab("care"); $("btn-health").click(); }],
  ["/model", "Change the AI model", () => $("chat-model").click()],
  ["/p", "Insert a saved prompt", null],
].concat(VSKit.TOOLS.map((t) => ["/" + t.id, t.name, () => runBrief(t)]));
let slashSel = 0;
function slashMatches() {
  const v = input.value;
  if (!/^\/\S*$/.test(v)) return null;
  if (/^\/p$/.test(v) || v.startsWith("/p ")) return prompts.map((p) => ["/p", p, () => { input.value = p; grow(); input.focus(); }]);
  return SLASH.filter(([c]) => c.startsWith(v.toLowerCase()));
}
function renderSlash() {
  const list = slashMatches();
  const pop = $("slash-pop");
  if (pop.dataset.mode === "mention" && !list) return;
  pop.dataset.mode = "";
  if (!list || !list.length) { pop.hidden = true; return; }
  slashSel = Math.min(slashSel, list.length - 1);
  pop.innerHTML = list.map(([c, d], i) => `<button class="sl-item${i === slashSel ? " hl" : ""}" data-i="${i}"><b>${esc(c)}</b><span>${esc(d.length > 90 ? d.slice(0, 90) + "…" : d)}</span></button>`).join("");
  pop.hidden = false;
}
function runSlash(i) {
  const list = slashMatches();
  const item = list && list[i];
  if (!item) return false;
  $("slash-pop").hidden = true;
  if (item[0] === "/p" && !item[2]) { input.value = "/p "; renderSlash(); return true; }
  input.value = ""; grow();
  item[2]();
  return true;
}
input.addEventListener("input", () => { slashSel = 0; renderSlash(); });
input.addEventListener("keydown", (e) => {
  if ($("slash-pop").hidden || $("slash-pop").dataset.mode === "mention") return;
  const n = $("slash-pop").children.length;
  if (e.key === "ArrowDown") { e.preventDefault(); slashSel = (slashSel + 1) % n; renderSlash(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); slashSel = (slashSel - 1 + n) % n; renderSlash(); }
  else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); runSlash(slashSel); }
  else if (e.key === "Escape") { $("slash-pop").hidden = true; }
}, true);
$("slash-pop").addEventListener("mousedown", (e) => { const b = e.target.closest("[data-i]"); if (b) { e.preventDefault(); runSlash(Number(b.dataset.i)); } });

// ── command palette (Ctrl+K) ────────────────────────────────────────────────
const PAGES = [["home", "Home"], ["chat", "Chat"], ["select", "Selection"], ["uicheck", "UI Check"], ["kit", "Toolkit"], ["tools", "Tools"], ["mcp", "MCP servers"], ["terminal", "Terminal"], ["updates", "Updates"], ["settings", "Settings"]];
function paletteItems() {
  const navIcon = (v) => { const s = document.querySelector(`.nav-item[data-view="${v}"] svg`); return s ? s.outerHTML : ICONS.go; };
  const items = [];
  for (const [v, n] of PAGES) items.push({ g: "Go to", t: n, i: navIcon(v), run: () => go(v) });
  const act = (t, i, run, d) => items.push({ g: "Actions", t, i, run, d });
  act("New chat", ICONS.chat, newChat, "Ctrl+N");
  act(S.state.process === "running" || S.state.connected ? "Stop the bridge" : "Start the bridge", ICONS.bolt, () => $("btn-bridge-toggle").click());
  act("Restart the bridge", ICONS.retry, () => $("btn-bridge-restart").click());
  act("Play in Studio", ICONS.play, () => $("btn-play").click());
  act("Stop playing", ICONS.x, () => $("btn-stopplay").click());
  act("Undo the last Studio change", ICONS.retry, () => undoStudio(null));
  act("Run the health check", ICONS.code, () => { go("kit"); kitTab("care"); $("btn-health").click(); });
  act("Back up the place", ICONS.copy, () => $("btn-backup").click());
  act((mode.agent ? "Turn off" : "Turn on") + " Agent mode", ICONS.agent, () => { mode.agent = !mode.agent; saveMode(); });
  act((nroOn() ? "Turn off" : "Turn on") + " Never run out", ICONS.retry, () => $("btn-nro").click());
  act("Save this chat as Markdown", ICONS.copy, exportChat);
  act("Show or hide the chat list", ICONS.chat, () => setChatList($("view-chat").classList.contains("no-list")), "Ctrl+B");
  act("Keyboard shortcuts", ICONS.gear, showKeys, "Ctrl+/");
  act("Check for updates", ICONS.retry, () => { go("updates"); $("btn-upd-check").click(); });
  for (const t of VSKit.TEMPLATES) items.push({ g: "Templates", t: t.name, d: t.desc, i: t.icon, run: () => runBrief(t) });
  for (const t of VSKit.TOOLS) items.push({ g: "Script tools", t: t.name, d: t.desc, i: t.icon, run: () => runBrief(t) });
  for (const s of VSKit.SNIPPETS) items.push({ g: "Script library", t: s.name, d: s.desc, i: s.icon, run: () => { go("kit"); kitTab("lib"); showSnippet(s.id); } });
  for (const l of VSKit.LIGHTING) items.push({ g: "Lighting", t: l.name, i: l.icon, run: () => runLuau(VSKit.lightingLuau(l.id), `Lighting set: ${l.name}.`, null) });
  for (const c of chats.slice(0, 40)) items.push({ g: "Chats", t: c.title || "New chat", d: ago(c.t), i: ICONS.chat, run: () => openChat(c.id) });
  for (const p of prompts) items.push({ g: "Saved prompts", t: p, i: ICONS.star, run: () => { go("chat"); input.value = p; grow(); input.focus(); } });
  return items;
}
let palItems = [], palShown = [], palSel = 0;
function fuzzy(q, s) {
  s = s.toLowerCase();
  if (s.includes(q)) return 100 - s.indexOf(q);
  let i = 0;
  for (const ch of s) if (ch === q[i]) i++;
  return i === q.length ? 10 : -1;
}
function renderPalette() {
  const q = $("pal-q").value.trim().toLowerCase();
  palShown = q
    ? palItems.map((it) => ({ it, sc: Math.max(fuzzy(q, it.t), it.d ? fuzzy(q, it.d) - 30 : -1) })).filter((x) => x.sc >= 0).sort((a, b) => b.sc - a.sc).slice(0, 60).map((x) => x.it)
    : palItems.filter((it) => it.g === "Go to" || it.g === "Actions" || (it.g === "Chats" && chats.indexOf(chats.find((c) => c.title === it.t)) < 5));
  palSel = Math.min(palSel, Math.max(0, palShown.length - 1));
  let html = "", g = "";
  palShown.forEach((it, i) => {
    if (!q && it.g !== g) { g = it.g; html += `<div class="pal-g">${esc(g)}</div>`; }
    html += `<button class="pal-item${i === palSel ? " hl" : ""}" data-i="${i}"><span class="pi">${it.i || ""}</span><span class="pt">${esc(it.t)}</span>${it.d ? `<span class="pd">${esc(it.d.length > 48 ? it.d.slice(0, 48) + "…" : it.d)}</span>` : ""}${q ? `<span class="pd">${esc(it.g)}</span>` : ""}</button>`;
  });
  $("pal-list").innerHTML = html || '<div class="pal-empty">Nothing found.</div>';
  const hl = $("pal-list").querySelector(".hl");
  if (hl) hl.scrollIntoView({ block: "nearest" });
}
function openPalette() {
  palItems = paletteItems(); palSel = 0;
  $("pal-q").value = "";
  $("palette").hidden = false;
  renderPalette();
  $("pal-q").focus();
}
function closePalette() { $("palette").hidden = true; }
function runPalette(i) {
  const it = palShown[i];
  if (!it) return;
  closePalette();
  it.run();
}
$("btn-palette").onclick = openPalette;
$("pal-q").addEventListener("input", () => { palSel = 0; renderPalette(); });
$("pal-q").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); palSel = Math.min(palShown.length - 1, palSel + 1); renderPalette(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); palSel = Math.max(0, palSel - 1); renderPalette(); }
  else if (e.key === "Enter") { e.preventDefault(); runPalette(palSel); }
  else if (e.key === "Escape") closePalette();
});
$("pal-list").addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) runPalette(Number(b.dataset.i)); });
$("palette").addEventListener("mousedown", (e) => { if (e.target === $("palette")) closePalette(); });

// ── keyboard shortcuts ──────────────────────────────────────────────────────
const KEYS = [
  [["Ctrl", "K"], "Command palette"], [["Ctrl", "N"], "New chat"], [["Ctrl", "B"], "Show or hide the chat list"],
  [["Ctrl", "1…9"], "Jump to a page"], [["Ctrl", ","], "Settings"], [["Ctrl", "Shift", "E"], "Save the chat as Markdown"],
  [["/"], "Commands in the chat box"], [["Esc"], "Stop the AI, or close a menu"], [["Ctrl", "/"], "This list"],
];
function showKeys() {
  $("keys-list").innerHTML = KEYS.map(([k, d]) => `<span>${esc(d)}</span><div>${k.map((x) => `<kbd>${esc(x)}</kbd>`).join("")}</div>`).join("");
  $("shortcuts").hidden = false;
}
$("btn-shortcuts").onclick = showKeys;
$("btn-keys-close").onclick = () => { $("shortcuts").hidden = true; };
const NAV_ORDER = ["home", "chat", "select", "uicheck", "kit", "tools", "mcp", "terminal"];
document.addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (ctrl && k === "k") { e.preventDefault(); $("palette").hidden ? openPalette() : closePalette(); return; }
  if (e.key === "Escape") {
    if (!$("palette").hidden) { closePalette(); return; }
    if (!$("shortcuts").hidden) { $("shortcuts").hidden = true; return; }
    if (!$("modes-pop").hidden) { $("modes-pop").hidden = true; $("btn-modes").classList.remove("open"); return; }
    if (!$("model-pop").hidden) return;
    if (chat.busy) { $("btn-stop-chat").click(); return; }
  }
  if (!ctrl) return;
  if (k === "n" && !e.shiftKey) { e.preventDefault(); newChat(); }
  else if (k === "b") { e.preventDefault(); go("chat"); setChatList($("view-chat").classList.contains("no-list")); }
  else if (k === ",") { e.preventDefault(); go("settings"); }
  else if (k === "/") { e.preventDefault(); showKeys(); }
  else if (k === "e" && e.shiftKey) { e.preventDefault(); exportChat(); }
  else if (/^[1-9]$/.test(e.key) && !e.shiftKey) { const v = NAV_ORDER[Number(e.key) - 1]; if (v) { e.preventDefault(); go(v); } }
});

// ── top bar: Studio status, play/stop, focus mode, help ─────────────────────
function tbStatus() {
  const st = S.state || {};
  const on = st.connected && st.studio === true;
  setDot(document.querySelector("#tb-studio .dot"), on ? "ok" : st.connected ? "warn" : "");
  $("tb-studio-t").textContent = on ? (st.place_name || "Studio connected") : st.connected ? "Studio not connected" : "Bridge off";
}
const baseRender = render;
render = function () { baseRender(); tbStatus(); };
tbStatus();
$("tb-studio").onclick = () => go("home");
$("tb-play").onclick = () => $("btn-play").click();
$("tb-stop").onclick = () => $("btn-stopplay").click();
$("tb-help").onclick = showKeys;
function toggleFocus() {
  const on = document.documentElement.classList.toggle("focus");
  $("tb-focus").classList.toggle("on", on);
  toast(on ? "Focus mode: Ctrl+Shift+F to leave." : "Focus mode off.");
}
$("tb-focus").onclick = toggleFocus;
$("btn-notif-mute").onclick = () => {
  const on = $("set-sounds").checked;
  $("set-sounds").checked = !on;
  $("set-sounds").dispatchEvent(new Event("change"));
  $("btn-notif-mute").textContent = on ? "Unmute sounds" : "Mute sounds";
};

// ── interface zoom ──────────────────────────────────────────────────────────
function setZoom(z) {
  z = Math.min(1.5, Math.max(0.8, Math.round(z * 100) / 100));
  document.documentElement.style.zoom = z;
  lsSet("vs-zoom", String(z));
  $("zoom-val").textContent = Math.round(z * 100) + "%";
  $("zoom-seg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", Number(b.dataset.z) === z));
}
$("zoom-seg").addEventListener("click", (e) => { const b = e.target.closest("[data-z]"); if (b) setZoom(Number(b.dataset.z)); });
setZoom(Number(lsGet("vs-zoom")) || 1);

// ── settings: section nav and search ────────────────────────────────────────
$("set-nav").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-sec]");
  if (!b) return;
  $("set-nav").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  const card = document.querySelector(`#set-body .card[data-sec="${b.dataset.sec}"]`);
  if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
});
$("set-q").addEventListener("input", () => {
  const q = $("set-q").value.trim().toLowerCase();
  document.querySelectorAll("#set-body .card").forEach((card) => {
    const rows = card.querySelectorAll(".switch-row, .field");
    let hit = !q || card.querySelector(".card-t").textContent.toLowerCase().includes(q);
    rows.forEach((r) => { const m = !!q && r.textContent.toLowerCase().includes(q); r.classList.toggle("hit", m); hit = hit || m; });
    card.classList.toggle("dim", !hit);
  });
  const first = document.querySelector("#set-body .hit, #set-body .card:not(.dim)");
  if (q && first) first.scrollIntoView({ block: "nearest" });
});

// ── terminal: level filter, search, save ────────────────────────────────────
let termLevel = "all";
function termFilter(ln) {
  const q = $("term-q").value.trim().toLowerCase();
  const lvl = termLevel === "all" || (termLevel === "err" ? ln.classList.contains("err") : ln.classList.contains("err") || ln.classList.contains("warn"));
  ln.classList.toggle("hide", !lvl || (!!q && !ln.textContent.toLowerCase().includes(q)));
}
const termAll = () => $("term").querySelectorAll(".ln").forEach(termFilter);
$("term-level").addEventListener("click", (e) => {
  const b = e.target.closest("[data-l]");
  if (!b) return;
  termLevel = b.dataset.l;
  $("term-level").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  termAll();
});
$("term-q").addEventListener("input", termAll);
new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach((n) => n.classList && n.classList.contains("ln") && termFilter(n)); }).observe($("term"), { childList: true });
$("btn-term-save").onclick = async () => {
  const text = [...$("term").querySelectorAll(".ln")].map((l) => l.textContent).join("\n");
  try { if (await invoke("save_text", { name: "voidscript-log.txt", content: text })) toast("Log saved."); } catch (e) { toast(errText(e)); }
};

// ── tools: categories ───────────────────────────────────────────────────────
const TOOL_CATS = [
  ["Scripts", /^script_|multi_edit/], ["Game", /game_tree|inspect|execute_luau|studio_state|subagent|skill/],
  ["Assets", /asset|mesh|texture|material|image|procedural/], ["Playtest", /play|console|keyboard|mouse|character|capture/],
  ["Files", /^workspace_|file|read|write/],
];
let toolCat = "All";
const toolCatOf = (n) => (TOOL_CATS.find(([, re]) => re.test(n)) || ["Other"])[0];
function renderToolChips() {
  const names = (S.state.tools || []).map((t) => t.name);
  const counts = { All: names.length };
  names.forEach((n) => { const c = toolCatOf(n); counts[c] = (counts[c] || 0) + 1; });
  $("tools-chips").innerHTML = Object.keys(counts).map((c) => `<button data-c="${c}" class="${c === toolCat ? "on" : ""}">${c}<i>${counts[c]}</i></button>`).join("");
  $("tools-list").querySelectorAll(".tcard").forEach((card) => {
    const n = (card.querySelector(".tn") || {}).textContent || "";
    card.hidden = toolCat !== "All" && toolCatOf(n) !== toolCat;
  });
}
$("tools-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-c]"); if (b) { toolCat = b.dataset.c; renderToolChips(); } });
const baseRenderTools = renderTools;
renderTools = function () { baseRenderTools(); renderToolChips(); };
renderToolChips();

// ── chat: drafts, copy all, quick starts ────────────────────────────────────
let drafts = {};
try { drafts = JSON.parse(lsGet("vs-drafts") || "{}"); } catch {}
const draftsOn = () => lsGet("vs-drafts-on") !== "off";
$("set-drafts").checked = draftsOn();
$("set-drafts").addEventListener("change", (e) => lsSet("vs-drafts-on", e.target.checked ? "on" : "off"));
let draftTimer = 0;
input.addEventListener("input", () => {
  if (!draftsOn()) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const k = chat.id || "new";
    if (input.value.trim()) drafts[k] = input.value; else delete drafts[k];
    lsSet("vs-drafts", JSON.stringify(drafts));
  }, 400);
});
function restoreDraft() {
  input.value = draftsOn() ? drafts[chat.id || "new"] || "" : "";
  grow();
}
const baseOpenChat = openChat, baseNewChat = newChat;
openChat = function (id) { baseOpenChat(id); restoreDraft(); };
newChat = function () { baseNewChat(); restoreDraft(); };
$("btn-new-chat").onclick = () => newChat();
// A sent message is no longer a draft.
$("btn-send").addEventListener("click", () => { clearTimeout(draftTimer); delete drafts[chat.id || "new"]; lsSet("vs-drafts", JSON.stringify(drafts)); }, true);
restoreDraft();
$("btn-chat-copyall").onclick = async () => {
  if (!chat.messages.length) { toast("Nothing to copy yet."); return; }
  try { await navigator.clipboard.writeText(chatMarkdown()); toast("Chat copied."); } catch { toast("Couldn't copy."); }
};
$("chat-starts").innerHTML = VSKit.TEMPLATES.filter((t) => ["obby", "tycoon", "sim", "rounds", "shop", "pets"].includes(t.id))
  .map((t) => `<button data-t="${t.id}">${t.icon}${esc(t.name)}</button>`).join("");
$("chat-starts").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) runBrief(VSKit.TEMPLATES.find((t) => t.id === b.dataset.t)); });

// ── Home tips ───────────────────────────────────────────────────────────────
const TIPS = [
  "Press Ctrl+K to jump anywhere or run any action.",
  "Type / in the chat for quick commands like /fix, /agent and /export.",
  "Turn on Agent in the chat's mode menu and the AI playtests and fixes its own errors.",
  "Never run out moves the chat to your next free provider when one hits its limit.",
  "Star a message to save it as a prompt, then reuse it with /p.",
  "Name a part KillBrick, Coin or JumpPad and add that system from the Script library.",
  "Select something in Studio, then open Selection to fix it in one click.",
  "Undo in the chat header rolls Studio back one step.",
  "Pin chats you come back to - they stay at the top of the list.",
  "Ctrl+Shift+F hides everything but the page you're on.",
];
let tipI = Math.floor(Math.random() * TIPS.length);
const showTip = () => { $("home-tip").textContent = TIPS[tipI % TIPS.length]; };
$("btn-tip-next").onclick = () => { tipI++; showTip(); };
showTip();

// ── what's new (once per version) ───────────────────────────────────────────
const WHATS_NEW = [
  [ICONS.play, "Playtest", "Studio's Output live in the app, test runs with a history, and errors to the AI in one click."],
  [ICONS.retry, "Undo and more", "Undo deleted chats, recent models, favourite templates and a right-click menu for chats."],
  [ICONS.code, "Explorer edits", "Flip, type or duplicate right in the Explorer."],
  [ICONS.bolt, "21 ready-made systems", "Teleport pads, speed pads, healing pads, tool givers and auto teams join the library."],
  [ICONS.gear, "Fewer false alarms", "No shortcut rewriting and no hidden helper commands, so antivirus tools stay calm."],
  [ICONS.agent, "Little things", "A setup checklist, paste-in pictures, a working timer and a confirm before closing mid-build."],
];
function showWhatsNew() {
  $("wn-list").innerHTML = WHATS_NEW.map(([i, t, d]) => `<div><i>${i}</i><span><b>${esc(t)}</b>${esc(d)}</span></div>`).join("");
  $("whatsnew").hidden = false;
}
$("btn-wn-close").onclick = () => { $("whatsnew").hidden = true; lsSet("vs-seen-ver", S.version || "7"); };
$("btn-whatsnew").onclick = showWhatsNew;
setTimeout(() => {
  if (S.version && /^7\./.test(S.version) && lsGet("vs-seen-ver") !== S.version && $("disclaimer").hidden) showWhatsNew();
}, 1500);

// ── message times + going offline ───────────────────────────────────────────
new MutationObserver((ms) => {
  for (const m of ms) m.addedNodes.forEach((n) => { if (n.classList && n.classList.contains("msg") && !n.title) n.title = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); });
}).observe(body, { childList: true });
window.addEventListener("offline", () => toast("You're offline - the AI can't answer until you're back.", 5000));
window.addEventListener("online", () => toast("Back online."));

document.addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl) return;
  if (e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); toggleFocus(); }
  else if (e.key === "=" || e.key === "+") { e.preventDefault(); setZoom((Number(lsGet("vs-zoom")) || 1) + 0.1); }
  else if (e.key === "-") { e.preventDefault(); setZoom((Number(lsGet("vs-zoom")) || 1) - 0.1); }
  else if (e.key === "0" && !e.shiftKey) { e.preventDefault(); setZoom(1); }
});
KEYS.splice(KEYS.length - 1, 0, [["Ctrl", "Shift", "F"], "Focus mode"], [["Ctrl", "+ / −"], "Zoom in or out"]);

// ── find in chat (Ctrl+F) ───────────────────────────────────────────────────
const findBar = document.createElement("div");
findBar.className = "find-bar";
findBar.hidden = true;
findBar.innerHTML = `${ICONS.find}<input placeholder="Find in this chat" spellcheck="false" /><span class="find-n"></span>
  <button class="ibtn" data-f="prev" title="Previous (Shift+Enter)"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>
  <button class="ibtn" data-f="next" title="Next (Enter)"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>
  <button class="ibtn" data-f="close" title="Close (Esc)">${ICONS.x}</button>`;
document.querySelector(".chat-main").appendChild(findBar);
const findInput = findBar.querySelector("input");
let findHits = [], findAt = 0;
function clearFind() {
  body.querySelectorAll("mark.fh").forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
  body.normalize();
  findHits = [];
}
function runFind() {
  clearFind();
  const q = findInput.value.trim().toLowerCase();
  if (!q) { findBar.querySelector(".find-n").textContent = ""; return; }
  const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement.closest(".msg-acts, .find-bar") ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT });
  const nodes = [];
  let n;
  while ((n = w.nextNode())) if (n.nodeValue.toLowerCase().includes(q)) nodes.push(n);
  for (const node of nodes) {
    let text = node.nodeValue, i;
    const frag = document.createDocumentFragment();
    while ((i = text.toLowerCase().indexOf(q)) >= 0) {
      frag.append(text.slice(0, i));
      const m = document.createElement("mark");
      m.className = "fh"; m.textContent = text.slice(i, i + q.length);
      frag.append(m); findHits.push(m);
      text = text.slice(i + q.length);
    }
    frag.append(text);
    node.replaceWith(frag);
  }
  findAt = findHits.length - 1;
  showFind();
}
function showFind() {
  findHits.forEach((m, i) => m.classList.toggle("cur", i === findAt));
  findBar.querySelector(".find-n").textContent = findHits.length ? `${findAt + 1} of ${findHits.length}` : "No matches";
  const cur = findHits[findAt];
  if (cur) { const t = cur.closest(".tool"); if (t) t.classList.add("open"); cur.scrollIntoView({ block: "center" }); }
}
function openFind() { go("chat"); findBar.hidden = false; findInput.focus(); findInput.select(); }
function closeFind() { findBar.hidden = true; clearFind(); }
let findTimer = 0;
findInput.addEventListener("input", () => { clearTimeout(findTimer); findTimer = setTimeout(runFind, 150); });
findInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeFind(); e.stopPropagation(); }
  else if (e.key === "Enter" && findHits.length) { findAt = (findAt + (e.shiftKey ? -1 : 1) + findHits.length) % findHits.length; showFind(); }
});
findBar.addEventListener("click", (e) => {
  const b = e.target.closest("[data-f]");
  if (!b) return;
  if (b.dataset.f === "close") closeFind();
  else if (findHits.length) { findAt = (findAt + (b.dataset.f === "prev" ? -1 : 1) + findHits.length) % findHits.length; showFind(); }
});

// ── "Ask about this": select text in a reply, quote it into the composer ────
const quoteBtn = document.createElement("button");
quoteBtn.className = "quote-btn";
quoteBtn.hidden = true;
quoteBtn.innerHTML = `${ICONS.chat}Ask about this`;
document.body.appendChild(quoteBtn);
document.addEventListener("mouseup", () => setTimeout(() => {
  const sel = window.getSelection();
  const text = sel && String(sel).trim();
  if (!text || text.length < 3 || !sel.anchorNode || !body.contains(sel.anchorNode)) { quoteBtn.hidden = true; return; }
  const r = sel.getRangeAt(0).getBoundingClientRect();
  const z = Number(document.documentElement.style.zoom) || 1;
  quoteBtn.style.left = Math.max(8, (r.left + r.width / 2) / z - 60) + "px";
  quoteBtn.style.top = Math.max(48, r.top / z - 40) + "px";
  quoteBtn.hidden = false;
}, 0));
quoteBtn.addEventListener("mousedown", (e) => {
  e.preventDefault();
  const text = String(window.getSelection()).trim();
  quoteBtn.hidden = true;
  const quoted = text.split("\n").map((l) => "> " + l).join("\n");
  input.value = (input.value ? input.value.replace(/\s*$/, "\n\n") : "") + quoted + "\n\n";
  grow(); input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
});
body.addEventListener("scroll", () => { quoteBtn.hidden = true; });

// ── context meter: how much of the model's memory this chat uses ────────────
const ctxMeter = document.createElement("span");
ctxMeter.className = "ctx";
ctxMeter.innerHTML = '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" class="ctx-bg"/><circle cx="10" cy="10" r="7.5" class="ctx-fg"/></svg>';
$("comp-count").before(ctxMeter);
const CTX_CHARS = 120000 * 3.5; // roughly a 120k-token model
function renderCtx() {
  const chars = chat.messages.reduce((n, m) => n + String(m.content || "").length + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0), 0);
  const f = Math.min(1, chars / CTX_CHARS);
  ctxMeter.hidden = chars < 2000;
  ctxMeter.querySelector(".ctx-fg").style.strokeDashoffset = String(47.1 * (1 - f));
  ctxMeter.classList.toggle("hot", f > 0.7);
  ctxMeter.title = `This chat is about ${Math.round(chars / 3.5 / 1000)}k tokens (${Math.round(f * 100)}% of a typical model's memory).` + (f > 0.7 ? " Type /compact to carry a summary into a fresh chat." : "");
}
setInterval(renderCtx, 1500);
renderCtx();

// ── /compact: summarise a long chat into a fresh one ────────────────────────
async function compactChat() {
  if (chat.busy) { toast("Wait for the reply to finish first."); return; }
  if (chat.messages.length < 4) { toast("This chat is still short - nothing to compact."); return; }
  const transcript = chatMarkdown().slice(-60000);
  toast("Summarising this chat…", 6000);
  try {
    const r = await callModel({ messages: [
      { role: "system", content: "You summarise a conversation between a Roblox developer and their AI build assistant so the work can continue in a new chat. Keep: the goal, what was built and where it lives (exact instance paths and script names), decisions, open problems and next steps. Plain markdown, under 350 words. No preamble." },
      { role: "user", content: transcript }], temperature: 0.2, max_tokens: 1200 }, { noThink: true, quiet: true });
    const sum = splitThinking(r.res.choices[0].message).content;
    if (!sum) throw new Error("The model returned an empty summary.");
    const title = chat.title;
    newChat();
    chat.title = "Continued: " + (title || "chat").slice(0, 48);
    chat.messages.push({ role: "user", content: "Here's a summary of our previous chat. Continue from here.\n\n" + sum }, { role: "assistant", content: "Got it - I'm caught up. What's next?" });
    addMsg("note", esc("Continued from a compacted chat."));
    addMsg("ai", md(sum));
    $("chat-empty").hidden = true;
    saveChat();
  } catch (e) { toast("Couldn't compact: " + errText(e), 6000); }
}

// ── Studio peek: a live screenshot of Studio ────────────────────────────────
const peek = document.createElement("div");
peek.className = "modal-wrap";
peek.hidden = true;
peek.innerHTML = `<div class="modal wide peek"><div class="row-between"><h2>Studio right now</h2><div class="row"><button class="btn sm" data-p="again">Retake</button><button class="btn sm" data-p="ask">Ask the AI about it</button><button class="btn sm" data-p="close">Close</button></div></div><div class="peek-img"><span class="spin"></span></div></div>`;
document.body.appendChild(peek);
async function studioPeek() {
  if (!S.state.connected) { toast("Start the bridge and open Roblox Studio first."); return; }
  peek.hidden = false;
  const box = peek.querySelector(".peek-img");
  box.innerHTML = '<span class="spin"></span>';
  try {
    const r = await invoke("bridge_request", { payload: { type: "call_tool", name: "screen_capture", arguments: {} }, timeoutMs: 60000 });
    const img = r && r.ok && r.images && r.images[0];
    if (!img) throw new Error((r && (r.error || r.text)) || "Studio didn't send a picture.");
    box.innerHTML = `<img alt="Roblox Studio" src="data:${img.mimeType || "image/png"};base64,${img.data}" />`;
  } catch (e) { box.innerHTML = `<p class="muted">${esc(errText(e))}</p>`; }
}
peek.addEventListener("click", (e) => {
  const b = e.target.closest("[data-p]");
  if (e.target === peek || (b && b.dataset.p === "close")) peek.hidden = true;
  else if (b && b.dataset.p === "again") studioPeek();
  else if (b && b.dataset.p === "ask") { peek.hidden = true; go("chat"); input.value = "Take a screenshot of Studio with screen_capture and tell me what you see - anything that looks broken or could look better?"; grow(); input.focus(); }
});
const peekBtn = document.createElement("button");
peekBtn.className = "tb-btn tb-i";
peekBtn.title = "Studio peek: a screenshot of Studio right now";
peekBtn.innerHTML = ICONS.camera;
$("tb-play").before(peekBtn);
peekBtn.onclick = studioPeek;

// ── import data (the other half of Export everything) ──────────────────────
const importBtn = document.createElement("button");
importBtn.className = "btn sm";
importBtn.textContent = "Import";
$("btn-data-export").after(importBtn);
const importFile = document.createElement("input");
importFile.type = "file"; importFile.accept = ".json,application/json"; importFile.hidden = true;
document.body.appendChild(importFile);
importBtn.onclick = () => importFile.click();
importFile.onchange = async () => {
  const f = importFile.files && importFile.files[0];
  importFile.value = "";
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const known = ["vs-chats", "vs-prompts", "vs-learn", "vs-stats", "vs-models", "vs-uis", "vs-mode"];
    let n = 0;
    for (const k of known) if (data[k] != null) { lsSet(k, typeof data[k] === "string" ? data[k] : JSON.stringify(data[k])); n++; }
    if (!n) throw new Error("That file isn't a VoidScript export.");
    toast("Imported. Reloading…");
    setTimeout(() => location.reload(), 800);
  } catch (e) { toast(errText(e), 5000); }
};

// ── remember the last page ──────────────────────────────────────────────────
const baseGo = go;
go = function (view) { baseGo(view); lsSet("vs-last-view", view); if (view !== "chat") quoteBtn.hidden = true; };
{
  const last = lsGet("vs-last-view");
  if (last && last !== "home" && $("view-" + last)) go(last);
}

// ── wire the new bits into slash commands, the palette and shortcuts ───────
SLASH.splice(1, 0, ["/compact", "Summarise this chat into a fresh one", compactChat], ["/find", "Find in this chat", openFind], ["/peek", "Screenshot Studio right now", studioPeek]);
const basePaletteItems = paletteItems;
paletteItems = function () {
  const items = basePaletteItems();
  const at = items.findIndex((x) => x.g === "Templates");
  items.splice(at, 0,
    { g: "Actions", t: "Find in this chat", i: ICONS.find, run: openFind, d: "Ctrl+F" },
    { g: "Actions", t: "Studio peek", i: ICONS.camera, run: studioPeek, d: "screenshot" },
    { g: "Actions", t: "Compact this chat", i: ICONS.fork, run: compactChat, d: "/compact" },
    { g: "Actions", t: "Branch this chat", i: ICONS.fork, run: () => forkChat(chat.messages.length) });
  return items;
};
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "f" && $("view-chat").classList.contains("active")) { e.preventDefault(); openFind(); }
});
KEYS.splice(KEYS.length - 1, 0, [["Ctrl", "F"], "Find in this chat"]);

// ── custom instructions + vision switch ─────────────────────────────────────
$("set-instr").value = lsGet("vs-instr") || "";
let instrTimer = 0;
$("set-instr").addEventListener("input", () => {
  clearTimeout(instrTimer);
  instrTimer = setTimeout(() => { lsSet("vs-instr", $("set-instr").value); toast("Custom instructions saved."); }, 700);
});
$("set-vision").checked = lsGet("vs-vision") !== "off";
$("set-vision").addEventListener("change", (e) => lsSet("vs-vision", e.target.checked ? "on" : "off"));

// ── watch Studio's Output for new errors ────────────────────────────────────
const ERR_LINE = /error|exception|attempt to|is not a valid member|infinite yield|nil value|stack begin/i;
let watchLast = null, watchBusy = false;
$("set-watch").checked = lsGet("vs-watch") === "on";
$("set-watch").addEventListener("change", (e) => { lsSet("vs-watch", e.target.checked ? "on" : "off"); watchLast = null; });
async function watchOutput() {
  if (lsGet("vs-watch") !== "on" || watchBusy || chat.busy || !S.state.connected || S.state.studio !== true) return;
  watchBusy = true;
  try {
    const out = await callTool("get_console_output", {}, 15000);
    if (watchLast != null) {
      const fresh = out.startsWith(watchLast) ? out.slice(watchLast.length) : "";
      const errs = [...new Set(fresh.split("\n").map((l) => l.trim()).filter((l) => ERR_LINE.test(l) && !/VoidScript|MCP|plugin/i.test(l)))];
      if (errs.length) {
        notify("warn", `${errs.length} new error${errs.length === 1 ? "" : "s"} in Studio`, errs[0].slice(0, 160), { go: "chat" });
        toast(`Studio: ${errs[0].slice(0, 110)} - press /fix in the chat to fix it.`, 6000);
        sfx("error");
        if (!input.value.trim()) { input.value = "Fix these errors from Studio's Output:\n" + errs.slice(0, 6).map((e) => "- " + e).join("\n"); grow(); }
      }
    }
    watchLast = out;
  } catch { /* Studio busy or playing - try again next round */ }
  finally { watchBusy = false; }
}
setInterval(watchOutput, 30000);

// ── automatic place backups ─────────────────────────────────────────────────
$("set-autobk").checked = lsGet("vs-autobk") === "on";
$("set-autobk").addEventListener("change", (e) => lsSet("vs-autobk", e.target.checked ? "on" : "off"));
setInterval(async () => {
  if (lsGet("vs-autobk") !== "on" || !S.state.connected || S.state.studio !== true) return;
  try {
    const r = await invoke("bridge_request", { payload: { type: "backup_place" }, timeoutMs: 60000 });
    if (r && r.ok) lsSet("vs-autobk-at", String(Date.now()));
  } catch {}
}, 15 * 60 * 1000);

// ── shortcuts: Up edits your last message, Ctrl+M picks a model ─────────────
input.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowUp" || input.value || chat.busy || e.shiftKey) return;
  const edits = body.querySelectorAll('.msg.user .msg-acts [data-a="edit"]');
  if (edits.length) { e.preventDefault(); edits[edits.length - 1].click(); }
});
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "m") { e.preventDefault(); go("chat"); $("chat-model").click(); }
});
KEYS.splice(KEYS.length - 1, 0, [["Ctrl", "M"], "Change the AI model"], [["↑"], "Edit your last message (empty chat box)"]);

// ── achievements: little milestones as you build ────────────────────────────
const ACHIEVEMENTS = [
  ["first-chat", "First words", "Send your first message", () => (stats.messages || 0) >= 1],
  ["chatty", "Chatterbox", "Send 100 messages", () => (stats.messages || 0) >= 100],
  ["builder", "Model maker", "Generate your first model", () => (stats.models || 0) >= 1],
  ["sculptor", "Sculptor", "Generate 25 models", () => (stats.models || 0) >= 25],
  ["designer", "Designer", "Build your first UI", () => (stats.uis || 0) >= 1],
  ["systems", "Plug and play", "Add a system from the Script library", () => (stats.systems || 0) >= 1],
  ["agent", "Hands-free", "Pass an Agent playtest", () => (stats.playtests || 0) >= 1],
  ["saver", "Never ran out", "Get saved by a provider fallback", () => (stats.fallbacks || 0) >= 1],
  ["librarian", "Librarian", "Keep 10 chats", () => chats.length >= 10],
  ["night", "Night owl", "Build after midnight", () => (stats.night || 0) >= 1],
];
let gotAch = [];
try { gotAch = JSON.parse(lsGet("vs-ach") || "[]"); } catch {}
function checkAchievements(quiet) {
  for (const [id, name, , test] of ACHIEVEMENTS) {
    if (gotAch.includes(id)) continue;
    let ok = false;
    try { ok = test(); } catch {}
    if (!ok) continue;
    gotAch.push(id);
    lsSet("vs-ach", JSON.stringify(gotAch));
    if (!quiet) { toast(`Achievement unlocked: ${name}`, 4000); sfx("done"); notify("ok", "Achievement unlocked", name); }
  }
  renderAchievements();
}
function renderAchievements() {
  let box = $("home-ach");
  if (!box) {
    box = document.createElement("div");
    box.id = "home-ach";
    box.className = "ach";
    $("home-stats").after(box);
  }
  box.innerHTML = ACHIEVEMENTS.map(([id, name, desc]) => `<span class="${gotAch.includes(id) ? "got" : ""}" title="${esc(desc)}">${ICONS.star}${esc(name)}</span>`).join("");
}
const baseBump = bumpStat;
bumpStat = function (k, n) {
  baseBump(k, n);
  const h = new Date().getHours();
  if (k === "messages" && h < 4 && !(stats.night)) baseBump("night");
  checkAchievements();
};
checkAchievements(true);

// ── @mentions: type @ and a name to point the AI at something in your game ──
let mentionList = [], mentionSel = 0, mentionTimer = 0, mentionTok = null;
function mentionToken() {
  const before = input.value.slice(0, input.selectionStart);
  const m = before.match(/(^|\s)@([\w.]{1,40})$/);
  return m ? { q: m[2], start: before.length - m[2].length - 1 } : null;
}
function hideMention() { const pop = $("slash-pop"); if (pop.dataset.mode === "mention") { pop.hidden = true; pop.dataset.mode = ""; } mentionList = []; }
function renderMention() {
  const pop = $("slash-pop");
  if (!mentionList.length) { hideMention(); return; }
  pop.dataset.mode = "mention";
  pop.innerHTML = mentionList.map((r, i) => `<button class="sl-item${i === mentionSel ? " hl" : ""}" data-m="${i}"><b>@${esc(r.n)}</b><span>${esc(r.c)} · ${esc(r.f)}</span></button>`).join("");
  pop.hidden = false;
}
async function lookupMention(q) {
  if (!S.state.connected || S.state.studio !== true) return [];
  const code = `local HS = game:GetService("HttpService")
local q = string.lower(HS:JSONDecode([==[${JSON.stringify(q)}]==]))
local hits, more = {}, {}
for _, svc in { "Workspace", "ReplicatedStorage", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPlayer", "StarterPack", "Lighting", "ReplicatedFirst" } do
	local ok, s = pcall(game.GetService, game, svc)
	if ok then
		for _, d in s:GetDescendants() do
			local n = string.lower(d.Name)
			if string.sub(n, 1, #q) == q then table.insert(hits, { n = d.Name, c = d.ClassName, f = d:GetFullName() })
			elseif #more < 8 and string.find(n, q, 1, true) then table.insert(more, { n = d.Name, c = d.ClassName, f = d:GetFullName() }) end
			if #hits >= 8 then return HS:JSONEncode(hits) end
		end
	end
end
for _, m in more do if #hits < 8 then table.insert(hits, m) end end
return HS:JSONEncode(hits)`;
  const out = await callTool("execute_luau", { code, datamodel_type: "Edit" }, 15000);
  const s = String(out).slice(String(out).indexOf("["));
  return JSON.parse(s);
}
input.addEventListener("input", () => {
  clearTimeout(mentionTimer);
  mentionTok = mentionToken();
  if (!mentionTok) { hideMention(); return; }
  mentionTimer = setTimeout(async () => {
    const tok = mentionTok;
    try { const list = await lookupMention(tok.q); if (mentionTok === tok) { mentionList = list; mentionSel = 0; renderMention(); } } catch { hideMention(); }
  }, 250);
});
function pickMention(i) {
  const r = mentionList[i], tok = mentionToken();
  if (!r || !tok) return hideMention();
  const before = input.value.slice(0, tok.start), after = input.value.slice(input.selectionStart);
  input.value = before + "`" + r.f + "` " + after;
  const pos = (before + "`" + r.f + "` ").length;
  input.setSelectionRange(pos, pos);
  hideMention(); grow(); input.focus();
}
input.addEventListener("keydown", (e) => {
  if ($("slash-pop").dataset.mode !== "mention" || $("slash-pop").hidden) return;
  if (e.key === "ArrowDown") { e.preventDefault(); mentionSel = (mentionSel + 1) % mentionList.length; renderMention(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); mentionSel = (mentionSel - 1 + mentionList.length) % mentionList.length; renderMention(); }
  else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); pickMention(mentionSel); }
  else if (e.key === "Escape") { e.stopPropagation(); hideMention(); }
}, true);
$("slash-pop").addEventListener("mousedown", (e) => { const b = e.target.closest("[data-m]"); if (b) { e.preventDefault(); pickMention(Number(b.dataset.m)); } });

// ── attach what's selected in Studio ────────────────────────────────────────
const selBtn = document.createElement("button");
selBtn.className = "ibtn";
selBtn.title = "Attach what you've selected in Studio (and the code of selected scripts)";
selBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 3.5 18 12l-5.5 1.3L9.6 18.5z"/><path d="M4 18.5h1M4 21h4"/></svg>';
$("btn-enhance-chat").after(selBtn);
selBtn.onclick = async () => {
  if (!S.state.connected || S.state.studio !== true) { toast("Open Roblox Studio with the bridge running first."); return; }
  try {
    const out = await callTool("execute_luau", { datamodel_type: "Edit", code: `local HS = game:GetService("HttpService")
local out = {}
for i, s in game:GetService("Selection"):Get() do
	if i > 6 then break end
	local d = { f = s:GetFullName(), c = s.ClassName }
	if s:IsA("LuaSourceContainer") then d.src = string.sub(s.Source, 1, 40000) end
	local props = {}
	for _, p in { "Size", "Position", "Color", "Material", "Anchored", "Transparency", "Text" } do
		local ok, v = pcall(function() return s[p] end)
		if ok and v ~= nil and typeof(v) ~= "Instance" then table.insert(props, p .. " = " .. tostring(v)) end
	end
	d.p = table.concat(props, ", ")
	d.k = #s:GetChildren()
	table.insert(out, d)
end
return HS:JSONEncode(out)` }, 20000);
    const list = JSON.parse(String(out).slice(String(out).indexOf("[")));
    if (!list.length) { toast("Nothing is selected in Studio. Click something in its Explorer first."); return; }
    for (const d of list) {
      const content = `${d.c} at ${d.f}${d.p ? `\n${d.p}` : ""}${d.k ? `\n(${d.k} children)` : ""}${d.src != null ? `\n\nSource:\n${d.src}` : ""}`;
      if (!attachments.some((a) => a.path === d.f)) attachments.push({ name: d.f.split(".").pop(), path: d.f, size: content.length, content });
    }
    renderAttachments();
    toast(`Attached ${list.length} selected thing${list.length === 1 ? "" : "s"} from Studio.`);
    input.focus();
  } catch (e) { toast(errText(e)); }
};

// ── corner roundness (Settings > Appearance) ────────────────────────────────
function setRadius(v) {
  v = Math.max(0, Math.min(24, Number(v)));
  document.documentElement.style.setProperty("--rad", v + "px");
  $("set-radius").value = String(v);
  $("radius-val").textContent = v === 12 ? "(default)" : v + "px";
  lsSet("vs-radius", String(v));
}
$("set-radius").addEventListener("input", (e) => setRadius(e.target.value));
$("btn-radius-reset").onclick = () => setRadius(12);
setRadius(lsGet("vs-radius") == null ? 12 : Number(lsGet("vs-radius")));
