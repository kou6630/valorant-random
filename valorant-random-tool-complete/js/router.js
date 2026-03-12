// js/router.js

import { showScreen } from "./app.js";

const SCREEN_IDS = new Set([
  "screen-home",
  "screen-agent-settings",
  "screen-lobby",
  "screen-stage-select",
  "screen-draw",
  "screen-personal-result",
  "screen-all-results"
]);

export function goTo(screenId) {
  if (!SCREEN_IDS.has(screenId)) return;
  showScreen(screenId);
}

export function goHome() {
  showScreen("screen-home");
}

export function goAgentSettings() {
  showScreen("screen-agent-settings");
}

export function goLobby() {
  showScreen("screen-lobby");
}

export function goStageSelect() {
  showScreen("screen-stage-select");
}

export function goDraw() {
  showScreen("screen-draw");
}

export function goPersonalResult() {
  showScreen("screen-personal-result");
}

export function goAllResults() {
  showScreen("screen-all-results");
}