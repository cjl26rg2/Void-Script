// SPDX-License-Identifier: GPL-3.0-or-later
// providers/friend.js - provider for Friend (friend.com).
// Built on the generic factory (providers/_generic.js). Re-verify selectors live
// if turns are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "friend",
  displayName: "Friend",
  supportsVision: false,
  beta: true,
  selectors: {
    userItem: '[data-message-author-role="user"], [class*="user-message" i], [class*="human" i]',
    assistantItem: '[data-message-author-role="assistant"], [class*="assistant-message" i], [class*="bot-message" i]',
    thinking: '[data-thinking],[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form, .composer",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i], button[aria-label*="Interrupt" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
