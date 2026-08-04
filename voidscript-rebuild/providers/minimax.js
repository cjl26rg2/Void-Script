// SPDX-License-Identifier: GPL-3.0-or-later
// providers/minimax.js - BETA provider for MiniMax / Hailuo (chat.minimax.io).
// Built on the generic factory (providers/_generic.js). Best-guess selectors;
// re-verify live if turns are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const ZSProvider = ZSGeneric({
  id: "minimax",
  displayName: "MiniMax",
  supportsVision: false,
  selectors: {
    userItem: '[class*="user" i][class*="message" i], [data-role="user"]',
    assistantItem: '[class*="assistant" i][class*="message" i], [class*="bot" i][class*="message" i], [class*="markdown" i]',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
