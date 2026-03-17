// js/lobby.js

import { db } from "./firebase.js";
import { showScreen } from "./app.js";
import { initStageSelect } from "./stage-select.js";

import {
  ref,
  push,
  set,
  get,
  update,
  onValue,
  remove,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const playerList = document.getElementById("playerList");
const spectatorList = document.getElementById("spectatorList");

const readyBtn = document.getElementById("readyBtn");
const cancelReadyBtn = document.getElementById("cancelReadyBtn");
const stageBtn = document.getElementById("goToStageSelectBtn");

const lobbyPassText = document.getElementById("lobbyRoomPass");
const lobbyOwnerText = document.getElementById("lobbyOwnerName");

const CLIENT_ID_KEY = "valorant_random_client_id";
const MAX_PLAYERS = 5;

let roomId = null;
let playerId = null;
let isOwner = false;
let isPlayer = false;
let watchBound = false;
let unwatchLobby = null;
let actionBusy = false;
let leaveHandled = false;

const PRE_DRAW_STATES = new Set(["lobby", "stage-select"]);

export async function initLobby() {
  roomId = window.currentRoom;
  const name = (window.playerName || "").trim();
  const clientId = getClientId();
  const agentSettings = getPlayerAgentSettings();

  playerId = null;
  isOwner = false;
  isPlayer = false;
  leaveHandled = false;

  if (!roomId || !name) {
    showScreen("screen-home");
    return;
  }

  if (lobbyPassText) {
    lobbyPassText.textContent = roomId;
  }

  try {
    const roomRef = ref(db, `rooms/${roomId}`);
    const roomSnap = await get(roomRef);
    const roomData = roomSnap.exists() ? roomSnap.val() : null;

    if (!roomData) {
      showScreen("screen-home");
      return;
    }

    const players = roomData.players || {};
    const roomState = roomData.state || "lobby";
    const activePlayerCount = getActivePlayerCount(players);
    const existingPlayer = findEntryByClientId(players, clientId, isActivePlayerEntry);

    if (existingPlayer) {
      isPlayer = true;
      playerId = existingPlayer.id;

      await update(ref(db, `rooms/${roomId}/players/${playerId}`), {
        name,
        clientId,
        ready: false,
        connected: true,
        agentSettings
      });

      bindDisconnect(ref(db, `rooms/${roomId}/players/${playerId}`));
    } else if (roomState === "lobby" && activePlayerCount < MAX_PLAYERS) {
      isPlayer = true;

      const newPlayerRef = push(ref(db, `rooms/${roomId}/players`));
      playerId = newPlayerRef.key;

      await set(newPlayerRef, {
        id: playerId,
        name,
        clientId,
        ready: false,
        connected: true,
        joinedAt: Date.now(),
        agentSettings
      });

      bindDisconnect(newPlayerRef);
    } else {
      alert("満員です");
      showScreen("screen-home");
      return;
    }

    const latestRoomSnap = await get(roomRef);
    const latestRoomData = latestRoomSnap.val() || {};
    const nextOwnerId = getValidOwnerId(
      latestRoomData.owner,
      latestRoomData.players || {}
    );

    if (nextOwnerId !== latestRoomData.owner) {
      await update(roomRef, { owner: nextOwnerId || null });
    }

    isOwner = nextOwnerId === playerId;
    window.currentPlayerId = playerId || "";
    window.currentOwnerId = nextOwnerId || "";

    watchLobby();

    if (!watchBound) {
      bindLobbyEvents();
      watchBound = true;
    }
  } catch (error) {
    console.error(error);
    alert("ロビー参加に失敗しました");
    showScreen("screen-home");
  }
}

function getPlayerAgentSettings() {
  const settings = window.playerAgentSettings;
  return settings && typeof settings === "object" ? settings : {};
}

function getClientId() {
  let clientId = sessionStorage.getItem(CLIENT_ID_KEY);

  if (!clientId) {
    clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(CLIENT_ID_KEY, clientId);
  }

  return clientId;
}

function findEntryByClientId(entries, clientId, isActive = () => true) {
  return Object.values(entries || {}).find((entry) => entry?.clientId === clientId && isActive(entry)) || null;
}

function isActivePlayerEntry(entry) {
  return !!entry && entry.connected !== false;
}

function getActivePlayerCount(entries) {
  return Object.values(entries || {}).filter(isActivePlayerEntry).length;
}

function isEffectivelyEmptyRoom(players) {
  return getActivePlayerCount(players) === 0;
}

function bindDisconnect(targetRef) {
  onDisconnect(targetRef).remove().catch(() => {});
}

function getOrderedEntries(entries, ownerId = "") {
  return Object.values(entries || {})
    .filter((entry) => entry && entry.connected !== false)
    .sort((a, b) => {
      if (a.id === ownerId && b.id !== ownerId) return -1;
      if (a.id !== ownerId && b.id === ownerId) return 1;

      const aJoinedAt = Number(a.joinedAt || 0);
      const bJoinedAt = Number(b.joinedAt || 0);

      if (aJoinedAt !== bJoinedAt) return aJoinedAt - bJoinedAt;
      return String(a.id || "").localeCompare(String(b.id || ""), "ja");
    });
}

function getValidOwnerId(ownerId, players) {
  if (ownerId && players?.[ownerId] && isActivePlayerEntry(players[ownerId])) return ownerId;
  return getNextOwnerId(players);
}

function getNextOwnerId(players, excludeId = "") {
  const orderedPlayers = getOrderedEntries(players).filter(
    (player) => player.id !== excludeId && isActivePlayerEntry(player)
  );
  return orderedPlayers[0]?.id || "";
}

async function ensureRoomIntegrity(data) {
  if (!roomId || !data) return;

  const roomRef = ref(db, `rooms/${roomId}`);
  const players = data.players || {};
  const roomState = data.state || "lobby";
  const activePlayerCount = getActivePlayerCount(players);
  const peakLobbyPlayerCount = Number(data.peakLobbyPlayerCount || 0);

  if (isEffectivelyEmptyRoom(players)) {
    await remove(roomRef).catch(() => {});
    return;
  }

  if (PRE_DRAW_STATES.has(roomState)) {
    if (peakLobbyPlayerCount > 0 && activePlayerCount < peakLobbyPlayerCount) {
      await remove(roomRef).catch(() => {});
      return;
    }

    if (activePlayerCount > peakLobbyPlayerCount) {
      await update(roomRef, { peakLobbyPlayerCount: activePlayerCount }).catch(() => {});
    }
  } else if (peakLobbyPlayerCount > 0) {
    await update(roomRef, { peakLobbyPlayerCount: null }).catch(() => {});
  }

  const validOwnerId = getValidOwnerId(data.owner, players);

  if (validOwnerId !== (data.owner || "")) {
    await update(roomRef, { owner: validOwnerId || null }).catch(() => {});
  }
}

function updateLobbyButtons(roomState, players) {
  isOwner = (window.currentOwnerId || "") === playerId;

  const inLobby = roomState === "lobby";
  const canReady = inLobby && isPlayer && !isOwner;

  if (readyBtn) readyBtn.disabled = !canReady;
  if (cancelReadyBtn) cancelReadyBtn.disabled = !canReady;
  if (stageBtn) stageBtn.disabled = !(inLobby && isOwner && checkReady(players));
}

function watchLobby() {
  const roomRef = ref(db, `rooms/${roomId}`);

  if (typeof unwatchLobby === "function") {
    unwatchLobby();
  }

  unwatchLobby = onValue(roomRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      showScreen("screen-home");
      return;
    }

    const players = data.players || {};
    const owner = getValidOwnerId(data.owner, players);
    const roomState = data.state || "lobby";

    window.currentOwnerId = owner;

    renderPlayers(players, owner, roomState);
    renderSpectators();

    if (lobbyOwnerText) {
      lobbyOwnerText.textContent = players[owner]?.name || "-";
    }

    updateLobbyButtons(roomState, players);
    ensureRoomIntegrity(data);
  });
}

