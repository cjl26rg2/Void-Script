// SPDX-License-Identifier: GPL-3.0-or-later
// providers/t3chat.js - provider for T3 Chat (t3.chat).
// Built on the generic factory (providers/_generic.js). Re-verify selectors live
// if turns are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "t3chat",
  displayName: "T3 Chat",
  supportsVision: false,
  beta: false,
  selectors: {
    userItem: '[class*="user-message" i], [class*="human-message" i], [data-message-role="user"]',
    assistantItem: '[class*="assistant-message" i], [class*="bot-message" i], [data-message-role="assistant"]',
    thinking: '[data-thinking],[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i], button[aria-label*="Cancel" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
