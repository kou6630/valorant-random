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
const MAX_SPECTATORS = 5;
const ROOM_TTL_MS = 10 * 60 * 1000;

let roomId = null;
let playerId = null;
let isOwner = false;
let isPlayer = false;
let watchBound = false;
let unwatchLobby = null;
let actionBusy = false;

export async function initLobby() {
  roomId = window.currentRoom;
  const name = (window.playerName || "").trim();
  const clientId = getClientId();

  if (!roomId || !name) {
    showScreen("screen-home");
    return;
  }

  if (lobbyPassText) {
    lobbyPassText.textContent = roomId;
  }

  const roomRef = ref(db, `rooms/${roomId}`);
  const roomSnap = await get(roomRef);
  const roomData = roomSnap.exists() ? roomSnap.val() : null;

  if (!roomData) {
    showScreen("screen-home");
    return;
  }

  const players = roomData.players || {};
  const spectators = roomData.spectators || {};
  const roomState = roomData.state || "lobby";
  const expiresAt = Number(roomData.expiresAt || 0);

  if (expiresAt > 0 && Date.now() >= expiresAt) {
    await remove(roomRef).catch(() => {});
    showScreen("screen-home");
    return;
  }

  const activePlayerCount = getActivePlayerCount(players);
  const activeSpectatorCount = getActiveSpectatorCount(spectators);

  const existingPlayer = findEntryByClientId(players, clientId, isActivePlayerEntry);
  const existingSpectator = findEntryByClientId(spectators, clientId, isActiveSpectatorEntry);

  if (existingPlayer) {
    isPlayer = true;
    playerId = existingPlayer.id;

    await update(ref(db, `rooms/${roomId}/players/${playerId}`), {
      name,
      clientId,
      ready: false,
      connected: true,
      isCpu: false
    });

    bindDisconnect(ref(db, `rooms/${roomId}/players/${playerId}`), "player", roomState);
  } else if (existingSpectator) {
    isPlayer = false;
    playerId = existingSpectator.id;

    await update(ref(db, `rooms/${roomId}/spectators/${playerId}`), {
      name,
      clientId,
      connected: true
    });

    bindDisconnect(ref(db, `rooms/${roomId}/spectators/${playerId}`), "spectator");
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
      isCpu: false,
      joinedAt: Date.now()
    });

    await update(roomRef, { expiresAt: Date.now() + ROOM_TTL_MS });

    bindDisconnect(newPlayerRef, "player", roomState);
  } else if (activeSpectatorCount < MAX_SPECTATORS) {
    isPlayer = false;

    const newSpectatorRef = push(ref(db, `rooms/${roomId}/spectators`));
    playerId = newSpectatorRef.key;

    await set(newSpectatorRef, {
      id: playerId,
      name,
      clientId,
      connected: true,
      joinedAt: Date.now()
    });

    await update(roomRef, { expiresAt: Date.now() + ROOM_TTL_MS });

    bindDisconnect(newSpectatorRef, "spectator");
  } else {
    alert("満員です");
    showScreen("screen-home");
    return;
  }

  const latestRoomSnap = await get(roomRef);
  const latestRoomData = latestRoomSnap.val() || {};
  const nextOwnerId = getValidOwnerId(
    latestRoomData.owner,
    latestRoomData.players || {},
    latestRoomData.spectators || {}
  );

  if (nextOwnerId !== latestRoomData.owner) {
    await update(roomRef, { owner: nextOwnerId || null });
  }

  isOwner = nextOwnerId === playerId;
  window.currentPlayerId = playerId;
  window.currentOwnerId = nextOwnerId || "";

  if (!watchBound) {
    watchLobby();
    bindLobbyEvents();
    watchBound = true;
  }
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
  return Object.values(entries).find(entry => entry.clientId === clientId && isActive(entry)) || null;
}

function isActivePlayerEntry(entry) {
  return !!entry && entry.connected !== false && !entry.isCpu;
}

function isActiveSpectatorEntry(entry) {
  return !!entry && entry.connected !== false;
}

function getActivePlayerCount(entries) {
  return Object.values(entries || {}).filter(isActivePlayerEntry).length;
}

