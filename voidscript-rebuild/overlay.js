// SPDX-License-Identifier: GPL-3.0-or-later
// VoidScript overlay controller (self-made, clean-room rebuild — Phase 5).
//
// Builds and manages the in-page UI: the bar (Start/Stop + status), per-turn
// result chips, and the command-masking helpers. Provider-agnostic — the agent
// core (Phase 6) constructs it, mounts it near the site's composer, and drives
// it. No site specifics live here; styling is in overlay.css.
(function (root) {
  "use strict";

  const ICONS = { read: "🔍", edit: "✏️", screen: "📷", generate: "✨", roblox: "🧩", tool: "🔧" };
  const MARK_SVG =
    '<svg class="void-bar__mark" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<defs><linearGradient id="vbr" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#9aa8ff"/><stop offset=".55" stop-color="#7c8cff"/><stop offset="1" stop-color="#5b46f0"/>' +
    '</linearGradient><radialGradient id="vbv" cx=".5" cy=".5" r=".5">' +
    '<stop offset="0" stop-color="#05050a"/><stop offset=".7" stop-color="#0c0c16"/><stop offset="1" stop-color="#1a1730"/>' +
    '</radialGradient></defs>' +
    '<circle cx="64" cy="64" r="33" fill="url(#vbv)"/>' +
    '<circle cx="64" cy="64" r="33" fill="none" stroke="url(#vbr)" stroke-width="6"/>' +
    '<g stroke="url(#vbr)" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
    '<polyline points="55,52 43,64 55,76"/><polyline points="73,52 85,64 73,76"/><line x1="68" y1="49" x2="60" y2="79"/>' +
    "</g></svg>";

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const HIDDEN = "void-cmd-hidden";

  class VoidOverlay {
    constructor(opts) {
      opts = opts || {};
      this.onToggle = opts.onToggle || function () {};
      this.running = false;
      this._build();
    }

    _build() {
      const root = document.createElement("div");
      root.id = "void-root";
      const bar = document.createElement("div");
      bar.className = "void-bar";
      bar.innerHTML =
        MARK_SVG +
        '<span class="void-bar__brand">Void<b>Script</b></span>' +
        '<span class="void-bar__status"><span class="void-bar__dot"></span>' +
        '<span class="void-bar__status-text">Idle</span></span>' +
        '<button class="void-bar__btn" type="button">Start session</button>';
      root.appendChild(bar);
      this.root = root;
      this.bar = bar;
      this.dot = bar.querySelector(".void-bar__dot");
      this.statusText = bar.querySelector(".void-bar__status-text");
      this.btn = bar.querySelector(".void-bar__btn");
      this.btn.addEventListener("click", () => {
        this.setRunning(!this.running);
        this.onToggle(this.running);
      });
    }

    /** Insert the bar relative to a site anchor. where: "before" | "prepend" | "append". */
    mount(anchor, where) {
      if (!anchor || !anchor.parentNode) return;
      if (where === "prepend") anchor.insertBefore(this.root, anchor.firstChild);
      else if (where === "append") anchor.appendChild(this.root);
      else anchor.parentNode.insertBefore(this.root, anchor); // default: before
    }

    /** state: "idle" | "ok" | "working" | "error" | "paused". */
    setStatus(text, state) {
      this.statusText.textContent = text;
      this.dot.className = "void-bar__dot" + (state && state !== "idle" ? " is-" + state : "");
    }

    setRunning(on) {
      this.running = !!on;
      this.btn.textContent = on ? "Stop" : "Start session";
      this.btn.classList.toggle("is-running", !!on);
    }

    /** Build a result chip element (caller attaches it to the turn). */
    makeChip(o) {
      o = o || {};
      const cat = o.category || "tool";
      const done = o.state === "done";
      const cls = done ? (o.ok === false ? "is-error" : "is-done") : "is-running";
      const label = done ? (o.ok === false ? "failed" : "done") : "running";
      const chip = document.createElement("span");
      chip.className = "void-chip " + cls;
      chip.setAttribute("data-cat", cat);
      chip.innerHTML =
        '<span class="void-chip__ico">' + (ICONS[cat] || ICONS.tool) + "</span>" +
        '<span class="void-chip__tool">' + esc(o.tool || "tool") + "</span>" +
        '<span class="void-chip__state">' + label + "</span>";
      return chip;
    }

    /** Build a chip and attach it to a turn element; returns the chip. */
    attachChip(target, o) {
      const chip = this.makeChip(o);
      if (target && target.appendChild) target.appendChild(chip);
      return chip;
    }

    /** Update an existing chip in place (e.g. running -> done). */
    updateChip(chip, o) {
      if (!chip) return;
      o = o || {};
      const done = o.state === "done";
      chip.className = "void-chip " + (done ? (o.ok === false ? "is-error" : "is-done") : "is-running");
      const st = chip.querySelector(".void-chip__state");
      if (st) st.textContent = done ? (o.ok === false ? "failed" : "done") : "running";
    }

    /** Provider-independent hider: find every turn whose text carries our marker
     *  (`stem`) and hide the whole message turn — works on any site without
     *  relying on per-provider selectors. Returns how many turns it hid. */
    hideMarked(stem) {
      stem = stem || "⟦VOID";
      const root = document.body || document.documentElement;
      if (!root) return 0;
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) =>
          n.nodeValue && n.nodeValue.indexOf(stem) >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
      });
      const nodes = [];
      let n;
      while ((n = tw.nextNode())) nodes.push(n);
      let count = 0;
      for (const textNode of nodes) {
        // Climb from the marker text up to the turn-level element: the largest
        // ancestor still starting with the marker whose PARENT also holds a
        // separate, unmarked turn (the assistant reply) as a sibling.
        let el = textNode.parentElement, chosen = null, depth = 0;
        while (el && depth < 15) {
          if (!(el.textContent || "").replace(/^\s+/, "").startsWith(stem)) break;
          chosen = el;
          const parent = el.parentElement;
          if (!parent) break;
          const siblingTurn = Array.prototype.some.call(
            parent.children,
            (ch) => ch !== el && (ch.textContent || "").trim().length > 20 && (ch.textContent || "").indexOf(stem) < 0
          );
          if (siblingTurn) break; // el is the turn; don't climb into the message list
          el = parent;
          depth++;
        }
        if (chosen && !chosen.classList.contains(HIDDEN)) {
          chosen.classList.add(HIDDEN);
          count++;
        }
      }
      return count;
    }

    /** Hide the raw ```void block the model emitted; the chip replaces it. */
    mask(el) { if (el) el.classList.add(HIDDEN); }
    unmask(el) { if (el) el.classList.remove(HIDDEN); }

    destroy() { if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root); }
  }

  VoidOverlay.ICONS = ICONS;
  if (typeof module !== "undefined" && module.exports) module.exports = VoidOverlay;
  root.VoidOverlay = VoidOverlay;
})(typeof globalThis !== "undefined" ? globalThis : this);
