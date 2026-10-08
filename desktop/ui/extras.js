// SPDX-License-Identifier: GPL-3.0-or-later
// extras.js - 7.1 quality of life: stacked toasts with Undo, a setup checklist,
// recent models, favourite templates, a chat right-click menu, pasting reference
// pictures, tidying old chats, and editing properties in the Explorer.
"use strict";

// ── toasts that stack, and can carry an action (Undo, Open…) ───────────────
const toastBox = document.createElement("div");
toastBox.id = "toasts";
document.body.appendChild(toastBox);
toast = function (msg, ms = 2800, action) {
  const t = document.createElement("div");
  t.className = "toast2";
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement("button");
    b.textContent = action.label;
    b.onclick = () => { action.run(); close(); };
    t.appendChild(b);
  }
  const close = () => { t.classList.add("out"); setTimeout(() => t.remove(), 180); };
  t.addEventListener("click", (e) => { if (!e.target.closest("button")) close(); });
  toastBox.appendChild(t);
  while (toastBox.children.length > 4) toastBox.firstChild.remove();
  setTimeout(close, action ? Math.max(ms, 6000) : ms);
};

// ── deleting a chat can be undone ───────────────────────────────────────────
const baseDeleteChat = deleteChat;
deleteChat = function (id) {
  const i = chats.findIndex((c) => c.id === id);
  const rec = chats[i];
  baseDeleteChat(id);
  if (rec && !chats.some((c) => c.id === id)) {
    toast(`Deleted "${(rec.title || "chat").slice(0, 40)}"`, 6000, { label: "Undo", run: () => { chats.splice(Math.min(i, chats.length), 0, rec); persistChats(); } });
  }
};

// ── chat list: right-click menu ─────────────────────────────────────────────
const ctx = document.createElement("div");
ctx.className = "ctx-menu";
ctx.hidden = true;
document.body.appendChild(ctx);
const hideCtx = () => { ctx.hidden = true; };
document.addEventListener("click", hideCtx);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideCtx(); });
window.addEventListener("blur", hideCtx);
function showCtx(x, y, items) {
  ctx.innerHTML = items.map((it, i) => it === "-" ? '<i class="ctx-sep"></i>' : `<button data-i="${i}" class="${it.danger ? "danger" : ""}">${it.icon || ""}${esc(it.label)}</button>`).join("");
  ctx.hidden = false;
  const z = Number(document.documentElement.style.zoom) || 1;
  const w = ctx.offsetWidth, h = ctx.offsetHeight;
  ctx.style.left = Math.min(x / z, window.innerWidth / z - w - 8) + "px";
  ctx.style.top = Math.min(y / z, window.innerHeight / z - h - 8) + "px";
  ctx.onclick = (e) => { const b = e.target.closest("[data-i]"); if (b) { hideCtx(); items[Number(b.dataset.i)].run(); } };
}
$("chats-list").addEventListener("contextmenu", (e) => {
  const item = e.target.closest(".cl-item");
  if (!item) return;
  e.preventDefault();
  const id = item.dataset.id, rec = chats.find((c) => c.id === id);
  if (!rec) return;
  const act = (a) => () => { const b = item.querySelector(`[data-a="${a}"]`); if (b) b.click(); };
  showCtx(e.clientX, e.clientY, [
    { label: "Open", icon: ICONS.chat, run: () => openChat(id) },
    { label: "Rename", icon: ICONS.edit, run: act("ren") },
    { label: rec.pinned ? "Unpin" : "Pin to top", icon: ICONS.pin, run: act("pin") },
    { label: "Duplicate", icon: ICONS.copy, run: () => { chats.push(Object.assign({}, rec, { id: newId(), title: rec.title + " (copy)", t: Date.now(), pinned: false })); persistChats(); } },
    { label: "Save as Markdown", icon: ICONS.go, run: () => { openChat(id); setTimeout(exportChat, 50); } },
    "-",
    { label: "Delete", icon: ICONS.trash, danger: true, run: () => deleteChat(id) },
  ]);
});