function getActiveSpectatorCount(entries) {
  return Object.values(entries || {}).filter(isActiveSpectatorEntry).length;
}

function isEffectivelyEmptyRoom(players, spectators) {
  return getActivePlayerCount(players) === 0 && getActiveSpectatorCount(spectators) === 0;
}

function bindDisconnect(targetRef, type, roomState = "lobby") {
  const disconnectHandler = onDisconnect(targetRef);

  disconnectHandler.cancel().catch(() => {});

  if (type === "player" && roomState !== "lobby") {
    disconnectHandler.update({
      connected: false,
      isCpu: true,
      ready: true
    });
    return;
  }

  disconnectHandler.remove();
}

function getOrderedEntries(entries, ownerId = "") {
  return Object.values(entries).sort((a, b) => {
    if (a.id === ownerId && b.id !== ownerId) return -1;
    if (a.id !== ownerId && b.id === ownerId) return 1;

    const aJoinedAt = Number(a.joinedAt || 0);
    const bJoinedAt = Number(b.joinedAt || 0);

    if (aJoinedAt !== bJoinedAt) return aJoinedAt - bJoinedAt;
    return String(a.id || "").localeCompare(String(b.id || ""), "ja");
  });
}

function getValidOwnerId(ownerId, players, spectators) {
  if (ownerId && players[ownerId]) return ownerId;
  return getNextOwnerId(players, spectators);
}

function getNextOwnerId(players, spectators, excludeId = "") {
  const orderedPlayers = getOrderedEntries(players).filter(p => p.id !== excludeId);
  if (orderedPlayers.length > 0) return orderedPlayers[0].id;

  const orderedSpectators = getOrderedEntries(spectators).filter(s => s.id !== excludeId);
  if (orderedSpectators.length > 0) return orderedSpectators[0].id;

  return "";
}

async function ensureRoomIntegrity(data) {
  if (!roomId || !data) return;

  const roomRef = ref(db, `rooms/${roomId}`);
  const players = data.players || {};
  const spectators = data.spectators || {};
  const roomState = data.state || "lobby";
  const expiresAt = Number(data.expiresAt || 0);

  if (expiresAt > 0 && Date.now() >= expiresAt) {
    await remove(roomRef).catch(() => {});
    return;
  }

  if (roomState === "lobby") {
    const stalePlayers = Object.values(players).filter(player => player?.connected === false || player?.isCpu);
    const staleSpectators = Object.values(spectators).filter(spectator => spectator?.connected === false);

    if (stalePlayers.length > 0 || staleSpectators.length > 0) {
      await Promise.all([
        ...stalePlayers.map(player => remove(ref(db, `rooms/${roomId}/players/${player.id}`)).catch(() => {})),
        ...staleSpectators.map(spectator => remove(ref(db, `rooms/${roomId}/spectators/${spectator.id}`)).catch(() => {}))
      ]);

      const latestSnap = await get(roomRef).catch(() => null);
      const latestData = latestSnap?.val?.() || null;
      const latestPlayers = latestData?.players || {};
      const latestSpectators = latestData?.spectators || {};

      if (!latestData || isEffectivelyEmptyRoom(latestPlayers, latestSpectators)) {
        await remove(roomRef).catch(() => {});
        return;
      }
    }
  }

  if (isEffectivelyEmptyRoom(players, spectators)) {
    await remove(roomRef).catch(() => {});
    return;
  }

  const validOwnerId = getValidOwnerId(data.owner, players, spectators);

  if (validOwnerId !== (data.owner || "")) {
    await update(roomRef, { owner: validOwnerId || null }).catch(() => {});
  }
}

function updateLobbyButtons(roomState, players) {
  isOwner = (window.currentOwnerId || "") === playerId;

  const inLobby = roomState === "lobby";
  const canReady = inLobby && isPlayer;

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
    const spectators = data.spectators || {};
    const owner = getValidOwnerId(data.owner, players, spectators);

    window.currentOwnerId = owner;

    renderPlayers(players, owner, data.state || "lobby");
    renderSpectators(spectators, data.state || "lobby");

    if (lobbyOwnerText) {
      lobbyOwnerText.textContent = players[owner]?.name || spectators[owner]?.name || "-";
    }

    updateLobbyButtons(data.state || "lobby", players);
    ensureRoomIntegrity(data);
  });
}

