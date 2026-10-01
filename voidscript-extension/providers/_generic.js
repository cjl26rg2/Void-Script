// SPDX-License-Identifier: GPL-3.0-or-later
// providers/_generic.js - a selector-driven, provider-agnostic adapter factory.
//
// The hand-written providers (deepseek.js, gemini.js, kimi.js, glm.js, qwen.js,
// arena.js, meta.js) each reverse-engineer ONE AI site's live DOM. That is the
// gold standard and should always be preferred once a site is validated.
//
// This factory exists so a NEW site can be brought up quickly with just a config
// object of CSS selectors instead of a full 40-method rewrite. It implements the
// entire VSProvider interface the core (core/main.js) expects, using sensible,
// framework-neutral defaults:
//   - turn reading via user/assistant item selectors
//   - text extraction that strips the reasoning subtree + our own chip
//   - a composer that supports BOTH a real <textarea>/<input> and a
//     contenteditable (ProseMirror / Quill / Lexical) editor
//   - generation detection via a stop-button selector AND/OR stream quiescence
//   - best-effort image attachment through a mounted <input type=file>
//
// Because these defaults are generic, providers built on top of this factory are
// BETA: they load and drive the site, but streaming/completion timing and the
// send handshake may need per-site tuning. Each beta provider file documents the
// selectors it guesses and what to verify live. Promote a beta provider to a
// full hand-written one (its own providers/<name>.js) once its DOM is validated.
//
// Usage (in a provider file, after core/config.js + core/parser.js are loaded):
//   const VSProvider = VSGeneric({ id, displayName, selectors: {...}, ... });
//
// eslint-disable-next-line no-unused-vars
function VSGeneric(cfg) {
  "use strict";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let diag = () => {}; // injected by core via init()

  const beta = cfg.beta !== false; // default true for factory-built providers

  // ── Selector config (per-site) ────────────────────────────────────────────
  const S = Object.assign(
    {
      userItem: '[data-message-author-role="user"]',
      assistantItem: '[data-message-author-role="assistant"]',
      thinking: '[data-thinking],[class*="reasoning"],[class*="thinking"]',
      editor: "textarea",
      composer: "form",
      sendBtn: 'button[type="submit"]',
      // A dedicated stop/abort control shown WHILE generating. Leave "" if the
      // site has none - detection then falls back to stream-growth quiescence.
      stopBtn: 'button[aria-label*="Stop" i],button[data-testid*="stop" i]',
      codeWrap: "pre",
      errorSurfaces: '[role="alert"],[class*="toast"],[class*="error"]',
      // Optional: a sent-image attachment card inside a user turn to strip out.
      attachment: "",
    },
    cfg.selectors || {}
  );
  S.anyItem = S.anyItem || `${S.userItem}, ${S.assistantItem}`;

  const RE = {
    contextLimit: new RegExp(
      [
        "conversation.{0,20}(too long|trop long)",
        "context.{0,20}(limit|exceeded|window)",
        "please.{0,30}start.{0,20}(a )?new.{0,20}(chat|conversation)",
        "(token|context).{0,10}limit",
        "maximum.{0,20}context",
        "message limit",
        // Localised site notices (it / es / pt / de / fr) - phrase-level on purpose.
        "conversazione.{0,20}troppo lunga", "limite.{0,12}(di )?(contesto|messaggi|token)",
        "conversaci[oó]n.{0,20}demasiado larga", "l[ií]mite de (contexto|mensajes|tokens)",
        "conversa.{0,20}muito longa", "limite de (contexto|mensagens|tokens)",
        "unterhaltung.{0,20}zu lang", "(kontext|nachrichten|token).{0,6}limit",
        "limite de (contexte|messages)",
      ].join("|"),
      "i"
    ),
    tooLong: /conversation .{0,20}(too long|getting too long)|conversazione.{0,20}troppo lunga|conversaci[oó]n.{0,20}demasiado larga|conversa.{0,20}muito longa|unterhaltung.{0,20}zu lang/i,
    busy: /something went wrong|try again later|temporarily unavailable|rate limit|too many requests|at capacity/i,
  };

  // Generic timing profile. Sites with a reliable stop button can run tighter,
  // but these defaults are deliberately forgiving so a slow first token or a
  // reasoning pause is not mistaken for completion. Override via cfg.timings.
  const timings = Object.assign(
    {
      GEN_IDLE_MS: 2500,
      REASON_IDLE_MS: 15000,
      WARMUP_MS: 60000,
      REASON_NOREPLY_MS: 120000,
      STABLE_MS: 10000,
      RESPONSE_TIMEOUT_MS: 300000,
    },
    cfg.timings || {}
  );

  // ── Turn classification ───────────────────────────────────────────────────
  const isUserItem = (item) => !!(item && item.matches && item.matches(S.userItem));
  const isAssistantItem = (item) => !!(item && item.matches && item.matches(S.assistantItem));

  // Walk an element's text, skipping the reasoning subtree, our own chip, and any
  // excluded selector, so tool blocks drafted inside reasoning are never run.
  function textWithout(root, excludeSel) {
    if (!root) return "";
    const skipParts = [S.thinking, ".vs-chip"];
    if (S.attachment) skipParts.push(S.attachment);
    if (excludeSel) skipParts.push(excludeSel);
    const skip = skipParts.filter(Boolean).join(", ");
    let t = "";
    const walk = (n) => {
      if (n.nodeType === 3) { t += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      if (skip && n.matches && n.matches(skip)) return;
      // Multi-line code editors (CodeMirror / Monaco) render each line as a
      // separate element with no newline text node, collapsing code onto one
      // line. Rebuild real source by joining line elements with "\n".
      if (n.matches && n.matches(".cm-content, .cm-editor, .view-lines")) {
        const lines = n.querySelectorAll(".cm-line, .view-line");
        if (lines.length) { t += "\n" + [...lines].map((l) => l.textContent).join("\n"); return; }
      }
      for (const c of n.childNodes) walk(c);
    };
    walk(root);
    return t;
  }

  const itemText = (item) => textWithout(item);
  const classifyText = (item, excludeSel) => textWithout(item, excludeSel);

  // ── DOM primitives ────────────────────────────────────────────────────────
  const allItems = () => [...document.querySelectorAll(S.anyItem)];
  const assistantItems = () => [...document.querySelectorAll(S.assistantItem)];
  const assistantCount = () => assistantItems().length;
  const userCount = () => document.querySelectorAll(S.userItem).length;

  // Scope to the SITE's composer only: skip VoidScript's own injected UI so our
  // settings textarea never defeats the "not on a chat page" guard.
  const getEditor = () => {
    for (const e of document.querySelectorAll(S.editor)) {
      if (!e.closest("#vs-root")) return e;
    }
    return null;
  };
  const isTextField = (el) =>
    !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT");
  const editorText = () => {
    const e = getEditor();
    if (!e) return "";
    if (isTextField(e)) return e.value || "";
    return e.textContent || "";
  };

  const lastAssistant = () => {
    const it = assistantItems();
    return it.length ? it[it.length - 1] : null;
  };

  const chatIsEmpty = () => allItems().length === 0;
  const isFreshChat = () => chatIsEmpty() && !!getEditor();

  // A provider may set composer: "" (e.g. Arena Agent has a contenteditable
  // composer with no <form>), so guard every closest/querySelector on it -
  // an empty selector throws a SyntaxError and would break send/stop detection.
  const composerFrame = () => {
    const ed = getEditor();
    const host = ed ? (S.composer && ed.closest(S.composer)) || ed.closest("form, .relative") : null;
    return host || (S.composer ? document.querySelector(S.composer) : null);
  };

  // The rounded composer card the core's bar can hug (best effort).
  // Same walk-up as the hand-tuned providers (Arena Direct / Meta / GLM): climb
  // from the editor to the first ancestor carrying ANY rounded-* class. The old
  // selector list only matched the literal `rounded-xl/2xl/3xl` substrings, so a
  // card using `rounded-lg` or an arbitrary `rounded-[…]` value fell all the way
  // through to the editor's tiny parent - which mis-placed the bar (seen on
  // Arena Agent, where the composer is a contenteditable with no <form>).
  function barAnchor() {
    const ed = getEditor();
    if (!ed) return null;
    let n = ed;
    for (let i = 0; i < 10 && n; i++) {
      if ([...n.classList].some((c) => c.startsWith("rounded"))) return n;
      n = n.parentElement;
    }
    return ed.closest("form") || ed.parentElement || null;
  }

  // Where the core inserts its in-flow status bar, DeepSeek-style: mount it INSIDE
  // the composer box (the lowest ancestor of the editor that also holds the send
  // button) as the FIRST child, so it reads as ONE unit with the chat input on
  // every generic site - the same connected look the hand-tuned DeepSeek provider
  // gives. Prefer a rounded-* container (the visible composer card) when the climb
  // passes one. If nothing clean resolves, returns null and the core falls back to
  // anchored mode (still hugging the composer), never the detached floating pill.
  function barMount() {
    const ed = getEditor();
    if (!ed) return null;
    // Only inside-mount into a STABLE, plain composer (a real <textarea>/<input>).
    // Rich contenteditable composers (ProseMirror/Lexical on ChatGPT, Claude, Grok,
    // etc.) are aggressively reconciled by their framework - inserting our node into
    // their subtree starts a re-render fight that can peg the CPU and crash the tab -
    // so those return null and the core uses anchored mode (hugs the composer top at
    // full width WITHOUT touching the framework's DOM). The core also has a runtime
    // thrash guard that falls back to anchored if any inside-mount still fights.
    if (!isTextField(ed)) return null;
    // Server-rendered React apps (ChatGPT's newer layout) crash outright - blank page -
    // when hydration meets a node they didn't render, even in a plain <textarea> form.
    if (cfg.inlineBar === false) return null;
    const send = sendButton();
    let box = ed.parentElement;
    let rounded = null;
    for (let i = 0; i < 12 && box && box !== document.body; i++) {
      if (!rounded && [...box.classList].some((c) => c.startsWith("rounded"))) rounded = box;
      if (send && box.contains(send) && box.contains(ed)) break;
      box = box.parentElement;
    }
    // Prefer the send-holding box; else the first rounded card; else the editor's parent.
    if (!box || box === document.body) box = rounded || ed.parentElement;
    if (!box || box === document.body) return null;
    // Skip our own bar when computing the insertion point so we don't try to insert
    // the bar before itself every frame.
    let before = box.firstElementChild;
    if (before && before.id === "vs-bar") before = before.nextElementSibling;
    return { parent: box, before, inside: true }; // lives INSIDE the composer box
  }

  // ── Input lock ────────────────────────────────────────────────────────────
  function setInputLock(on) {
    const ed = getEditor();
    if (!ed) return;
    if (isTextField(ed)) {
      if (on) {
        if (!ed.dataset.vsPlaceholder) ed.dataset.vsPlaceholder = ed.getAttribute("placeholder") || "";
        ed.setAttribute("readonly", "");
        ed.setAttribute("placeholder", "⏳ Agent working… please wait");
      } else {
        ed.removeAttribute("readonly");
        if (ed.dataset.vsPlaceholder != null) ed.setAttribute("placeholder", ed.dataset.vsPlaceholder);
      }
    } else {
      // contenteditable: toggling contenteditable=false would block our own
      // execCommand injection, so only flag it visually via a data attribute the
      // overlay CSS can style. typeAndSend re-enables as needed.
      if (on) ed.setAttribute("data-vs-locked", "1");
      else ed.removeAttribute("data-vs-locked");
    }
  }

  // ── Send / stop buttons ───────────────────────────────────────────────────
  // Sites keep dropping their data-testid hooks, and every aria-label is localised
  // ("Send message" is "Invia messaggio" in Italian), so a configured selector on
  // its own breaks for anyone not browsing in English. When it misses, fall back to
  // language-neutral signals scoped to the composer: a submit button that isn't a
  // stop control, then a multilingual aria-label match.
  const SEND_ARIA_RE = /\b(send|submit)\b|invia|envia|envoy|senden|abschick|verstuur|wyślij|gönder|отправ|发送|傳送|送信|전송|إرسال/i;
  const STOP_ARIA_RE = /\bstop\b|interromp|deten|arrêt|anhalt|stopp|parar|zatrzym|durdur|останов|停止|中止|정지|إيقاف/i;
  const ariaOf = (b) => b.getAttribute("aria-label") || b.getAttribute("title") || "";
  function composerButtons() {
    const c = composerFrame();
    return c ? [...c.querySelectorAll("button")].filter((b) => b.offsetParent !== null && !b.closest("#vs-root, #vs-bar")) : [];
  }
  const sendButton = () => {
    const c = composerFrame();
    const hit = (c && c.querySelector(S.sendBtn)) || document.querySelector(S.sendBtn);
    if (hit) return hit;
    const btns = composerButtons();
    return btns.find((b) => b.type === "submit" && !STOP_ARIA_RE.test(ariaOf(b))) ||
           btns.find((b) => SEND_ARIA_RE.test(ariaOf(b)) && !STOP_ARIA_RE.test(ariaOf(b))) || null;
  };
  const stopButton = () => {
    const c = composerFrame();
    const hit = S.stopBtn ? ((c && c.querySelector(S.stopBtn)) || document.querySelector(S.stopBtn)) : null;
    if (hit) return hit;
    return composerButtons().find((b) => STOP_ARIA_RE.test(ariaOf(b))) || null;
  };

  // ── Generation detection ──────────────────────────────────────────────────
  function streamText(item) {
    if (!item) return "";
    const think = S.thinking ? item.querySelector(S.thinking) : null;
    return (think ? think.textContent || "" : "") + "\n" + textWithout(item);
  }
  const streamLen = (item) => streamText(item === undefined ? lastAssistant() : item).length;

  let _streamMax = -1, _streamAt = 0, _streamItem = null;
  function sampleStream() {
    const item = lastAssistant();
    const len = streamText(item).length;
    const now = Date.now();
    // The very first reading is only a baseline - an already-finished reply on the
    // page is not "growth". Crediting it made the site look busy for GEN_IDLE_MS
    // after load, which blocked the first send (clickSendButton + Enter both bail
    // while busy). A NEW turn appearing later still counts as activity below.
    if (_streamMax === -1) { _streamItem = item; _streamMax = len; _streamAt = 0; return; }
    if (item !== _streamItem || len < _streamMax - 400) {
      _streamItem = item; _streamMax = len; _streamAt = now; return;
    }
    if (len > _streamMax) { _streamMax = len; _streamAt = now; }
  }
  const grewWithin = (ms) => _streamMax > 1 && Date.now() - _streamAt < ms;

  function genActive() {
    sampleStream();
    if (stopButton()) return true;
    return grewWithin(timings.GEN_IDLE_MS);
  }
  const isGenerating = genActive;
  const isBusyNow = genActive;
  const isHardGenerating = () => !!stopButton();

  // Generic sites expose no reliable per-turn "stopped/continue" marker.
  const turnHalted = () => false;
  const findContinueBtn = () => null;
  const clickContinueBtn = () => false;

  function snapshot() {
    try {
      const it = lastAssistant();
      if (!it) return { th: 0, rp: 0 };
      const think = S.thinking ? it.querySelector(S.thinking) : null;
      return {
        th: think ? (think.textContent || "").trim().length : 0,
        rp: textWithout(it).length,
      };
    } catch { return {}; }
  }

  function readAssistant() {
    const item = lastAssistant();
    if (!item) return { present: false, reply: "", thinking: "", item: null };
    const think = S.thinking ? item.querySelector(S.thinking) : null;
    return {
      present: true,
      reply: textWithout(item).trim(),
      thinking: think ? (think.textContent || "").trim() : "",
      item,
    };
  }

  async function waitFor(pred, timeout) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (pred()) return true;
      await sleep(120);
    }
    return false;
  }

  // ── Sending ───────────────────────────────────────────────────────────────
  function setTextFieldValue(el, v) {
    const proto =
      el.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement && window.HTMLInputElement.prototype;
    const setter = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) setter.set.call(el, v);
    else el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // contenteditable: select-all then execCommand insertText - the one method that
  // updates ProseMirror/Quill/Lexical internal state (innerHTML assignment does
  // not, and is blocked by Trusted-Types CSP on some sites).
  function setContentEditable(el, v) {
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    try { document.execCommand("insertText", false, v); }
    catch { el.textContent = v; el.dispatchEvent(new Event("input", { bubbles: true })); }
  }
  function setEditorValue(el, v) {
    if (isTextField(el)) setTextFieldValue(el, v);
    else setContentEditable(el, v);
  }

  function clickSendButton() {
    if (isBusyNow()) return false;
    const btn = sendButton();
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  }

  async function typeAndSend(text, images) {
    const editor = getEditor();
    if (!editor) throw new Error(`${cfg.displayName} input box not found`);
    editor.focus();
    setEditorValue(editor, text);
    if (images && images.length && !hasPendingAttachment()) {
      try { await attachImages(images); } catch {}
    }
    // Wait for the framework to register the text and enable the send button,
    // re-asserting the value periodically in case a heavy re-render drops it.
    const t0 = Date.now();
    let lastNudge = t0;
    const enabled = await waitFor(() => {
      const b = sendButton();
      if (b && !b.disabled) return true;
      // No send control found at all: stop waiting early and use the Enter
      // fallback below, instead of burning the full 8s on every retry.
      if (!b && Date.now() - t0 > 1500) return true;
      if (Date.now() - lastNudge > 700) {
        lastNudge = Date.now();
        if (editorText() !== text) setEditorValue(editor, text);
        else editor.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return false;
    }, 8000);
    diag(`${cfg.id}.send`, { enabled, busy: isBusyNow() });
    if (!clickSendButton() && !isBusyNow()) {
      const o = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
      editor.dispatchEvent(new KeyboardEvent("keydown", o));
      editor.dispatchEvent(new KeyboardEvent("keyup", o));
    }
  }

  function stopGeneration() {
    const b = stopButton();
    if (b) try { b.click(); } catch {}
  }

  function enforceComposer() { return { ready: !!getEditor() }; }
  async function ensureComposerReady(reason) {
    diag("mode_ready", { reason, provider: cfg.id });
    return { ready: !!getEditor() };
  }

  // Unsettled-read guard: returns true if the latest assistant reply is still
  // being composed (the framework is mid-render). A half-rendered command would
  // look "cut off" and fire a premature parse_error. The generic heuristic detects
  // a live streaming marker inside the last assistant turn; override via cfg.replyUnsettled
  // for providers with a more precise signal.
  const replyUnsettled = (item) => {
    if (!item) return false;
    // A streaming/typing indicator inside the turn, or a "loading" code block node.
    const markers = ['.streaming', '.loading', '[data-streaming="true"]', '.animate-pulse'];
    for (const m of markers) {
      if (item.querySelector(m)) return true;
    }
    return false;
  };

  // ── Error / limit detection (site chrome only) ────────────────────────────
  function scanError() {
    try {
      for (const el of document.querySelectorAll(S.errorSurfaces)) {
        if (el.offsetParent === null) continue;
        if (el.closest(S.anyItem)) continue; // model content, not UI chrome
        const t = (el.innerText || "").trim();
        if (t.length > 8 && t.length < 600 && RE.contextLimit.test(t)) return t.slice(0, 240);
      }
    } catch {}
    if (!getEditor()) return "The input box disappeared (session ended?).";
    return null;
  }
  const isTooLongMsg = (text) => RE.tooLong.test(text);
  const isBusyMsg = (text) => RE.busy.test(text);

  // ── Image attachment (best effort via a mounted <input type=file>) ─────────
  function fileFromImage(img, i) {
    const mime = img.mimeType || "image/jpeg";
    const bin = atob(img.data);
    const arr = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
    const ext = mime.includes("png") ? "png" : "jpg";
    return new File([arr], `voidscript_${Date.now()}_${i}.${ext}`, { type: mime });
  }
  const fileInputEl = () => {
    const c = composerFrame();
    return (c && c.querySelector('input[type="file"]')) || document.querySelector('input[type="file"]');
  };
  const hasPendingAttachment = () => false; // generic sites vary; treated as none
  async function attachImages(images) {
    if (!images || !images.length) return false;
    if (!cfg.supportsVision) return false;
    const fileInput = fileInputEl();
    if (!fileInput) { diag("attach.noFileInput"); return false; }
    const dt = new DataTransfer();
    images.forEach((img, i) => { try { dt.items.add(fileFromImage(img, i)); } catch {} });
    if (!dt.items.length) return false;
    try {
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (e) { diag("attach.setFilesThrew", { msg: String((e && e.message) || e) }); return false; }
    return true;
  }
  function clearAttachments() {}

  const conversationKey = () => location.pathname + location.search;

  // ── User-send interception ────────────────────────────────────────────────
  function installSendHooks(handlers) {
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
        const ed = getEditor();
        if (!ed || !ed.contains(e.target)) return;
        if (editorText().trim() === "") return;
        if (handlers.isBlocked()) return;
        if (!handlers.isStarted()) {
          if (!chatIsEmpty()) return; // existing conversation → not ours to gate
          handlers.onBlockedAttempt();
          return;
        }
        handlers.onUserMessage(assistantCount());
      },
      true
    );

    document.addEventListener(
      "click",
      (e) => {
        if (!getEditor()) return;
        const t = e.target;
        if (!t || !t.closest || t.closest("#vs-root, #vs-bar")) return; // our own UI
        // Resolve the live buttons (same language-neutral fallbacks as sending) so a
        // click on a localised or testid-less Send/Stop is still recognised.
        const sb = stopButton();
        if (sb && sb.contains(t)) { handlers.onNativeStop(); return; }
        const btn = sendButton();
        if (!btn || !btn.contains(t) || btn.disabled) return;
        if (handlers.isBlocked()) return;
        if (!handlers.isStarted()) {
          if (!chatIsEmpty()) return;
          handlers.onBlockedAttempt();
          return;
        }
        handlers.onUserMessage(assistantCount());
      },
      true
    );
  }

  // ── Tool-block location for camouflage ────────────────────────────────────
  const CMD_SHAPE = /"(?:command|tool)"\s*:\s*"|###\s*lua|###mcp_tool###/i;
  const PROSE_SEL = "p, li, h1, h2, h3, h4, h5, h6, blockquote, table";
  const normLen = (el) => (el.textContent || "").replace(/\s+/g, "").length;
  const codeCount = (el) => el.querySelectorAll("pre, code").length + (el.matches("pre, code") ? 1 : 0);
  // Modern sites wrap a code block in a "card" (language label, copy / run icons)
  // around the <pre>/<code>. Hiding only the inner node leaves that chrome behind,
  // so climb from the code to the outermost ancestor that is still JUST the code
  // card: stop as soon as a parent adds real prose or a meaningful amount of text.
  function climbToCard(el, item) {
    let box = el;
    while (box.parentElement && box.parentElement !== item) {
      const p = box.parentElement;
      if (normLen(p) - normLen(box) > 30) break;            // parent carries other text
      const prose = [...p.querySelectorAll(PROSE_SEL)].some((n) => !box.contains(n) && !n.contains(box));
      if (prose) break;                                     // never swallow the model's prose
      if (codeCount(p) > codeCount(box)) break;             // parent holds another code block
      box = p;
    }
    return box;
  }
  function findToolBlockSpot(item) {
    if (!item) return null;
    let hidAny = null;
    const seen = new Set();
    // The configured wrapper first, then any code-ish node (sites that no longer
    // render a bare <pre>, CodeMirror viewers, etc.). Innermost match wins.
    const nodes = [...item.querySelectorAll(`${S.codeWrap}, code, .cm-content`)];
    for (const node of nodes) {
      if (S.thinking && node.closest(S.thinking)) continue;
      if (node.closest(".vs-chip, .vs-tool-hide")) continue;
      if (!CMD_SHAPE.test(node.textContent || "")) continue;
      const card = climbToCard(node, item);
      if (seen.has(card) || card.closest(".vs-tool-hide")) continue;
      seen.add(card);
      card.classList.add("vs-tool-hide");
      item.classList.add("vs-cmd-mask");
      hidAny = hidAny || { parent: card.parentElement, ref: card };
    }
    return hidAny;
  }

  return {
    id: cfg.id,
    displayName: cfg.displayName,
    beta,
    supportsVision: !!cfg.supportsVision,
    timings,
    thinkingSel: S.thinking,
    chipAtItemLevel: cfg.chipAtItemLevel !== false,
    // A permanent, non-intrusive notice shown in the VoidScript panel so users
    // know a factory-built provider may need live tuning.
    unstableWarning:
      cfg.unstableWarning ||
      (beta
        ? `${cfg.displayName} support is BETA (generic adapter). If it stalls, ` +
          `sends nothing, or never detects completion, the site's DOM likely ` +
          `changed - report it so a tuned provider can be written.`
        : undefined),
    init({ diag: d } = {}) { if (d) diag = d; },
    // turns
    allItems, isUserItem, isAssistantItem, itemText, classifyText,
    assistantCount, userCount, lastAssistant, readAssistant,
    streamLen, snapshot,
    // composer / state
    getEditor, editorText, chatIsEmpty, isFreshChat, composerFrame, barAnchor, barMount,
    setInputLock, typeAndSend, stopGeneration,
    isGenerating, isBusyNow, isHardGenerating,
    enforceComposer, ensureComposerReady,
    turnHalted, findContinueBtn, clickContinueBtn,
    scanError, isTooLongMsg, isBusyMsg,
    // actions
    attachImages, clearAttachments, conversationKey,
    installSendHooks, findToolBlockSpot,
    replyUnsettled,
    // Voice: Web Speech API availability (Feature toggle).
    voiceAvailable: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}