function renderPlayers(players, owner, roomState) {
  if (!playerList) return;

  playerList.innerHTML = "";

  getOrderedEntries(players, owner).forEach((player) => {
    const li = document.createElement("li");

    let text = player.name || "-";

    if (player.id === owner) text += " 👑";
    if (player.ready) text += " ✓";

    li.textContent = text;
    li.dataset.id = player.id || "";
    li.dataset.type = "player";

    if (roomState === "lobby" && isOwner && player.id !== playerId) {
      li.style.cursor = "pointer";
      li.title = "クリックでオーナー操作";
    }

    playerList.appendChild(li);
  });
}

function renderSpectators() {
  if (!spectatorList) return;
  spectatorList.innerHTML = "";
}

function checkReady(players) {
  const list = Object.values(players || {}).filter(isActivePlayerEntry);

  if (list.length < MAX_PLAYERS) return false;

  for (const player of list) {
    if (player.id === (window.currentOwnerId || "")) continue;
    if (!player.ready) return false;
  }

  return true;
}

function bindLobbyEvents() {
  playerList?.addEventListener("click", handleMemberClick);
}

async function handleMemberClick(event) {
  const item = event.target.closest("li");
  if (!item || actionBusy || !roomId) return;

  const targetId = item.dataset.id || "";
  const targetType = item.dataset.type || "";

  if (!targetId || targetType !== "player") return;
  if (targetId === playerId || !isOwner) return;

  const roomSnap = await get(ref(db, `rooms/${roomId}`));
  const roomData = roomSnap.val();
  if (!roomData || (roomData.state || "lobby") !== "lobby") return;

  await openOwnerPlayerAction(targetId, roomData);
}