function renderPlayers(players, owner, roomState) {
  if (!playerList) return;

  playerList.innerHTML = "";

  getOrderedEntries(players, owner).forEach(p => {
    const li = document.createElement("li");

    let text = p.name || "-";

    if (p.id === owner) text += " 👑";
    if (p.isCpu) text += " [CPU]";
    if (p.ready) text += " ✓";

    li.textContent = text;
    li.dataset.id = p.id || "";
    li.dataset.type = "player";

    if (roomState === "lobby") {
      if (p.id === playerId && !isOwner) {
        li.style.cursor = "pointer";
        li.title = "クリックで観戦へ移動";
      } else if (isOwner && p.id !== playerId) {
        li.style.cursor = "pointer";
        li.title = "クリックでオーナー操作";
      }
    }

    playerList.appendChild(li);
  });
}

function renderSpectators(spectators, roomState) {
  if (!spectatorList) return;

  spectatorList.innerHTML = "";

  getOrderedEntries(spectators).forEach(s => {
    const li = document.createElement("li");
    li.textContent = s.name || "-";
    li.dataset.id = s.id || "";
    li.dataset.type = "spectator";

    if (roomState === "lobby") {
      if (s.id === playerId) {
        li.style.cursor = "pointer";
        li.title = "クリックで参加者へ移動";
      } else if (isOwner) {
        li.style.cursor = "pointer";
        li.title = "クリックでオーナー操作";
      }
    }

    spectatorList.appendChild(li);
  });
}

function checkReady(players) {
  const list = Object.values(players);

  if (list.length < MAX_PLAYERS) return false;

  for (const p of list) {
    if (p.id === (window.currentOwnerId || "")) continue;
    if (p.isCpu) continue;
    if (!p.ready) return false;
  }

  return true;
}

function bindLobbyEvents() {
  playerList?.addEventListener("click", handleMemberClick);
  spectatorList?.addEventListener("click", handleMemberClick);
}

async function handleMemberClick(event) {
  const item = event.target.closest("li");
  if (!item || actionBusy || !roomId) return;

  const targetId = item.dataset.id || "";
  const targetType = item.dataset.type || "";

  if (!targetId || !targetType) return;

  const roomSnap = await get(ref(db, `rooms/${roomId}`));
  const roomData = roomSnap.val();
  if (!roomData || (roomData.state || "lobby") !== "lobby") return;

  if (targetId === playerId) {
    if (targetType === "player") {
      await moveSelfToSpectator(roomData);
      return;
    }

    await moveSelfToPlayer(roomData);
    return;
  }

  if (!isOwner) return;

  await openOwnerAction(targetId, targetType, roomData);
}

async function moveSelfToSpectator(roomData) {
  if (!isPlayer || isOwner) return;

  const spectators = roomData.spectators || {};
  if (getActiveSpectatorCount(spectators) >= MAX_SPECTATORS) {
    alert("観戦枠が満員です");
    return;
  }

  const me = (roomData.players || {})[playerId];
  if (!me) return;

  actionBusy = true;

  try {
    const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
    const spectatorRef = ref(db, `rooms/${roomId}/spectators/${playerId}`);

    await onDisconnect(playerRef).cancel().catch(() => {});
    await set(spectatorRef, {
      id: playerId,
      name: me.name || window.playerName || "-",
      clientId: me.clientId || getClientId(),
      connected: true,
      joinedAt: me.joinedAt || Date.now()
    });
    await remove(playerRef);

    bindDisconnect(spectatorRef, "spectator");
    isPlayer = false;
    isOwner = false;
  } finally {
    actionBusy = false;
  }
}

