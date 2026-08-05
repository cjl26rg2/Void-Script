// SPDX-License-Identifier: GPL-3.0-or-later
// providers/llama.js - provider for Meta Llama (www.llama.com).
// Built on the generic factory (providers/_generic.js). Re-verify selectors live
// if turns are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "llama",
  displayName: "Llama",
  supportsVision: false,
  beta: false,
  selectors: {
    userItem: '[data-testid*="user-message"], [class*="user-message" i], [data-role="user"]',
    assistantItem: '[data-testid*="assistant-message"], [class*="assistant-message" i], [data-role="assistant"]',
    thinking: '[data-thinking],[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i], button[aria-label*="Cancel" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});