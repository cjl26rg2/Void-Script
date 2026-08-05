// SPDX-License-Identifier: GPL-3.0-or-later
// providers/yuanbao.js - BETA provider for Tencent Yuanbao (yuanbao.tencent.com).
// Built on the generic factory (providers/_generic.js). Best-guess selectors;
// re-verify live if turns are not read or the send does not fire. UI is in
// Chinese; a dedicated provider should add zh error/limit patterns.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "yuanbao",
  displayName: "Yuanbao",
  supportsVision: false,
  selectors: {
    userItem: '[class*="hyc-content-user" i], [class*="user" i][class*="message" i]',
    assistantItem: '[class*="hyc-content-md" i], [class*="agent" i][class*="message" i], [class*="markdown" i]',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: 'div[contenteditable="true"], textarea',
    composer: "form",
    sendBtn: 'button[type="submit"], [class*="send" i]',
    stopBtn: 'button[aria-label*="停止" i], button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
