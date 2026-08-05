// SPDX-License-Identifier: GPL-3.0-or-later
// providers/poe.js - BETA provider for Poe (poe.com), Quora's multi-model chat.
// Built on the generic factory (providers/_generic.js). Selectors are best-guess
// and should be re-verified live if turns are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "poe",
  displayName: "Poe",
  supportsVision: false,
  selectors: {
    userItem: '[class*="Message_humanMessage" i], [class*="human" i][class*="message" i]',
    assistantItem: '[class*="Message_botMessage" i], [class*="bot" i][class*="message" i]',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea[class*="TextArea" i], textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[class*="sendButton" i], button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[class*="stopButton" i], button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
