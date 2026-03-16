// js/personal-result.js

import { db } from "./firebase.js";
import { showScreen } from "./app.js";
import { initAllResults } from "./all-results.js";
import { ref, onValue, off } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const personalAgentImage = document.getElementById("personalAgentImage");
const personalAgentName = document.getElementById("personalAgentName");
const toAllResultsBtn = document.getElementById("toAllResultsBtn");

let currentRoomId = null;
let currentPlayerId = null;
let isSpectator = false;
let currentResultRef = null;
let currentResultCallback = null;

function cleanupPersonalResultWatcher() {
  if (currentResultRef && currentResultCallback) {
    off(currentResultRef, "value", currentResultCallback);
  }

  currentResultRef = null;
  currentResultCallback = null;
}

export function initPersonalResult(roomId, playerId, spectator = false) {
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

  if (isSpectator) {
    initAllResults(roomId, playerId, window.currentOwnerId || "");
    showScreen("screen-all-results");
    return;
  }

  if (!roomId || !playerId) {
    showScreen("screen-lobby");
    return;
  }

  currentResultRef = ref(db, `rooms/${roomId}/results/${playerId}`);
  currentResultCallback = (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    if (personalAgentImage) {
      personalAgentImage.src = `img/agents/${data.agent}.png`;
      personalAgentImage.alt = data.name || data.agent || "agent";
    }

    if (personalAgentName) {
      personalAgentName.textContent = data.agentName || data.agent || "-";
    }
  };

  onValue(currentResultRef, currentResultCallback);
  showScreen("screen-personal-result");
}

toAllResultsBtn?.addEventListener("click", () => {
  cleanupPersonalResultWatcher();
  initAllResults(currentRoomId, currentPlayerId, window.currentOwnerId || "");
  showScreen("screen-all-results");
});