// ── recent models at the top of the model menu ──────────────────────────────
let recentModels = [];
try { recentModels = JSON.parse(lsGet("vs-recent-models") || "[]"); } catch {}
const baseSaveSettings = saveSettings;
saveSettings = async function (patch, msg) {
  const r = await baseSaveSettings(patch, msg);
  const p = patch && patch.provider;
  if (p && patch[p + "_model"]) {
    const id = patch[p + "_model"];
    recentModels = [{ p, id }].concat(recentModels.filter((m) => !(m.p === p && m.id === id))).slice(0, 5);
    lsSet("vs-recent-models", JSON.stringify(recentModels));
  }
  return r;
};
const baseRenderPop = renderPop;
renderPop = function () {
  baseRenderPop();
  if ($("pop-search").value.trim()) return;
  const others = recentModels.filter((m) => !(m.p === prov() && m.id === curModel()) && PROV_NAME[m.p]);
  if (!others.length) return;
  const box = document.createElement("div");
  box.className = "pop-recent-box";
  box.innerHTML = `<div class="pop-recent-h">Recent</div>` + others.map((m, i) =>
    `<button class="pop-recent" data-r="${i}"><span class="id">${esc(m.id)}</span><span class="tl no">${esc(PROV_NAME[m.p])}</span></button>`).join("");
  box.onclick = async (e) => {
    const b = e.target.closest("[data-r]");
    if (!b) return;
    const m = others[Number(b.dataset.r)];
    closePop();
    await saveSettings({ provider: m.p, [m.p + "_model"]: m.id }, `Now using ${PROV_NAME[m.p]} · ${m.id}`);
  };
  $("pop-list").prepend(box);
};

// ── favourite templates (star them; they come first, in the palette too) ────
let favTpl = [];
try { favTpl = JSON.parse(lsGet("vs-fav-tpl") || "[]"); } catch {}
function renderTemplates() {
  const list = VSKit.TEMPLATES.slice().sort((a, b) => (favTpl.includes(b.id) ? 1 : 0) - (favTpl.includes(a.id) ? 1 : 0));
  $("kit-templates").innerHTML = list.map((t) => `<button class="kit-card${favTpl.includes(t.id) ? " fav" : ""}" data-id="${t.id}"><span class="ki">${t.icon}</span><b>${esc(t.name)}</b><span>${esc(t.desc)}</span><span class="kit-fav" data-fav="${t.id}" title="${favTpl.includes(t.id) ? "Unfavourite" : "Favourite"}">${ICONS.star}</span></button>`).join("");
}
$("kit-templates").addEventListener("click", (e) => {
  const f = e.target.closest("[data-fav]");
  if (!f) return;
  e.stopPropagation();
  const id = f.dataset.fav;
  favTpl = favTpl.includes(id) ? favTpl.filter((x) => x !== id) : [id].concat(favTpl);
  lsSet("vs-fav-tpl", JSON.stringify(favTpl));
  renderTemplates();
}, true);
renderTemplates();
const favBasePalette = paletteItems;
paletteItems = function () {
  const items = favBasePalette();
  const favs = VSKit.TEMPLATES.filter((t) => favTpl.includes(t.id)).map((t) => ({ g: "Favourites", t: t.name, d: t.desc, i: t.icon, run: () => runBrief(t) }));
  const at = items.findIndex((x) => x.g === "Templates");
  items.splice(at < 0 ? items.length : at, 0, ...favs);
  return items;
};

// ── setup checklist on Home, until everything's done ────────────────────────
const SETUP = [
  ["bridge", "Start the bridge", () => !!S.state.connected, () => $("btn-bridge-toggle").click()],
  ["studio", "Connect Roblox Studio", () => S.state.studio === true, () => toast("In Studio: Assistant settings → turn on Studio as MCP server.", 6000)],
  ["key", "Add a free AI key", () => keySet(), () => { go("settings"); $("set-key").focus(); }],
  ["chat", "Ask for your first build", () => (stats.messages || 0) > 0, () => newChat()],
];
const setupBox = document.createElement("div");
setupBox.className = "card setup";
document.querySelector("#view-home .cards").before(setupBox);
function renderSetup() {
  const done = SETUP.map(([, , test]) => { try { return !!test(); } catch { return false; } });
  const n = done.filter(Boolean).length;
  setupBox.hidden = n === SETUP.length || lsGet("vs-setup-hide") === "1";
  if (setupBox.hidden) return;
  setupBox.innerHTML = `<div class="card-t">Get set up <span class="tag">${n} of ${SETUP.length}</span><button class="link" data-hide style="margin-left:8px">Hide</button></div>
    <div class="setup-bar"><i style="width:${(n / SETUP.length) * 100}%"></i></div>
    <div class="setup-list">${SETUP.map(([id, label], i) => `<button class="setup-i${done[i] ? " done" : ""}" data-s="${i}"><span class="setup-c">${done[i] ? '<svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-8"/></svg>' : i + 1}</span>${esc(label)}</button>`).join("")}</div>`;
}
setupBox.addEventListener("click", (e) => {
  if (e.target.closest("[data-hide]")) { lsSet("vs-setup-hide", "1"); renderSetup(); return; }
  const b = e.target.closest("[data-s]");
  if (b && !b.classList.contains("done")) SETUP[Number(b.dataset.s)][3]();
});
const setupBaseRender = render;
render = function () { setupBaseRender(); renderSetup(); };
renderSetup();
setInterval(renderSetup, 5000);

