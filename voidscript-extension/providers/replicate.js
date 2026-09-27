// SPDX-License-Identifier: GPL-3.0-or-later
// providers/replicate.js - provider for Replicate (replicate.com).
// Built on the generic factory (providers/_generic.js). Verify selectors live.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "replicate",
  displayName: "Replicate",
  supportsVision: true,
  beta: true,
  selectors: {
    userItem: '[data-message-author-role="user"],[class*="user-msg" i],[class*="human-turn" i]',
    assistantItem: '[data-message-author-role="assistant"],[class*="assistant-msg" i],[class*="bot-turn" i]',
    thinking: '[data-thinking],[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: 'form, .composer, .input-container',
    sendBtn: 'button[type="submit"],button[aria-label*="Send" i],button[class*="send" i]',
    stopBtn: 'button[aria-label*="Stop" i],button[aria-label*="Interrupt" i],button[class*="stop" i]',
    codeWrap: 'pre',
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
