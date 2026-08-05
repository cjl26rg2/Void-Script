// SPDX-License-Identifier: GPL-3.0-or-later
// providers/duck.js - provider for DuckDuckGo AI Chat (duck.ai).
// Built on the generic factory (providers/_generic.js). Re-verify selectors live
// if turns are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "duck",
  displayName: "DuckDuckGo AI",
  supportsVision: false,
  beta: false,
  selectors: {
    userItem: '[data-testid="chatMessageUser"]',
    assistantItem: '[data-testid="chatMessageAssistant"]',
    thinking: '[data-thinking],[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i], button[data-testid*="stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
