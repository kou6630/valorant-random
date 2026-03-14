// js/stage-select.js

import { db } from "./firebase.js";
import { showScreen } from "./app.js";
import { startDrawAnimation } from "./draw.js";

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
let watchBound = false;
let watchedRoomId = null;
let unwatchStage = null;

export function initStageSelect(currentRoom, ownerId, myId) {

  roomId = currentRoom;
  isOwner = ownerId === myId;

  if (!roomId || !stageSelect || !roleCompSelect) return;

  renderStages();
  renderRoleComps();

  startBtn.disabled = !isOwner;
  randomRoleBtn.disabled = !isOwner;

  if (isOwner) {
    update(ref(db, `rooms/${roomId}`), {
      state: "stage-select"
    }).catch(() => {});
  }

  if (!watchBound || watchedRoomId !== roomId) {
    watchStageData();
    watchBound = true;
    watchedRoomId = roomId;
  }
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

  if (typeof unwatchStage === "function") {
    unwatchStage();
  }

  unwatchStage = onValue(roomRef, (snap) => {

    const data = snap.val();
    if (!data) return;

    if (data.stage && STAGES.some(stage => stage.id === data.stage)) {
      stageSelect.value = data.stage;
    }

    if (data.roleComp && ROLE_COMPS.some(comp => comp.id === data.roleComp)) {
      roleCompSelect.value = data.roleComp;
    }

    isOwner = (data.owner || "") === (window.currentPlayerId || "");
    startBtn.disabled = !isOwner;
    randomRoleBtn.disabled = !isOwner;

  });
}

stageSelect.addEventListener("change", async () => {

  if (!isOwner || !roomId) return;

  await update(ref(db, `rooms/${roomId}`), {
    stage: stageSelect.value
  });
});

roleCompSelect.addEventListener("change", async () => {

  if (!isOwner || !roomId) return;

  await update(ref(db, `rooms/${roomId}`), {
    roleComp: roleCompSelect.value
  });
});

randomRoleBtn.addEventListener("click", async () => {

  if (!isOwner || !roomId || ROLE_COMPS.length === 0) return;

  const r = Math.random();
  let random;

  if (r < 0.35) random = ROLE_COMPS.find(c => c.id === "role2");
  else if (r < 0.65) random = ROLE_COMPS.find(c => c.id === "role1");
  else if (r < 0.85) random = ROLE_COMPS.find(c => c.id === "role3");
  else random = ROLE_COMPS.find(c => c.id === "role4");

  random = random || ROLE_COMPS[0];
  if (!random) return;

  roleCompSelect.value = random.id;

  await update(ref(db, `rooms/${roomId}`), {
    roleComp: random.id
  });
});

startBtn.addEventListener("click", async () => {

  if (!isOwner || !roomId) return;

  const stage = stageSelect.value || STAGES[0]?.id || "";
  const roleComp = roleCompSelect.value || ROLE_COMPS[0]?.id || "";

  if (!stage || !roleComp) return;

  await update(ref(db, `rooms/${roomId}`), {
    stage,
    roleComp,
    state: "draw"
  });

  startDrawAnimation();
});

backBtn.addEventListener("click", async () => {

  if (isOwner && roomId) {
    await update(ref(db, `rooms/${roomId}`), {
      state: "lobby"
    }).catch(() => {});
  }

  showScreen("screen-lobby");
});
