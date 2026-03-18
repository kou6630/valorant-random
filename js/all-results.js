// js/all-results.js

import { showScreen } from "./app.js";

const resultsArea = document.getElementById("allResultsList");
const rerollBtn = document.getElementById("rerollBtn");
const backBtn = document.getElementById("backToLobbyBtn");

let currentRoom = null;
let currentUserId = null;
let isOwner = false;
let backBusy = false;
const LOCAL_RESULTS_KEY = "valorant_last_results";

function cleanupResultsWatcher() {
}

function loadLocalResults(roomId) {
  if (window.lastDrawResults?.roomId === String(roomId || "")) {
    return window.lastDrawResults.results || null;
  }

  try {
    const raw = localStorage.getItem(LOCAL_RESULTS_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (String(parsed?.roomId || "") !== String(roomId || "")) {
      return null;
    }

    return parsed?.results || null;
  } catch {
    return null;
  }
}

export function initAllResults(roomId, userId, ownerId) {
  currentRoom = roomId;
  currentUserId = userId;
  isOwner = userId === ownerId;

  if (rerollBtn) {
    rerollBtn.style.display = "none";
    rerollBtn.disabled = true;
  }

  if (backBtn) {
    backBtn.disabled = false;
  }

  cleanupResultsWatcher();
  renderResults(loadLocalResults(roomId));
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
      ready: false,
      backToLobby: false
    };
  });

  return nextPlayers;
}

backBtn?.addEventListener("click", async () => {
  if (!currentRoom || backBusy) return;

  backBusy = true;
  backBtn.disabled = true;

  try {
    cleanupResultsWatcher();
    showScreen("screen-home");
  } catch (error) {
    console.error(error);
    alert("ロビー復帰に失敗しました");
  } finally {
    backBusy = false;
    if (backBtn) backBtn.disabled = false;
  }
});
