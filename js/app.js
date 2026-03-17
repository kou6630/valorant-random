// js/app.js

import "./home.js";
import "./lobby.js";
import "./stage-select.js";
import "./draw.js";
import "./personal-result.js";
import "./all-results.js";
import { db } from "./firebase.js";
import { ref, onValue, off } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

let watchedRoomId = null;
let stateBound = false;
let roomStatePropertyBound = false;
let internalCurrentRoom = "";
let lastRoomState = null;
let currentRoomRef = null;
let currentRoomCallback = null;
let agentSettingsModulePromise = null;

const screens = [
  "screen-home",
  "screen-agent-settings",
  "screen-lobby",
  "screen-stage-select",
  "screen-draw",
  "screen-personal-result",
  "screen-all-results"
];

const RESULT_SCREENS = new Set([
  "screen-personal-result",
  "screen-all-results"
]);

export async function showScreen(screenId) {
  if (screenId === "screen-agent-settings") {
    await ensureAgentSettingsModule();
  }

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

async function ensureAgentSettingsModule() {
  if (!agentSettingsModulePromise) {
    agentSettingsModulePromise = import("./agents-settings.js").catch((error) => {
      console.error(error);
      alert("未開放エージェント設定の読み込みに失敗しました");
      agentSettingsModulePromise = null;
      throw error;
    });
  }

  const module = await agentSettingsModulePromise;
  module?.initAgentSettings?.();
  return module;
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
    const activeScreenId = getActiveScreenId();

    if (RESULT_SCREENS.has(activeScreenId)) return;
    if (activeScreenId === "screen-draw") return;

    const myId = window.currentPlayerId || "";
    const { initPersonalResult } = await import("./personal-result.js");
    initPersonalResult(window.currentRoom, myId);
  }
}

function detachRoomWatcher() {
  if (currentRoomRef && currentRoomCallback) {
    off(currentRoomRef, "value", currentRoomCallback);
  }

  watchedRoomId = null;
  lastRoomState = null;
  currentRoomRef = null;
  currentRoomCallback = null;
}

function resetRoomWatchState() {
  detachRoomWatcher();
  internalCurrentRoom = "";
  window.currentRoom = "";
  window.currentOwnerId = "";
  window.currentPlayerId = "";
}

function attachRoomWatcher(roomId) {
  if (!roomId) {
    detachRoomWatcher();
    return;
  }

  if (roomId === watchedRoomId && currentRoomRef && currentRoomCallback) return;

  detachRoomWatcher();

  watchedRoomId = roomId;
  lastRoomState = null;
  currentRoomRef = ref(db, `rooms/${roomId}`);
  currentRoomCallback = async (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      resetRoomWatchState();
      showScreen("screen-home");
      return;
    }

    window.currentOwnerId = data.owner || "";
    await handleRoomState(data);
  };

  onValue(currentRoomRef, currentRoomCallback);
}

function bindRoomStateWatcher() {
  if (stateBound) return;

  internalCurrentRoom = String(window.currentRoom || "");

  if (!roomStatePropertyBound) {
    Object.defineProperty(window, "currentRoom", {
      configurable: true,
      enumerable: true,
      get() {
        return internalCurrentRoom;
      },
      set(value) {
        const nextRoomId = String(value || "");
        if (nextRoomId === internalCurrentRoom) return;

        internalCurrentRoom = nextRoomId;
        attachRoomWatcher(nextRoomId);
      }
    });

    roomStatePropertyBound = true;
  }

  if (internalCurrentRoom) {
    attachRoomWatcher(internalCurrentRoom);
  }

  stateBound = true;
}

bindRoomStateWatcher();

window.showScreen = showScreen;
