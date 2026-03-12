// js/lobby.js

import { db } from "./firebase.js";
import { showScreen } from "./app.js";

import {
  ref,
  push,
  set,
  get,
  update,
  onValue
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const playerList = document.getElementById("playerList");
const spectatorList = document.getElementById("spectatorList");

const readyBtn = document.getElementById("readyBtn");
const cancelReadyBtn = document.getElementById("cancelReadyBtn");
const stageBtn = document.getElementById("goToStageSelectBtn");

const lobbyPassText = document.getElementById("lobbyRoomPass");
const lobbyOwnerText = document.getElementById("lobbyOwnerName");

let roomId = null;
let playerId = null;
let isOwner = false;
let isPlayer = false;

export async function initLobby() {

  roomId = window.currentRoom;
  const name = window.playerName;

  lobbyPassText.textContent = roomId;

  const playersRef = ref(db, `rooms/${roomId}/players`);
  const spectatorsRef = ref(db, `rooms/${roomId}/spectators`);
  const roomRef = ref(db, `rooms/${roomId}`);

  const playersSnap = await get(playersRef);
  const playerCount = playersSnap.exists()
    ? Object.keys(playersSnap.val()).length
    : 0;

  if (playerCount < 5) {
    isPlayer = true;

    const newPlayerRef = push(playersRef);
    playerId = newPlayerRef.key;

    await set(newPlayerRef, {
      id: playerId,
      name,
      ready: false
    });

  } else {

    isPlayer = false;

    const newSpectatorRef = push(spectatorsRef);
    playerId = newSpectatorRef.key;

    await set(newSpectatorRef, {
      id: playerId,
      name
    });
  }

  const roomSnap = await get(roomRef);

  if (!roomSnap.val().owner) {
    await update(roomRef, { owner: playerId });
    isOwner = true;
  }

  watchLobby();
}

function watchLobby() {

  const roomRef = ref(db, `rooms/${roomId}`);

  onValue(roomRef, (snapshot) => {

    const data = snapshot.val();
    if (!data) return;

    const players = data.players || {};
    const spectators = data.spectators || {};
    const owner = data.owner;

    renderPlayers(players, owner);
    renderSpectators(spectators);

    lobbyOwnerText.textContent =
      players[owner]?.name || spectators[owner]?.name || "-";

    if (isOwner && checkReady(players)) {
      stageBtn.disabled = false;
    } else {
      stageBtn.disabled = true;
    }
  });
}

function renderPlayers(players, owner) {

  playerList.innerHTML = "";

  Object.values(players).forEach(p => {

    const li = document.createElement("li");

    let text = p.name;

    if (p.id === owner) text += " 👑";
    if (p.ready) text += " ✓";

    li.textContent = text;

    playerList.appendChild(li);
  });
}

function renderSpectators(spectators) {

  spectatorList.innerHTML = "";

  Object.values(spectators).forEach(s => {

    const li = document.createElement("li");
    li.textContent = s.name;

    spectatorList.appendChild(li);
  });
}

function checkReady(players) {

  const list = Object.values(players);

  if (list.length < 5) return false;

  for (const p of list) {
    if (p.id === playerId && isOwner) continue;
    if (!p.ready) return false;
  }

  return true;
}

readyBtn.addEventListener("click", async () => {

  if (!isPlayer) return;

  const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);

  await update(playerRef, { ready: true });
});

cancelReadyBtn.addEventListener("click", async () => {

  if (!isPlayer) return;

  const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);

  await update(playerRef, { ready: false });
});

stageBtn.addEventListener("click", () => {

  if (!isOwner) return;

  showScreen("screen-stage-select");
});