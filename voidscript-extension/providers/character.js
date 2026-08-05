// SPDX-License-Identifier: GPL-3.0-or-later
// providers/character.js - provider for Character.AI (character.ai).
// Built on the generic factory (providers/_generic.js). Re-verify selectors live
// if turns are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "character",
  displayName: "Character.AI",
  supportsVision: false,
  beta: false,
  selectors: {
    userItem: '[data-testid*="message-user" i], [class*="user-message" i], [class*="message-user" i]',
    assistantItem: '[data-testid*="message-bot" i], [class*="bot-message" i], [class*="assistant-message" i], [class*="message-bot" i]',
    thinking: '[data-thinking],[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i], button[aria-label*="Cancel" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});