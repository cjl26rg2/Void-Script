// SPDX-License-Identifier: GPL-3.0-or-later
// providers/groq.js - BETA provider for Groq (groq.com), fast open-model chat.
// Built on the generic factory (providers/_generic.js). Best-guess selectors;
// re-verify live if turns are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "groq",
  displayName: "Groq",
  supportsVision: false,
  selectors: {
    userItem: '[data-message-author-role="user"], [class*="user" i][class*="message" i]',
    assistantItem: '[data-message-author-role="assistant"], [class*="assistant" i][class*="message" i]',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
