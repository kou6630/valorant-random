// js/personal-result.js

import { db } from "./firebase.js";
import { showScreen } from "./app.js";
import { initAllResults } from "./all-results.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const personalAgentImage = document.getElementById("personalAgentImage");
const personalAgentName = document.getElementById("personalAgentName");
const toAllResultsBtn = document.getElementById("toAllResultsBtn");

let currentRoomId = null;
let currentPlayerId = null;
let isSpectator = false;

export function initPersonalResult(roomId, playerId, spectator = false) {
  currentRoomId = roomId;
  currentPlayerId = playerId;
  isSpectator = spectator;

  if (isSpectator) {
    initAllResults(roomId, playerId, window.currentOwnerId || "");
    showScreen("screen-all-results");
    return;
  }

  const myResultRef = ref(db, `rooms/${roomId}/results/${playerId}`);

  onValue(myResultRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    personalAgentImage.src = `img/agents/${data.agent}.png`;
    personalAgentImage.alt = data.name || data.agent;
    personalAgentName.textContent = data.agentName || data.agent || "-";
  });

  showScreen("screen-personal-result");
}

toAllResultsBtn.addEventListener("click", () => {
  initAllResults(currentRoomId, currentPlayerId, window.currentOwnerId || "");
  showScreen("screen-all-results");
});
