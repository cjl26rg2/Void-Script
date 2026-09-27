// SPDX-License-Identifier: GPL-3.0-or-later
// providers/inflection.js - provider for Inflection AI (inflection.com).
// Built on the generic factory (providers/_generic.js). Re-verify selectors live
// if turns are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "inflection",
  displayName: "Inflection AI",
  supportsVision: false,
  beta: false,
  selectors: {
    userItem: '[class*="user-message" i], [class*="human-message" i], [data-wa-stack="question"]',
    assistantItem: '[class*="assistant-message" i], [class*="bot-message" i], [data-wa-stack="answer"]',
    thinking: '[data-thinking],[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i], button[aria-label*="Cancel" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
