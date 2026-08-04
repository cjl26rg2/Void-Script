// SPDX-License-Identifier: GPL-3.0-or-later
// providers/huggingchat.js - BETA provider for HuggingChat (huggingface.co/chat).
// Built on the generic factory (providers/_generic.js). Best-guess selectors;
// re-verify live if turns are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const ZSProvider = ZSGeneric({
  id: "huggingchat",
  displayName: "HuggingChat",
  supportsVision: false,
  selectors: {
    userItem: '[class*="user" i][class*="message" i], [data-message-role="user"]',
    assistantItem: '[class*="assistant" i][class*="message" i], [data-message-role="assistant"], .prose',
    thinking: '[class*="thinking" i],[class*="reasoning" i],details',
    editor: 'textarea[placeholder], textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i], button[class*="stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