// ── keep the chat list tidy (Settings → Your data) ───────────────────────────
const tidyRow = document.createElement("div");
tidyRow.className = "field";
tidyRow.innerHTML = `<label>Keep chats</label><div class="seg" id="tidy-seg"><button data-d="0">Forever</button><button data-d="90">90 days</button><button data-d="30">30 days</button></div><div class="hint">Pinned chats are always kept.</div>`;
$("btn-data-export").closest(".row").before(tidyRow);
function tidyChats() {
  const days = Number(lsGet("vs-keep-days") || 0);
  $("tidy-seg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", Number(b.dataset.d) === days));
  if (!days) return;
  const cut = Date.now() - days * 86400000;
  const before = chats.length;
  chats = chats.filter((c) => c.pinned || c.t >= cut || c.id === chat.id);
  if (chats.length !== before) persistChats();
}
$("tidy-seg").addEventListener("click", (e) => { const b = e.target.closest("[data-d]"); if (b) { lsSet("vs-keep-days", b.dataset.d); tidyChats(); } });
tidyChats();

// ── paste a picture straight into the Models / UI builder reference ────────
document.addEventListener("paste", (e) => {
  const view = $("view-models").classList.contains("active") ? "mg" : $("view-uib").classList.contains("active") ? "ub" : null;
  if (!view || (e.target.closest && e.target.closest("textarea, input"))) return;
  const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => /^image\//.test(x.type));
  if (!f) return;
  e.preventDefault();
  const input = $(view + "-ref-file");
  const dt = new DataTransfer();
  dt.items.add(f);
  input.files = dt.files;
  input.dispatchEvent(new Event("change"));
  toast("Reference picture added.");
});

// ── closing mid-build asks first ────────────────────────────────────────────
$("win-close").onclick = async () => {
  if ((chat.busy || gen.busy) && !(await approve("quit", "Still working", "Close VoidScript now?", "The AI is still working. Closing now stops it partway - Ctrl+Z in Studio undoes what it already changed.", { once: true }))) return;
  appWin.close();
};

// ── the "working" bubble counts up, so a slow model never looks frozen ─────
const baseLiveStart = liveStart;
liveStart = function (label) {
  const el = baseLiveStart(label);
  const t0 = Date.now();
  const timer = setInterval(() => {
    if (!el.isConnected) { clearInterval(timer); return; }
    const s = Math.round((Date.now() - t0) / 1000);
    const bub = el.querySelector(".typing");
    if (!bub || s < 3) return;
    let tag = bub.querySelector(".tw-t");
    if (!tag) { tag = document.createElement("em"); tag.className = "tw-t"; bub.appendChild(tag); }
    tag.textContent = s < 60 ? s + "s" : Math.floor(s / 60) + "m " + (s % 60) + "s";
  }, 1000);
  return el;
};

// ── pick up where you left off ──────────────────────────────────────────────
// The last chat you had open comes back when the app starts.
const qolBaseOpen = openChat;
openChat = function (id) { qolBaseOpen(id); lsSet("vs-last-chat", id); };
const qolBaseNew = newChat;
newChat = function () { qolBaseNew(); lsSet("vs-last-chat", ""); };
{
  const last = lsGet("vs-last-chat");
  if (last && chats.some((c) => c.id === last) && !chat.messages.length) setTimeout(() => {
    const view = document.querySelector(".view.active");
    qolBaseOpen(last);
    if (view && view.id !== "view-chat") go(view.id.replace("view-", "")); // reopen quietly, stay on the page you were on
  }, 0);
}