async function moveSelfToPlayer(roomData) {
  if (isPlayer) return;

  const players = roomData.players || {};
  if (getActivePlayerCount(players) >= MAX_PLAYERS) {
    alert("参加枠が満員です");
    return;
  }

  const me = (roomData.spectators || {})[playerId];
  if (!me) return;

  actionBusy = true;

  try {
    const spectatorRef = ref(db, `rooms/${roomId}/spectators/${playerId}`);
    const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);

    await onDisconnect(spectatorRef).cancel().catch(() => {});
    await set(playerRef, {
      id: playerId,
      name: me.name || window.playerName || "-",
      clientId: me.clientId || getClientId(),
      ready: false,
      connected: true,
      isCpu: false,
      joinedAt: me.joinedAt || Date.now()
    });
    await remove(spectatorRef);

    bindDisconnect(playerRef, "player", "lobby");
    isPlayer = true;
    isOwner = (window.currentOwnerId || "") === playerId;
  } finally {
    actionBusy = false;
  }
}

async function openOwnerAction(targetId, targetType, roomData) {
  const target = targetType === "player"
    ? (roomData.players || {})[targetId]
    : (roomData.spectators || {})[targetId];

  if (!target) return;

  const canTransfer = targetType === "player";
  const message = canTransfer
    ? `${target.name}
1: オーナーを渡す
2: キック
その他: 何もしない`
    : `${target.name}
2: キック
その他: 何もしない`;

  const choice = window.prompt(message, canTransfer ? "1" : "2");

  if (choice === "1" && canTransfer) {
    await transferOwner(targetId);
    return;
  }

  if (choice === "2") {
    await kickMember(targetId, targetType);
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

async function kickMember(targetId, targetType) {
  if (!isOwner || !targetId || targetId === playerId) return;

  actionBusy = true;

  try {
    const targetRef = ref(
      db,
      targetType === "player"
        ? `rooms/${roomId}/players/${targetId}`
        : `rooms/${roomId}/spectators/${targetId}`
    );

    await onDisconnect(targetRef).cancel().catch(() => {});
    await remove(targetRef);
  } finally {
    actionBusy = false;
  }
}

readyBtn?.addEventListener("click", async () => {
  if (!isPlayer || !roomId || !playerId) return;

  const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
  await update(playerRef, { ready: true });
});

cancelReadyBtn?.addEventListener("click", async () => {
  if (!isPlayer || !roomId || !playerId) return;

  const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
  await update(playerRef, { ready: false });
});

stageBtn?.addEventListener("click", () => {
  if (!isOwner || !roomId || !playerId) return;

  showScreen("screen-stage-select");
  initStageSelect(roomId, window.currentOwnerId || playerId, playerId);
});

async function handleLeaveRoom() {
  if (!roomId || !playerId) return;

  try {
    const roomRef = ref(db, `rooms/${roomId}`);
    const roomSnap = await get(roomRef);
    const roomData = roomSnap.val();

    if (!roomData) return;

    const players = roomData.players || {};
    const spectators = roomData.spectators || {};
    const roomState = roomData.state || "lobby";
    const leavingOwner = roomData.owner === playerId;

    if (isPlayer) {
      if (roomState === "lobby") {
        await remove(ref(db, `rooms/${roomId}/players/${playerId}`));
      } else {
        await update(ref(db, `rooms/${roomId}/players/${playerId}`), {
          connected: false,
          isCpu: true,
          ready: true
        });
      }
    } else {
      await remove(ref(db, `rooms/${roomId}/spectators/${playerId}`));
    }

    const nextPlayers = { ...players };
    const nextSpectators = { ...spectators };

    if (isPlayer) {
      if (roomState === "lobby") delete nextPlayers[playerId];
      else if (nextPlayers[playerId]) {
        nextPlayers[playerId] = {
          ...nextPlayers[playerId],
          connected: false,
          isCpu: true,
          ready: true
        };
      }
    } else {
      delete nextSpectators[playerId];
    }

    if (isEffectivelyEmptyRoom(nextPlayers, nextSpectators)) {
      await remove(roomRef);
      return;
    }

    if (leavingOwner) {
      const nextOwnerId = getNextOwnerId(nextPlayers, nextSpectators, playerId);
      await update(roomRef, { owner: nextOwnerId || null });
    }
  } catch {
  }
}

window.addEventListener("pagehide", () => {
  handleLeaveRoom();
});

window.addEventListener("beforeunload", () => {
  handleLeaveRoom();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    handleLeaveRoom();
  }
});
