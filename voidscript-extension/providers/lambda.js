// SPDX-License-Identifier: GPL-3.0-or-later
// providers/lambda.js - BETA provider for Lambda Chat (lambda.chat).
// Built on the generic factory (providers/_generic.js). The UI is a HuggingChat
// derivative, so selectors mirror providers/huggingchat.js. Best-guess; re-verify
// live if turns are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "lambda",
  displayName: "Lambda Chat",
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
