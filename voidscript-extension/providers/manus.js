// SPDX-License-Identifier: GPL-3.0-or-later
// providers/manus.js - BETA provider for Manus (manus.im), an autonomous agent
// chat. Built on the generic factory (providers/_generic.js). Best-guess
// selectors; re-verify live if turns are not read or the send does not fire.
// Note: Manus runs its own long agent loops, so completion detection via stream
// quiescence may fire early - expect to tune timings for this one.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "manus",
  displayName: "Manus",
  supportsVision: false,
  timings: { GEN_IDLE_MS: 6000, STABLE_MS: 15000 },
  selectors: {
    userItem: '[class*="user" i][class*="message" i], [data-role="user"]',
    assistantItem: '[class*="assistant" i][class*="message" i], [class*="agent" i][class*="message" i], .prose',
    thinking: '[class*="thinking" i],[class*="reasoning" i],[class*="step" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[type="submit"], button[aria-label*="Send" i]',
    stopBtn: 'button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
