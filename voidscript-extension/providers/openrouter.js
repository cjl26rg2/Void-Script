// SPDX-License-Identifier: GPL-3.0-or-later
// providers/openrouter.js - BETA provider for OpenRouter chat (openrouter.ai).
// Built on the generic factory (providers/_generic.js). Use the chat UI at
// openrouter.ai/chat. Best-guess selectors; re-verify live if turns are not read
// or the send does not fire.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "openrouter",
  displayName: "OpenRouter",
  supportsVision: false,
  selectors: {
    userItem: '[data-message-author-role="user"], [class*="user" i][class*="message" i]',
    assistantItem: '[data-message-author-role="assistant"], [class*="assistant" i][class*="message" i], .prose',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
