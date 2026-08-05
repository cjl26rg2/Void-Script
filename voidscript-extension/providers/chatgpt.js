// SPDX-License-Identifier: GPL-3.0-or-later
// providers/chatgpt.js - BETA provider for ChatGPT (chatgpt.com / chat.openai.com).
// Built on the generic factory (providers/_generic.js). Selectors below are the
// documented ChatGPT DOM as of writing; if a turn is never read or the send never
// fires, these are the first things to re-check live (they change often).
//
// Notes:
//  - Turns carry data-message-author-role="user" | "assistant" on the message div.
//  - Composer is a contenteditable ProseMirror div (#prompt-textarea), NOT a
//    <textarea>, so the factory's contenteditable path is used.
//  - Send/stop buttons are identified by data-testid.
// eslint-disable-next-line no-unused-vars
const VSProvider = VSGeneric({
  id: "chatgpt",
  displayName: "ChatGPT",
  supportsVision: false, // flip to true only after a live screen_capture read is confirmed
  beta: false, // stable: no "unstable" pill on the status bar
  selectors: {
    userItem: '[data-message-author-role="user"]',
    assistantItem: '[data-message-author-role="assistant"]',
    thinking: '[data-thinking],[class*="thinking" i],[class*="reasoning" i]',
    editor: '#prompt-textarea, div[contenteditable="true"]',
    composer: "form",
    sendBtn: 'button[data-testid="send-button"], button[aria-label*="Send" i]',
    stopBtn: 'button[data-testid="stop-button"], button[aria-label*="Stop" i]',
    codeWrap: "pre",
    errorSurfaces: '[role="alert"],[class*="toast" i],[class*="error" i]',
  },
});
