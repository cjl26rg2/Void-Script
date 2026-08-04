// SPDX-License-Identifier: GPL-3.0-or-later
// providers/yiyan.js - BETA provider for Baidu ERNIE Bot / Yiyan (yiyan.baidu.com).
// Built on the generic factory (providers/_generic.js). Best-guess selectors;
// re-verify live if turns are not read or the send does not fire. UI is in
// Chinese; a dedicated provider should add zh error/limit patterns.
// eslint-disable-next-line no-unused-vars
const ZSProvider = ZSGeneric({
  id: "yiyan",
  displayName: "ERNIE",
  supportsVision: false,
  selectors: {
    userItem: '[class*="user" i][class*="message" i], [class*="question" i]',
    assistantItem: '[class*="answer" i], [class*="assistant" i][class*="message" i], [class*="markdown" i]',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], [class*="send" i], button[aria-label*="发送" i]',
    stopBtn: 'button[aria-label*="停止" i], button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
