// SPDX-License-Identifier: GPL-3.0-or-later
// Inside model.html: draws whatever model the VoidScript panel posts to it.
"use strict";
const view = VSModelView.create(document.getElementById("v"));
window.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.vs !== "model") return;
  if (d.type === "show" && d.spec) view.show(d.spec);
  if (d.type === "reset") view.reset();
});
parent.postMessage({ vs: "model", type: "ready" }, "*");
