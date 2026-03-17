// js/home.js

import { showScreen } from "./app.js";
import { initLobby } from "./lobby.js";
import { db } from "./firebase.js";
import { ref, get, set, remove } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const MAX_PLAYERS = 5;

let joinBusy = false;

function resetJoinSession() {
  window.currentRoom = "";
  window.currentPlayerId = "";
  window.currentOwnerId = "";
}

const nameInput = document.getElementById("playerName");
const passInput = document.getElementById("roomPass");

const joinBtn = document.getElementById("joinRoomBtn");
const openSettingsBtn = document.getElementById("openAgentSettingsBtn");

const NAME_KEY = "valorant_random_name";
const PASS_KEY = "valorant_random_pass";
const AGENT_SETTINGS_KEY = "valorant_agent_settings";
const LEGACY_AGENT_SETTINGS_KEY = "agentUnlockSettings";

function isEffectivelyEmptyRoom(data) {
  const players = Object.values(data?.players || {});
  const hasActivePlayer = players.some((player) => player && player.connected !== false);
  return !hasActivePlayer;
}

function getActivePlayerCount(data) {
  return Object.values(data?.players || {}).filter((player) => player && player.connected !== false).length;
}

async function cleanupEmptyRoom(roomRef, roomData) {
  if (!isEffectivelyEmptyRoom(roomData)) return false;

  await remove(roomRef);
  return true;
}

function loadLocal() {
  const savedName = localStorage.getItem(NAME_KEY);
  const savedPass = localStorage.getItem(PASS_KEY);

  if (savedName && nameInput) nameInput.value = savedName;
  if (savedPass && passInput) passInput.value = savedPass;
}

function saveLocal() {
  if (nameInput) localStorage.setItem(NAME_KEY, nameInput.value);
  if (passInput) localStorage.setItem(PASS_KEY, passInput.value);
}

function loadLocalAgentSettings() {
  try {
    const raw =
      localStorage.getItem(AGENT_SETTINGS_KEY) ||
      localStorage.getItem(LEGACY_AGENT_SETTINGS_KEY);

    if (!raw) return {};

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function joinRoom() {
  if (joinBusy || !nameInput || !passInput) return;

  const name = nameInput.value.trim();
  const pass = passInput.value.trim();

  if (!name) {
    alert("名前を入力してください");
    return;
  }

  if (!pass) {
    alert("合言葉を入力してください");
    return;
  }

  if (pass.length > 10) {
    alert("合言葉は10文字以内です");
    return;
  }

  joinBusy = true;
  if (joinBtn) joinBtn.disabled = true;

  try {
    saveLocal();

    const roomRef = ref(db, `rooms/${pass}`);
    let snap = await get(roomRef);

    if (snap.exists()) {
      const removed = await cleanupEmptyRoom(roomRef, snap.val());
      if (removed) {
        snap = await get(roomRef);
      }
    }

    if (!snap.exists()) {
      await set(roomRef, {
        createdAt: Date.now(),
        state: "lobby"
      });
    } else {
      const roomData = snap.val() || {};
      const roomState = roomData.state || "lobby";
      const activePlayerCount = getActivePlayerCount(roomData);

      if (roomState !== "lobby") {
        alert("この部屋は開始済みです");
        return;
      }

      if (activePlayerCount >= MAX_PLAYERS) {
        alert("満員です");
        return;
      }
    }

    window.currentRoom = pass;
    window.currentPlayerId = "";
    window.currentOwnerId = "";
    window.playerName = name;
    window.playerAgentSettings = loadLocalAgentSettings();

    await initLobby();

    if (!window.currentPlayerId) {
      throw new Error("ロビー初期化が完了しませんでした");
    }

    showScreen("screen-lobby");
  } catch (error) {
    console.error(error);
    resetJoinSession();
    alert(error?.message || "参加に失敗しました");
    showScreen("screen-home");
  } finally {
    joinBusy = false;
    if (joinBtn) joinBtn.disabled = false;
  }
}

joinBtn?.addEventListener("click", joinRoom);

openSettingsBtn?.addEventListener("click", () => {
  if (window.currentRoom) return;
  showScreen("screen-agent-settings");
});

passInput?.addEventListener("input", () => {
  if (passInput.value.length > 10) {
    passInput.value = passInput.value.slice(0, 10);
  }
});

nameInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    joinRoom();
  }
});

passInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    joinRoom();
  }
});

loadLocal();
