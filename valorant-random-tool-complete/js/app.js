// js/app.js

import "./home.js";
import "./agents-settings.js";
import "./lobby.js";
import "./stage-select.js";
import "./draw.js";
import "./personal-result.js";
import "./all-results.js";

const screens = [
  "screen-home",
  "screen-agent-settings",
  "screen-lobby",
  "screen-stage-select",
  "screen-draw",
  "screen-personal-result",
  "screen-all-results"
];

export function showScreen(screenId) {
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("active");
  });

  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add("active");
  }
}

window.showScreen = showScreen;