// SPDX-License-Identifier: GPL-3.0-or-later
// providers/kimi.js — generic VoidScript adapter for Kimi (test build).
// Best-guess selectors on the VSGeneric factory; tune live if a turn is not
// read or the send does not fire. (The shipping extension uses a hand-tuned
// provider for this site; this rebuild routes it through the generic adapter.)
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "kimi",
  displayName: "Kimi",
  supportsVision: false,
  selectors: {
    userItem: '[data-message-author-role="user"], [class*="user" i][class*="message" i]',
    assistantItem: '[data-message-author-role="assistant"], [class*="assistant" i][class*="message" i], .markdown, .ds-markdown, .prose',
    thinking: '[class*="think" i],[class*="reason" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
