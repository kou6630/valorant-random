// js/all-results.js

import { db } from "./firebase.js";
import { showScreen } from "./app.js";
import { ref, onValue, update, off, remove } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const resultsArea = document.getElementById("allResultsList");
const rerollBtn = document.getElementById("rerollBtn");
const backBtn = document.getElementById("backToLobbyBtn");

let currentRoom = null;
let currentUserId = null;
let isOwner = false;
let resultsRef = null;
let resultsCallback = null;
let rerollBusy = false;

function cleanupResultsWatcher() {
  if (resultsRef && resultsCallback) {
    off(resultsRef, "value", resultsCallback);
  }

  resultsRef = null;
  resultsCallback = null;
}

export function initAllResults(roomId, userId, ownerId) {
  currentRoom = roomId;
  currentUserId = userId;
  isOwner = userId === ownerId;

  if (rerollBtn) {
    rerollBtn.style.display = isOwner ? "" : "none";
    rerollBtn.disabled = false;
  }

  cleanupResultsWatcher();
  renderResults(null);

  if (!roomId) return;

  resultsRef = ref(db, `rooms/${roomId}/results`);
  resultsCallback = (snapshot) => {
    const data = snapshot.val();
    renderResults(data);
  };

  onValue(resultsRef, resultsCallback);
}

function renderResults(data) {
  if (!resultsArea) return;

  resultsArea.innerHTML = "";

  if (!data) return;

  Object.values(data).forEach((player) => {
    const card = document.createElement("div");
    card.className = "result-card";

    const name = document.createElement("div");
    name.className = "result-name";
    name.textContent = player?.name || "-";

    const img = document.createElement("img");
    img.src = `img/agents/${player?.agent || ""}.png`;
    img.className = "result-agent";
    img.alt = player?.agentName || player?.agent || "agent";

    card.appendChild(name);
    card.appendChild(img);

    resultsArea.appendChild(card);
  });
}

rerollBtn?.addEventListener("click", async () => {
  if (!isOwner || !currentRoom || rerollBusy) return;

  rerollBusy = true;
  rerollBtn.disabled = true;

  try {
    await remove(ref(db, `rooms/${currentRoom}/results`));
    await update(ref(db, `rooms/${currentRoom}`), {
      state: "stage-select",
      roleComp: null,
      selectedComp: null,
      selectedRoleComp: null,
      selectedStage: null
    });
  } catch (error) {
    console.error(error);
    alert("再抽選に失敗しました");
  } finally {
    rerollBusy = false;
    if (rerollBtn) rerollBtn.disabled = false;
  }
});

backBtn?.addEventListener("click", () => {
  cleanupResultsWatcher();
  showScreen("screen-lobby");
});
