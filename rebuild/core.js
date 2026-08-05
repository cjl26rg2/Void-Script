// SPDX-License-Identifier: GPL-3.0-or-later
// VoidScript agent core (self-made, clean-room rebuild — Phase 6).
//
// The run loop that ties everything together. On start it sends our system
// prompt, then repeatedly: reads the AI's latest reply (via the provider
// adapter), parses it (VoidParse), and acts —
//   ok       -> run the tool through the bridge, mask the raw ```void block,
//               drop a chip, inject a ```void-result turn for the model to read
//   error    -> send the matching VoidConfig.feedback
//   multi    -> ask for one command at a time
//   partial  -> wait (still streaming)
//   none     -> the model is done; go idle
//
// Everything it touches is injected (provider, overlay, parse, config, callTool,
// getTools), so the loop is unit-testable with mocks and the content script just
// wires in the real implementations. No DOM or site specifics live here.
(function (root) {
  "use strict";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isOffline = (res) => !!res && res.ok === false && /bridge offline|not connected|unreachable/i.test(res.output || "");

  class VoidAgent {
    constructor(deps) {
      deps = deps || {};
      this.provider = deps.provider;
      this.overlay = deps.overlay;
      this.parse = deps.parse; // VoidParse
      this.config = deps.config; // VoidConfig
      this.callTool = deps.callTool; // (tool, params) -> Promise<{ok, output}>
      this.getTools = deps.getTools; // () -> Promise<[{name,...}]>
      this.diag = deps.diag || function () {};
      this.pollMs = deps.pollMs || 400;
      this.autoWatch = deps.autoWatch !== false;

      this.running = false;
      this.tools = [];
      this._names = new Set();
      this._processed = new WeakMap(); // turn item -> last text handled (avoids re-processing)
    }

    async start() {
      if (this.running) return;
      this.running = true;
      this.overlay.setRunning(true);
      this.overlay.setStatus("Starting…", "working");

      this.tools = (await this.getTools()) || [];
      this._names = new Set();
      for (const t of this.tools) {
        if (!t || !t.name) continue;
        this._names.add(t.name);
        if (t.name.includes("/")) this._names.add(t.name.split("/").pop());
      }

      const prompt = this.config.buildSystemPrompt({ siteName: this.provider.displayName, tools: this.tools });
      await this.provider.typeAndSend(prompt);
      this.overlay.setStatus("Waiting for the model…", "working");
      this.diag("start", { tools: this.tools.length });

      if (this.autoWatch) this._watch();
    }

    stop() {
      this.running = false;
      this.overlay.setRunning(false);
      this.overlay.setStatus("Stopped", "idle");
      this.diag("stop", {});
    }

    async _watch() {
      while (this.running) {
        try {
          await this._tick();
        } catch (e) {
          this.diag("tick.error", { msg: String((e && e.message) || e) });
        }
        await sleep(this.pollMs);
      }
    }

    // One processing step. Returns a short token describing what happened
    // (used by tests and diagnostics).
    // Hide the user turns the agent injected (system prompt, tool results,
    // feedback) so the human never sees them. Only USER turns are touched, and
    // only when their text carries our marker — assistant replies are never hidden.
    _hideInjected() {
      const p = this.provider;
      if (!p.allItems || !p.isUserItem) return;
      const re = this.config.hideRe;
      if (!re) return;
      const items = p.allItems();
      let hidden = 0;
      for (const item of items) {
        if (!p.isUserItem(item)) continue;
        const text = p.itemText ? p.itemText(item) : (item.textContent || "");
        if (re.test(text)) { this.overlay.mask(item); hidden++; }
      }
      // Log when the turn count changes so a selector mismatch (turns: 0) is obvious.
      if (items.length !== this._lastItemCount) {
        this._lastItemCount = items.length;
        this.diag("scan", { turns: items.length, hidden });
      }
    }

    async _tick() {
      if (!this.running) return "stopped";
      this._hideInjected();
      const read = this.provider.readAssistant();
      if (!read || !read.present) return "waiting";
      if (this.provider.isGenerating && this.provider.isGenerating()) {
        this.overlay.setStatus("Agent is working…", "working");
        return "generating";
      }
      const item = read.item;
      const text = read.reply || "";
      if (this._processed.get(item) === text) return "idle";

      const parsed = this.parse.parse(text);
      this.diag("turn", { textLen: text.length, parse: parsed.status, tool: parsed.command && parsed.command.tool });
      if (parsed.status === "partial") return "partial";

      this._processed.set(item, text);
      switch (parsed.status) {
        case "none":
          this.overlay.setStatus("Done", "ok");
          return "idle";
        case "multi":
          await this._feedback(this.config.feedback.multiTool(parsed.tools));
          return "feedback:multi";
        case "error":
          await this._feedback(this.config.feedback.parseError(parsed.reason));
          return "feedback:" + parsed.reason;
        case "ok":
          return await this._run(parsed.command, item);
        default:
          return "none";
      }
    }

    async _run(cmd, item) {
      if (!this._known(cmd.tool)) {
        await this._feedback(this.config.feedback.unknownTool(cmd.tool, [...this._names]));
        return "feedback:unknown";
      }
      const category = this.config.toolCategory(cmd.tool);
      const spot = this.provider.findToolBlockSpot && this.provider.findToolBlockSpot(item);
      if (spot && spot.ref) this.overlay.mask(spot.ref);
      const chip = this.overlay.attachChip(item, { tool: cmd.tool, category, state: "running" });
      this.overlay.setStatus("Running " + cmd.tool + "…", "working");

      const res = await this.callTool(cmd.tool, cmd.params);
      if (isOffline(res)) {
        this.overlay.updateChip(chip, { state: "done", ok: false });
        await this._feedback(this.config.feedback.bridgeOffline);
        this.overlay.setStatus("Bridge offline", "error");
        this.stop();
        return "offline";
      }
      this.overlay.updateChip(chip, { state: "done", ok: res.ok });
      await this.provider.typeAndSend(this.config.formatResult(res));
      this.overlay.setStatus("Waiting for the model…", "working");
      this.diag("ran", { tool: cmd.tool, ok: res.ok });
      return "ran:" + cmd.tool;
    }

    async _feedback(text) {
      await this.provider.typeAndSend(text);
      this.overlay.setStatus("Waiting for the model…", "working");
    }

    _known(tool) {
      if (this._names.has(tool)) return true;
      const bare = tool.includes("/") ? tool.split("/").pop() : tool;
      return this._names.has(bare);
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = VoidAgent;
  root.VoidAgent = VoidAgent;
})(typeof globalThis !== "undefined" ? globalThis : this);
