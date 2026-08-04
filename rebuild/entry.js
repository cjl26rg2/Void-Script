// SPDX-License-Identifier: GPL-3.0-or-later
// VoidScript content-script entry (self-made, clean-room rebuild — Phase 7).
//
// The seam. Loaded LAST in the content_scripts list, after (new) config.js +
// parser.js, the provider adapter (which defines the global ZSProvider), and the
// rebuilt overlay.js + core.js. It wires the tested modules to the live page:
//   - builds the overlay and mounts it near the site's composer
//   - points callTool / getTools at the background relay (vs-call / vs-tools)
//   - constructs the VoidAgent and hooks the bar's Start/Stop
//   - reflects bridge/Studio status on the bar while idle
//
// Browser-only (chrome + DOM). The wiring is exercised headlessly by
// test_entry.js with mocked globals; the full drive is validated live.
(function () {
  "use strict";

  // No provider adapter on this page => nothing to do.
  if (typeof ZSProvider === "undefined" || !ZSProvider) return;
  const provider = ZSProvider;
  const diag = (tag, data) => { try { console.debug("[void]", tag, data || ""); } catch {} };
  if (provider.init) provider.init({ diag });

  // ── bridge relay via the background service worker ──
  const callTool = (tool, params) =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "vs-call", tool, params }, (res) => {
        if (chrome.runtime.lastError) return resolve({ ok: false, output: "bridge offline" });
        resolve(res || { ok: false, output: "no response from the bridge" });
      });
    });
  const getTools = () =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "vs-tools" }, (res) => {
        if (chrome.runtime.lastError) return resolve([]);
        resolve((res && res.tools) || []);
      });
    });

  // ── UI + agent ──
  const overlay = new VoidOverlay({
    onToggle: (running) => (running ? agent.start() : agent.stop()),
  });
  const agent = new VoidAgent({ provider, overlay, parse: VoidParse, config: VoidConfig, callTool, getTools, diag });

  // ── mount the bar near the composer (SPA: retry until it exists) ──
  function anchorEl() {
    const a =
      (provider.barAnchor && provider.barAnchor()) ||
      (provider.barMount && provider.barMount()) ||
      (provider.composerFrame && provider.composerFrame());
    if (!a) return null;
    if (a.nodeType === 1) return a; // an element
    if (a.parent && a.parent.nodeType === 1) return a.parent; // {parent, before} shape
    return null;
  }
  function tryMount() {
    if (document.getElementById("void-root")) return true;
    const el = anchorEl();
    if (!el) return false;
    overlay.mount(el, "before");
    diag("mounted", {});
    return true;
  }
  if (!tryMount()) {
    const t = setInterval(() => { if (tryMount()) clearInterval(t); }, 800);
  }

  // ── reflect bridge/Studio status on the bar while idle ──
  function paintIdleStatus(s) {
    if (agent.running) return; // never stomp the working status
    if (!s || !s.connected) overlay.setStatus("Bridge offline — run start.bat", "error");
    else if (s.studio === false) overlay.setStatus("Studio not connected", "paused");
    else overlay.setStatus("Connected · Studio ready", "ok");
  }
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "zs-status") paintIdleStatus(msg);
  });
  chrome.runtime.sendMessage({ type: "status" }, (s) => {
    if (!chrome.runtime.lastError) paintIdleStatus(s);
  });

  // expose for the headless wiring test only
  try {
    if (typeof globalThis !== "undefined" && globalThis.__VOID_EXPOSE__) {
      globalThis.__void = { provider, overlay, agent, callTool, getTools };
    }
  } catch {}
})();
