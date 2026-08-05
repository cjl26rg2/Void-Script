// SPDX-License-Identifier: GPL-3.0-or-later
// providers/perplexity.js - BETA provider for Perplexity (perplexity.ai).
// Built on the generic factory (providers/_generic.js). Re-verify these
// selectors live if turns are not read or the send does not fire.
//
// Notes:
//  - Perplexity is answer-oriented; question/answer blocks carry data-testid
//    hooks. The composer is a contenteditable/textarea depending on build.
//  - Perplexity injects sources/citations that are NOT model text; the reasoning
//    strip in the factory keeps command extraction clean of most chrome, but
//    watch for false positives if answers embed the command JSON in a citation.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "perplexity",
  displayName: "Perplexity",
  supportsVision: false,
  selectors: {
    userItem: '[data-testid="query-text"], [class*="query"]',
    assistantItem: '[data-testid="answer-text"], [class*="answer"][class*="prose" i], .prose',
    thinking: '[class*="reasoning" i],[class*="thinking" i]',
    editor: 'textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[aria-label*="Submit" i], button[aria-label*="Send" i], button[type="submit"]',
    stopBtn: 'button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
