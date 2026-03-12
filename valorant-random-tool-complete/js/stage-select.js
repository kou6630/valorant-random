// js/stage-select.js

import { db } from "./firebase.js";
import { showScreen } from "./app.js";

import {
  ref,
  update,
  onValue
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

import { STAGES } from "../data/stages.js";
import { ROLE_COMPS } from "../data/role-comps.js";

const stageSelect = document.getElementById("stageSelect");
const roleCompSelect = document.getElementById("roleCompSelect");

const randomRoleBtn = document.getElementById("randomRoleCompBtn");
const startBtn = document.getElementById("startDrawBtn");
const backBtn = document.getElementById("backToLobbyFromStageBtn");

let roomId = null;
let isOwner = false;

export function initStageSelect(currentRoom, ownerId, myId) {

  roomId = currentRoom;
  isOwner = ownerId === myId;

  renderStages();
  renderRoleComps();

  if (!isOwner) {
    startBtn.disabled = true;
    randomRoleBtn.disabled = true;
  }

  watchStageData();
}

function renderStages() {

  stageSelect.innerHTML = "";

  STAGES.forEach(stage => {

    const opt = document.createElement("option");

    opt.value = stage.id;
    opt.textContent = stage.name;

    stageSelect.appendChild(opt);
  });
}

function renderRoleComps() {

  roleCompSelect.innerHTML = "";

  ROLE_COMPS.forEach(comp => {

    const opt = document.createElement("option");

    opt.value = comp.id;
    opt.textContent = comp.name;

    roleCompSelect.appendChild(opt);
  });
}

function watchStageData() {

  const roomRef = ref(db, `rooms/${roomId}`);

  onValue(roomRef, (snap) => {

    const data = snap.val();
    if (!data) return;

    if (data.stage) stageSelect.value = data.stage;
    if (data.roleComp) roleCompSelect.value = data.roleComp;

  });
}

stageSelect.addEventListener("change", async () => {

  if (!isOwner) return;

  await update(ref(db, `rooms/${roomId}`), {
    stage: stageSelect.value
  });
});

roleCompSelect.addEventListener("change", async () => {

  if (!isOwner) return;

  await update(ref(db, `rooms/${roomId}`), {
    roleComp: roleCompSelect.value
  });
});

randomRoleBtn.addEventListener("click", async () => {

  if (!isOwner) return;

  const random =
    ROLE_COMPS[Math.floor(Math.random() * ROLE_COMPS.length)];

  roleCompSelect.value = random.id;

  await update(ref(db, `rooms/${roomId}`), {
    roleComp: random.id
  });
});

startBtn.addEventListener("click", async () => {

  if (!isOwner) return;

  await update(ref(db, `rooms/${roomId}`), {
    state: "draw"
  });

  showScreen("screen-draw");
});

backBtn.addEventListener("click", () => {

  showScreen("screen-lobby");
});