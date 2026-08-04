// SPDX-License-Identifier: GPL-3.0-or-later
// providers/_generic.js - a selector-driven, provider-agnostic adapter factory.
//
// The hand-written providers (deepseek.js, gemini.js, kimi.js, glm.js, qwen.js,
// arena.js, meta.js) each reverse-engineer ONE AI site's live DOM. That is the
// gold standard and should always be preferred once a site is validated.
//
// This factory exists so a NEW site can be brought up quickly with just a config
// object of CSS selectors instead of a full 40-method rewrite. It implements the
// entire ZSProvider interface the core (core/main.js) expects, using sensible,
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
//   const ZSProvider = ZSGeneric({ id, displayName, selectors: {...}, ... });
//
// eslint-disable-next-line no-unused-vars
function ZSGeneric(cfg) {
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
      ].join("|"),
      "i"
    ),
    tooLong: /conversation .{0,20}(too long|getting too long)/i,
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
    const skipParts = [S.thinking, ".zs-chip"];
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

  // Scope to the SITE's composer only: skip ZeroScript's own injected UI so our
  // settings textarea never defeats the "not on a chat page" guard.
  const getEditor = () => {
    for (const e of document.querySelectorAll(S.editor)) {
      if (!e.closest("#zs-root")) return e;
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

  const composerFrame = () =>
    (getEditor() ? getEditor().closest(S.composer) || getEditor().closest("form, .relative") : null) ||
    document.querySelector(S.composer);

  // The rounded composer card the core's bar can hug (best effort).
  function barAnchor() {
    const ed = getEditor();
    if (!ed) return null;
    return (
      ed.closest('[class*="rounded-xl"], [class*="rounded-2xl"], [class*="rounded-3xl"]') ||
      ed.closest("form") ||
      ed.parentElement
    );
  }

  // ── Input lock ────────────────────────────────────────────────────────────
  function setInputLock(on) {
    const ed = getEditor();
    if (!ed) return;
    if (isTextField(ed)) {
      if (on) {
        if (!ed.dataset.zsPlaceholder) ed.dataset.zsPlaceholder = ed.getAttribute("placeholder") || "";
        ed.setAttribute("readonly", "");
        ed.setAttribute("placeholder", "⏳ Agent working… please wait");
      } else {
        ed.removeAttribute("readonly");
        if (ed.dataset.zsPlaceholder != null) ed.setAttribute("placeholder", ed.dataset.zsPlaceholder);
      }
    } else {
      // contenteditable: toggling contenteditable=false would block our own
      // execCommand injection, so only flag it visually via a data attribute the
      // overlay CSS can style. typeAndSend re-enables as needed.
      if (on) ed.setAttribute("data-zs-locked", "1");
      else ed.removeAttribute("data-zs-locked");
    }
  }

  // ── Send / stop buttons ───────────────────────────────────────────────────
  const sendButton = () => {
    const c = composerFrame();
    return (c && c.querySelector(S.sendBtn)) || document.querySelector(S.sendBtn);
  };
  const stopButton = () => {
    if (!S.stopBtn) return null;
    const c = composerFrame();
    return (c && c.querySelector(S.stopBtn)) || document.querySelector(S.stopBtn);
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
    let lastNudge = Date.now();
    const enabled = await waitFor(() => {
      const b = sendButton();
      if (b && !b.disabled) return true;
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
    return new File([arr], `zeroscript_${Date.now()}_${i}.${ext}`, { type: mime });
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
        const stop = t && t.closest && S.stopBtn && t.closest(S.stopBtn);
        if (stop) { handlers.onNativeStop(); return; }
        const btn = t && t.closest && t.closest(S.sendBtn);
        if (!btn || btn.disabled) return;
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
  function findToolBlockSpot(item) {
    if (!item) return null;
    let hidAny = null;
    for (const wrap of item.querySelectorAll(S.codeWrap)) {
      if (S.thinking && wrap.closest(S.thinking)) continue;
      if (wrap.closest(".zs-chip")) continue;
      if (CMD_SHAPE.test(wrap.textContent || "")) {
        wrap.classList.add("zs-tool-hide");
        item.classList.add("zs-cmd-mask");
        hidAny = hidAny || { parent: wrap.parentElement, ref: wrap };
      }
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
    // A permanent, non-intrusive notice shown in the ZeroScript panel so users
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
    getEditor, editorText, chatIsEmpty, isFreshChat, composerFrame, barAnchor,
    setInputLock, typeAndSend, stopGeneration,
    isGenerating, isBusyNow, isHardGenerating,
    enforceComposer, ensureComposerReady,
    turnHalted, findContinueBtn, clickContinueBtn,
    scanError, isTooLongMsg, isBusyMsg,
    // actions
    attachImages, clearAttachments, conversationKey,
    installSendHooks, findToolBlockSpot,
  };
}
