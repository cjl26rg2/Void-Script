// SPDX-License-Identifier: GPL-3.0-or-later
// Inside ui-view.html: previews whatever ScreenGui the VoidScript panel posts.
"use strict";
window.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.vs === "ui" && d.type === "show" && d.spec) VSUI.render(document.getElementById("v"), d.spec);
});
parent.postMessage({ vs: "ui", type: "ready" }, "*");
