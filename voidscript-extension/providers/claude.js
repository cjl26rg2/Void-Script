// SPDX-License-Identifier: GPL-3.0-or-later
// providers/claude.js - provider for Claude (claude.ai).
// Built on the generic factory (providers/_generic.js). Re-verify selectors live
// if turns are not read or the send does not fire (Claude's ProseMirror DOM
// changes often).
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "claude",
  displayName: "Claude",
  supportsVision: false,
  beta: false,
  selectors: {
    userItem: '[data-message-author-role="user"], [data-testid="user-message"]',
    assistantItem: '[data-message-author-role="assistant"], [data-testid="assistant-message"]',
    thinking: '[data-thinking],[class*="thinking" i],[class*="reasoning" i]',
    editor: 'div[role="textbox"][contenteditable="true"], textarea, div[contenteditable="true"]',
    composer: "form, .composer-container",
    sendBtn: 'button[data-testid="send-button"], button[aria-label*="Send" i], button[type="submit"]',
    stopBtn: 'button[aria-label*="Stop" i], button[data-testid*="stop" i], button[aria-label*="Interrupt" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
