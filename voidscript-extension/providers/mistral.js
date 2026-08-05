// SPDX-License-Identifier: GPL-3.0-or-later
// providers/mistral.js - BETA provider for Mistral Le Chat (chat.mistral.ai).
// Built on the generic factory (providers/_generic.js). Re-verify these
// selectors live if turns are not read or the send does not fire.
//
// Notes:
//  - Le Chat renders message rows with author-tagged classes and uses a
//    <textarea> composer, so the factory's textarea path applies.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "mistral",
  displayName: "Mistral",
  supportsVision: false,
  selectors: {
    userItem: '[data-message-author-role="user"], [class*="user"][class*="message" i]',
    assistantItem: '[data-message-author-role="assistant"], [class*="assistant"][class*="message" i]',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
