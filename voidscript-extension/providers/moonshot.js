// SPDX-License-Identifier: GPL-3.0-or-later
// providers/moonshot.js - provider for Moonshot (moonshot.cn).
// Built on the generic factory (providers/_generic.js). Re-verify selectors live
// if turns are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "moonshot",
  displayName: "Moonshot",
  supportsVision: false,
  beta: false,
  selectors: {
    userItem: '[data-message-author-role="user"], [class*="user-message" i]',
    assistantItem: '[data-message-author-role="assistant"], [class*="assistant-message" i]',
    thinking: '[data-thinking],[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i], button[aria-label*="Cancel" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});