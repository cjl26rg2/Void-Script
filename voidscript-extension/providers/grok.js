// SPDX-License-Identifier: GPL-3.0-or-later
// providers/grok.js - BETA provider for Grok (grok.com).
// Built on the generic factory (providers/_generic.js). Re-verify these
// selectors live if turns are not read or the send does not fire.
//
// Notes:
//  - Grok's web app marks message rows with message-bubble / author classes and
//    uses a real <textarea> composer, so the factory's textarea path applies.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "grok",
  displayName: "Grok",
  supportsVision: false,
  selectors: {
    userItem: '.message-bubble.items-end, [class*="user"][class*="message" i]',
    assistantItem: '.message-bubble.items-start, [class*="bot"][class*="message" i], [class*="assistant"][class*="message" i]',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
