// SPDX-License-Identifier: GPL-3.0-or-later
// providers/kagi.js - provider for Kagi Assistant (assistant.kagi.com).
// Built on the generic factory (providers/_generic.js). Re-verify selectors live
// if turns are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "kagi",
  displayName: "Kagi",
  supportsVision: false,
  beta: false,
  selectors: {
    userItem: '[data-message-author-role="user"], [data-role="user"]',
    assistantItem: '[data-message-author-role="assistant"], [data-role="assistant"]',
    thinking: '[data-thinking],[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i], button[aria-label*="Cancel" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});