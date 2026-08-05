// SPDX-License-Identifier: GPL-3.0-or-later
// providers/lmarena.js - BETA provider for LMArena (lmarena.ai), the LMSYS model
// arena. Built on the generic factory (providers/_generic.js). Use DIRECT chat
// (single model), not battle/side-by-side - like the hand-tuned arena.js, the
// comparison modes are not supported. Best-guess selectors; re-verify live.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "lmarena",
  displayName: "LMArena",
  supportsVision: false,
  selectors: {
    userItem: '[data-sentry-component*="User" i], [class*="user" i][class*="message" i]',
    assistantItem: '[data-sentry-component*="Assistant" i], [class*="assistant" i][class*="message" i], .prose',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
