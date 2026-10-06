// SPDX-License-Identifier: GPL-3.0-or-later
// providers/superapp.js - BETA provider for SuperApp Chat (superapp.chat).
// Built on the generic factory (providers/_generic.js) with broad selectors. If
// turns aren't read or sending doesn't fire, Toolkit > Site check tunes it.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "superapp",
  displayName: "SuperApp",
  supportsVision: false,
  // Its chat box is a small rounded card: inside it the bar squashes the input,
  // so the bar sits on top of the box instead.
  inlineBar: false,
  selectors: {
    userItem: '[data-message-author-role="user"], [data-role="user"], [class*="user" i][class*="message" i]',
    assistantItem: '[data-message-author-role="assistant"], [data-role="assistant"], [class*="assistant" i][class*="message" i], .prose, .markdown',
    thinking: '[class*="thinking" i],[class*="reasoning" i],details',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i], button[data-testid*="send" i]',
    stopBtn: 'button[aria-label*="Stop" i], button[class*="stop" i], button[data-testid*="stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
