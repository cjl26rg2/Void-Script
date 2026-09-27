// SPDX-License-Identifier: GPL-3.0-or-later
// providers/windsurf.js - provider for Windsurf (windsurf.ai).
// Built on the generic factory (providers/_generic.js). Verify selectors live if
// sends nothing or completion is not detected.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "windsurf",
  displayName: "Windsurf",
  supportsVision: false,
  beta: true,
  selectors: {
    userItem: '[data-message-author-role="user"],[class*="user-turn" i],[class*="human-msg" i]',
    assistantItem: '[data-message-author-role="assistant"],[class*="assistant-turn" i],[class*="bot-msg" i]',
    thinking: '[data-thinking],[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: 'form, .composer, .input-container',
    sendBtn: 'button[type="submit"],button[aria-label*="Send" i],button[class*="send" i]',
    stopBtn: 'button[aria-label*="Stop" i],button[aria-label*="Interrupt" i],button[class*="stop" i]',
    codeWrap: 'pre',
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
