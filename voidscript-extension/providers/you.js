// SPDX-License-Identifier: GPL-3.0-or-later
// providers/you.js - BETA provider for You.com (you.com). Built on the generic
// factory (providers/_generic.js). Best-guess selectors; re-verify live if turns
// are not read or the send does not fire.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "you",
  displayName: "You",
  supportsVision: false,
  selectors: {
    userItem: '[data-testid*="user" i], [class*="user" i][class*="message" i]',
    assistantItem: '[data-testid*="answer" i], [class*="assistant" i][class*="message" i], .prose',
    thinking: '[class*="thinking" i],[class*="reasoning" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i], button[data-testid*="submit" i]',
    stopBtn: 'button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
