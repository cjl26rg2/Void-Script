// SPDX-License-Identifier: GPL-3.0-or-later
// providers/doubao.js - BETA provider for Doubao (doubao.com), ByteDance's chat.
// Built on the generic factory (providers/_generic.js). Best-guess selectors;
// re-verify live if turns are not read or the send does not fire. UI is in
// Chinese; the factory's error/limit regexes are English-first so limit
// detection may miss - a dedicated provider should add zh patterns.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "doubao",
  displayName: "Doubao",
  supportsVision: false,
  selectors: {
    userItem: '[class*="send-message" i], [class*="user" i][class*="message" i]',
    assistantItem: '[class*="receive-message" i], [class*="assistant" i][class*="message" i], [class*="markdown" i]',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="发送" i], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="停止" i], button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
