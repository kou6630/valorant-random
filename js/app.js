// js/app.js

import "./home.js";
import "./agents-settings.js";
import "./lobby.js";
import "./stage-select.js";
import "./draw.js";
import "./personal-result.js";
import "./all-results.js";
import { db } from "./firebase.js";
import { ref, onValue, off } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

let watchedRoomId = null;
let stateBound = false;
let lastRoomState = null;
let watchTimerId = null;
let currentRoomRef = null;
let currentRoomCallback = null;

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

function getActiveScreenId() {
  const active = document.querySelector(".screen.active");
  return active?.id || "";
}

async function handleRoomState(data) {
  const state = data?.state;
  if (!state || state === lastRoomState) return;

  lastRoomState = state;

  if (state === "lobby") {
    showScreen("screen-lobby");
    return;
  }

  if (state === "stage-select") {
    const { initStageSelect } = await import("./stage-select.js");
    showScreen("screen-stage-select");
    initStageSelect(
      window.currentRoom,
      data.owner || window.currentOwnerId || "",
      window.currentPlayerId || ""
    );
    return;
  }

  if (state === "draw") {
    if (getActiveScreenId() === "screen-draw") return;
    const { startDrawAnimation } = await import("./draw.js");
    startDrawAnimation();
    return;
  }

  if (state === "result") {
    if (["screen-personal-result", "screen-all-results"].includes(getActiveScreenId())) return;

    const players = data.players || {};
    const spectators = data.spectators || {};
    const myId = window.currentPlayerId || "";
    const spectator = !players[myId] && !!spectators[myId];

    const { initPersonalResult } = await import("./personal-result.js");
    initPersonalResult(window.currentRoom, myId, spectator);
  }
}

function bindRoomStateWatcher() {
  if (stateBound) return;

  watchTimerId = window.setInterval(() => {
    const roomId = window.currentRoom;
    if (!roomId || roomId === watchedRoomId) return;

    if (currentRoomRef && currentRoomCallback) {
      off(currentRoomRef, "value", currentRoomCallback);
    }

    watchedRoomId = roomId;
    lastRoomState = null;
    currentRoomRef = ref(db, `rooms/${roomId}`);
    currentRoomCallback = async (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        showScreen("screen-home");
        return;
      }

      window.currentOwnerId = data.owner || "";
      await handleRoomState(data);
    };

    onValue(currentRoomRef, currentRoomCallback);
  }, 300);

  stateBound = true;
}

bindRoomStateWatcher();

window.showScreen = showScreen;
