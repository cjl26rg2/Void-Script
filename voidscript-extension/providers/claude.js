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
    userItem: '[data-testid="user-message"]',
    assistantItem: '[data-testid="assistant-message"]',
    thinking: '[data-thinking],[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[data-testid="send-button"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i], button[data-testid*="stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
