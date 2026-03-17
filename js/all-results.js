// js/all-results.js

import { db } from "./firebase.js";
import { showScreen } from "./app.js";
import { ref, onValue, update, off, remove, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const resultsArea = document.getElementById("allResultsList");
const rerollBtn = document.getElementById("rerollBtn");
const backBtn = document.getElementById("backToLobbyBtn");

let currentRoom = null;
let currentUserId = null;
let isOwner = false;
let resultsRef = null;
let resultsCallback = null;
let rerollBusy = false;
let backBusy = false;

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

  if (backBtn) {
    backBtn.disabled = false;
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

function buildLobbyPlayerReset(players) {
  const nextPlayers = {};

  Object.entries(players || {}).forEach(([id, player]) => {
    if (!player || player.connected === false) return;

    nextPlayers[id] = {
      ...player,
      ready: false
    };
  });

  return nextPlayers;
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

backBtn?.addEventListener("click", async () => {
  if (!currentRoom || backBusy) return;

  backBusy = true;
  backBtn.disabled = true;

  try {
    if (isOwner) {
      const roomRef = ref(db, `rooms/${currentRoom}`);
      const roomSnap = await get(roomRef);
      const roomData = roomSnap.exists() ? roomSnap.val() : null;

      if (roomData) {
        await remove(ref(db, `rooms/${currentRoom}/results`));
        await update(roomRef, {
          state: "lobby",
          stage: null,
          roleComp: null,
          selectedComp: null,
          selectedRoleComp: null,
          selectedStage: null,
          players: buildLobbyPlayerReset(roomData.players || {}),
          peakLobbyPlayerCount: Object.keys(buildLobbyPlayerReset(roomData.players || {})).length
        });
      }
    }

    cleanupResultsWatcher();
    showScreen("screen-lobby");
  } catch (error) {
    console.error(error);
    alert("ロビー復帰に失敗しました");
  } finally {
    backBusy = false;
    if (backBtn) backBtn.disabled = false;
  }
});
