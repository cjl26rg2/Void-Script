// SPDX-License-Identifier: GPL-3.0-or-later
// providers/genspark.js - BETA provider for Genspark (genspark.ai).
// Built on the generic factory (providers/_generic.js). Best-guess selectors;
// re-verify live if turns are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "genspark",
  displayName: "Genspark",
  supportsVision: false,
  selectors: {
    userItem: '[class*="user" i][class*="message" i], [data-role="user"]',
    assistantItem: '[class*="assistant" i][class*="message" i], [class*="agent" i][class*="message" i], .prose',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
