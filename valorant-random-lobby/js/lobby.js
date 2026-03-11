// js/lobby.js

import { db } from "./firebase.js";
import {
  ref,
  set,
  get,
  onValue,
  push
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCode");
const createRoomBtn = document.getElementById("createRoom");
const joinRoomBtn = document.getElementById("joinRoom");
const playerList = document.getElementById("playerList");

let currentRoomCode = "";
let currentPlayerId = "";

function generateRoomCode(length = 6){
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for(let i = 0; i < length; i++){
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function renderPlayers(players){
  playerList.innerHTML = "";

  if(!players){
    return;
  }

  Object.values(players).forEach((player) => {
    const li = document.createElement("li");
    li.textContent = player.name || "no name";
    playerList.appendChild(li);
  });
}

function watchRoom(roomCode){
  const roomRef = ref(db, `rooms/${roomCode}/players`);
  onValue(roomRef, (snapshot) => {
    renderPlayers(snapshot.val());
  });
}

async function createRoom(){
  const name = playerNameInput.value.trim();
  if(!name){
    alert("名前を入力してください");
    return;
  }

  const roomCode = generateRoomCode();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const playersRef = ref(db, `rooms/${roomCode}/players`);
  const newPlayerRef = push(playersRef);

  currentRoomCode = roomCode;
  currentPlayerId = newPlayerRef.key;
  roomCodeInput.value = roomCode;

  await set(roomRef, {
    ownerId: currentPlayerId,
    createdAt: Date.now()
  });

  await set(newPlayerRef, {
    id: currentPlayerId,
    name
  });

  watchRoom(roomCode);
}

async function joinRoom(){
  const name = playerNameInput.value.trim();
  const roomCode = roomCodeInput.value.trim().toUpperCase();

  if(!name){
    alert("名前を入力してください");
    return;
  }

  if(!roomCode){
    alert("ルームコードを入力してください");
    return;
  }

  const roomRef = ref(db, `rooms/${roomCode}`);
  const roomSnapshot = await get(roomRef);

  if(!roomSnapshot.exists()){
    alert("ルームが存在しません");
    return;
  }

  const playersRef = ref(db, `rooms/${roomCode}/players`);
  const playersSnapshot = await get(playersRef);
  const players = playersSnapshot.val();
  const playerCount = players ? Object.keys(players).length : 0;

  if(playerCount >= 5){
    alert("このルームは満員です");
    return;
  }

  const newPlayerRef = push(playersRef);

  currentRoomCode = roomCode;
  currentPlayerId = newPlayerRef.key;

  await set(newPlayerRef, {
    id: currentPlayerId,
    name
  });

  watchRoom(roomCode);
}

createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);