async function openOwnerPlayerAction(targetId, roomData) {
  const target = (roomData.players || {})[targetId];
  if (!target) return;

  const message = `${target.name}
1: オーナーを渡す
2: キック
その他: 何もしない`;
  const choice = window.prompt(message, "1");

  if (choice === "1") {
    await transferOwner(targetId);
    return;
  }

  if (choice === "2") {
    await kickMember(targetId, roomData.state || "lobby");
  }
}

async function transferOwner(targetId) {
  if (!isOwner || !targetId || targetId === playerId) return;

  actionBusy = true;

  try {
    await update(ref(db, `rooms/${roomId}`), { owner: targetId });
    window.currentOwnerId = targetId;
    isOwner = false;
  } finally {
    actionBusy = false;
  }
}

async function kickMember(targetId, roomState = "lobby") {
  if (!isOwner || !targetId || targetId === playerId) return;

  actionBusy = true;

  try {
    const targetRef = ref(db, `rooms/${roomId}/players/${targetId}`);
    await onDisconnect(targetRef).cancel().catch(() => {});

    if (PRE_DRAW_STATES.has(roomState)) {
      await remove(ref(db, `rooms/${roomId}`));
      return;
    }

    await remove(targetRef);
  } finally {
    actionBusy = false;
  }
}

readyBtn?.addEventListener("click", async () => {
  if (!isPlayer || isOwner || !roomId || !playerId) return;

  const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
  await update(playerRef, { ready: true });
});

cancelReadyBtn?.addEventListener("click", async () => {
  if (!isPlayer || isOwner || !roomId || !playerId) return;

  const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
  await update(playerRef, { ready: false });
});

stageBtn?.addEventListener("click", () => {
  if (!isOwner || !roomId || !playerId) return;

  showScreen("screen-stage-select");
  initStageSelect(roomId, window.currentOwnerId || playerId, playerId);
});

async function handleLeaveRoom() {
  if (!roomId || !playerId || leaveHandled) return;

  leaveHandled = true;

  try {
    const roomRef = ref(db, `rooms/${roomId}`);
    const roomSnap = await get(roomRef);
    const roomData = roomSnap.exists() ? roomSnap.val() : null;
    const roomState = roomData?.state || "lobby";

    if (PRE_DRAW_STATES.has(roomState)) {
      await remove(roomRef).catch(() => {});
      return;
    }

    await remove(ref(db, `rooms/${roomId}/players/${playerId}`)).catch(() => {});
  } catch {
  }
}

window.addEventListener("pagehide", () => {
  handleLeaveRoom();
});
