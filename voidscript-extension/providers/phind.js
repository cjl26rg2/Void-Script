// SPDX-License-Identifier: GPL-3.0-or-later
// providers/phind.js - BETA provider for Phind (phind.com), a coding-focused
// answer engine. Built on the generic factory (providers/_generic.js).
// Best-guess selectors; re-verify live if turns are not read or send fails.
// eslint-disable-next-line no-unused-vars
const ZSProvider = ZSGeneric({
  id: "phind",
  displayName: "Phind",
  supportsVision: false,
  selectors: {
    userItem: '[class*="question" i], [class*="user" i][class*="message" i]',
    assistantItem: '[class*="answer" i], [class*="assistant" i][class*="message" i], .prose',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i], button[aria-label*="Search" i]',
    stopBtn: 'button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