// ── the chat's name in the header (double-click to rename) ─────────────────
const chatName = document.createElement("span");
chatName.className = "chat-name";
chatName.title = "Double-click to rename";
document.querySelector(".chat-title").appendChild(chatName);
const showChatName = () => {
  chatName.textContent = chat.title || ""; chatName.hidden = !chat.title;
  if (chat.id && lsGet("vs-last-chat") !== chat.id) lsSet("vs-last-chat", chat.id); // a new chat counts too, once saved
};
setInterval(showChatName, 800);
chatName.addEventListener("dblclick", () => {
  const rec = chats.find((c) => c.id === chat.id);
  if (!rec) return;
  chatName.innerHTML = `<input class="input" value="${esc(rec.title)}" maxlength="80" />`;
  const inp = chatName.querySelector("input");
  inp.focus(); inp.select();
  const done = (keep) => { if (keep && inp.value.trim()) { rec.title = chat.title = inp.value.trim(); rec.renamed = true; persistChats(); } showChatName(); };
  inp.onkeydown = (e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); };
  inp.onblur = () => done(true);
});

// ── just start typing: keys go to the chat box when nothing else has focus ──
document.addEventListener("keydown", (e) => {
  if (!$("view-chat").classList.contains("active") || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
  const a = document.activeElement;
  if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
  if (!$("palette").hidden || document.querySelector(".modal-wrap:not([hidden])")) return;
  input.focus();
});

// ── Ctrl+Shift+C copies the AI's last answer ────────────────────────────────
document.addEventListener("keydown", async (e) => {
  if (!((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c")) return;
  const last = chat.messages.slice().reverse().find((m) => m.role === "assistant" && m.content);
  if (!last) return;
  e.preventDefault();
  try { await navigator.clipboard.writeText(last.content); toast("Copied the last answer."); } catch { toast("Couldn't copy."); }
});

// ── long messages you sent fold up, with Show more ──────────────────────────
new MutationObserver((ms) => {
  for (const m of ms) m.addedNodes.forEach((n) => {
    if (!n.classList || !n.classList.contains("user")) return;
    const b = n.querySelector(".bubble");
    if (!b || b.textContent.split("\n").length < 12) return;
    b.classList.add("folded");
    const more = document.createElement("button");
    more.className = "link fold-btn";
    more.textContent = "Show more";
    more.onclick = () => { const f = b.classList.toggle("folded"); more.textContent = f ? "Show more" : "Show less"; };
    b.after(more);
  });
}).observe(body, { childList: true });

// ── code blocks: wrap long lines (remembered) ───────────────────────────────
document.documentElement.classList.toggle("code-wrap", lsGet("vs-code-wrap") === "on");
document.addEventListener("click", (e) => {
  const h = e.target.closest(".code-h");
  if (!h || e.target.closest(".cb")) return;
  const on = !document.documentElement.classList.contains("code-wrap");
  document.documentElement.classList.toggle("code-wrap", on);
  lsSet("vs-code-wrap", on ? "on" : "off");
  toast(on ? "Long code lines wrap now." : "Long code lines scroll now.");
});
new MutationObserver(() => {
  body.querySelectorAll(".code-h:not([title])").forEach((h) => { h.title = "Click to switch line wrapping"; });
}).observe(body, { childList: true, subtree: true });

// ── dates on hover in the chat list ─────────────────────────────────────────
new MutationObserver(() => {
  $("chats-list").querySelectorAll(".cl-item:not([title])").forEach((el) => {
    const c = chats.find((x) => x.id === el.dataset.id);
    if (c) el.title = `${c.title}\n${new Date(c.t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · ${c.messages.filter((m) => m.role === "user").length} messages`;
  });
}).observe($("chats-list"), { childList: true });

// ── reset the look and layout (keeps chats, keys and saved work) ───────────
const resetBtn = document.createElement("button");
resetBtn.className = "btn sm ghost";
resetBtn.textContent = "Reset look & layout";
$("btn-chats-wipe").after(resetBtn);
resetBtn.onclick = async () => {
  if (!(await approve("reset", "Reset", "Reset the look and layout?", "Accent, corners, zoom, density, text size, panels and tips go back to how they started. Chats, keys, saved models and UIs stay.", { once: true }))) return;
  for (const k of ["vs-accent", "vs-radius", "vs-zoom", "vs-density", "vs-fs", "vs-chatlist", "vs-code-wrap", "vs-setup-hide", "vs-last-view", "vs-theme"]) { try { localStorage.removeItem(k); } catch {} }
  location.reload();
};
KEYS.splice(KEYS.length - 1, 0, [["Ctrl", "Shift", "C"], "Copy the AI's last answer"]);
