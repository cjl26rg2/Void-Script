// SPDX-License-Identifier: GPL-3.0-or-later
// providers/v0.js - BETA provider for Vercel v0 (v0.app / v0.dev), a code/UI
// generation chat. Built on the generic factory (providers/_generic.js).
// Best-guess selectors; re-verify live if turns are not read or send fails.
// v0 is code-generation-oriented; its replies are heavy on code blocks, which
// suits VoidScript's fenced-command extraction.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "v0",
  displayName: "v0",
  supportsVision: false,
  selectors: {
    userItem: '[data-message-role="user"], [class*="user" i][class*="message" i]',
    assistantItem: '[data-message-role="assistant"], [class*="assistant" i][class*="message" i], .prose',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
