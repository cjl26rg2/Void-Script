// SPDX-License-Identifier: GPL-3.0-or-later
// providers/chatgpt.js - BETA provider for ChatGPT (chatgpt.com / chat.openai.com).
// Built on the generic factory (providers/_generic.js). Selectors below are the
// documented ChatGPT DOM as of writing; if a turn is never read or the send never
// fires, these are the first things to re-check live (they change often).
//
// Notes:
//  - Turns carry data-message-author-role="user" | "assistant" on the message div,
//    or (newer layout) data-message-role on an <li>.
//  - Composer: older builds use a contenteditable ProseMirror div (#prompt-textarea);
//    the current build (verified 2026-09) uses a plain <textarea name="prompt">.
//    Both are covered - the factory handles textarea and contenteditable alike.
//  - Send/stop: the current build dropped data-testid on these buttons and only
//    has a LOCALISED aria-label ("Send message" / "Invia messaggio"). So we only
//    list the legacy testids here and let the factory's language-neutral fallback
//    (the composer's submit button, multilingual aria match) find them - that is
//    what makes ChatGPT work in Italian, Spanish, German, etc., not just English.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "chatgpt",
  displayName: "ChatGPT",
  supportsVision: false, // flip to true only after a live screen_capture read is confirmed
  beta: false, // stable: no "unstable" pill on the status bar
  inlineBar: false, // never put our bar inside ChatGPT's form - React hydration blanks the page
  selectors: {
    // Classic layout | the newer "octane" layout (verified 2026-10: <li> turns in
    // ol[data-conversation-transcript], code in pre[data-assistant-stream-block]).
    userItem: '[data-message-author-role="user"], li[data-message-role="user"]',
    assistantItem: '[data-message-author-role="assistant"], li[data-message-role="assistant"]',
    thinking: '[data-thinking],[class*="thinking" i],[class*="reasoning" i]',
    editor: '#prompt-textarea, textarea[name="prompt"], div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[data-testid="send-button"]',
    stopBtn: 'button[data-testid="stop-button"]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
