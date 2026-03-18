// js/personal-result.js

import { db } from "./firebase.js";
import { showScreen } from "./app.js";
import { initAllResults } from "./all-results.js";
import { ref, onValue, off } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const personalAgentImage = document.getElementById("personalAgentImage");
const personalAgentName = document.getElementById("personalAgentName");
const personalResultAutoText = document.getElementById("personalResultAutoText");
const toAllResultsBtn = document.getElementById("toAllResultsBtn");

let currentRoomId = null;
let currentPlayerId = null;
let isSpectator = false;
let currentResultRef = null;
let currentResultCallback = null;
let autoAdvanceTimer = null;

function cleanupPersonalResultWatcher() {
  if (currentResultRef && currentResultCallback) {
    off(currentResultRef, "value", currentResultCallback);
  }

  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
  }

  autoAdvanceTimer = null;
  currentResultRef = null;
  currentResultCallback = null;
}

export function initPersonalResult(roomId, playerId, spectator = false, options = {}) {
  currentRoomId = roomId;
  currentPlayerId = playerId;
  isSpectator = spectator;

  cleanupPersonalResultWatcher();

  if (personalAgentImage) {
    personalAgentImage.removeAttribute("src");
    personalAgentImage.alt = "";
  }

  if (personalAgentName) {
    personalAgentName.textContent = "-";
  }

  const autoAdvance = options?.autoAdvance === true;
  const displayMs = Number(options?.displayMs) > 0 ? Number(options.displayMs) : 5000;
  const confirmedResult = options?.confirmedResult || null;

  if (personalResultAutoText) {
    personalResultAutoText.hidden = !autoAdvance;
  }

  if (toAllResultsBtn) {
    toAllResultsBtn.hidden = autoAdvance;
    toAllResultsBtn.setAttribute("aria-hidden", autoAdvance ? "true" : "false");
    toAllResultsBtn.tabIndex = autoAdvance ? -1 : 0;
  }

  if (isSpectator) {
    initAllResults(roomId, playerId, window.currentOwnerId || "");
    showScreen("screen-all-results");
    return;
  }

  if (!roomId || !playerId) {
    showScreen("screen-lobby");
    return;
  }

  const applyResult = (data) => {
    if (!data) return;

    if (personalAgentImage) {
      personalAgentImage.src = `img/agents/${data.agent}.png`;
      personalAgentImage.alt = data.name || data.agent || "agent";
    }

    if (personalAgentName) {
      personalAgentName.textContent = data.agentName || data.agent || "-";
    }
  };

  if (confirmedResult) {
    applyResult(confirmedResult);
  }

  currentResultRef = ref(db, `rooms/${roomId}/results/${playerId}`);
  currentResultCallback = (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    applyResult(data);
  };

  onValue(currentResultRef, currentResultCallback);
  showScreen("screen-personal-result");

  if (autoAdvance) {
    autoAdvanceTimer = setTimeout(() => {
      cleanupPersonalResultWatcher();
      initAllResults(currentRoomId, currentPlayerId, window.currentOwnerId || "");
      showScreen("screen-all-results");
    }, displayMs);
  }
}

toAllResultsBtn?.addEventListener("click", () => {
  cleanupPersonalResultWatcher();
  initAllResults(currentRoomId, currentPlayerId, window.currentOwnerId || "");
  showScreen("screen-all-results");
});
