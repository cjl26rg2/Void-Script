// SPDX-License-Identifier: GPL-3.0-or-later
// providers/copilot.js - BETA provider for Microsoft Copilot (copilot.microsoft.com).
// Built on the generic factory (providers/_generic.js). Re-verify these
// selectors live if turns are not read or the send does not fire.
//
// Notes:
//  - Copilot marks messages with data-content / author attributes and uses a
//    <textarea> composer (id="userInput" on recent builds).
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "copilot",
  displayName: "Copilot",
  supportsVision: false,
  selectors: {
    userItem: '[data-content="user-message"], [class*="user"][class*="message" i]',
    assistantItem: '[data-content="ai-message"], [class*="ai"][class*="message" i], [class*="assistant"][class*="message" i]',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: '#userInput, textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[data-testid="submit-button"], button[aria-label*="Submit" i], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
