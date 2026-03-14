// js/all-results.js

import { db } from "./firebase.js";
import { showScreen } from "./app.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const resultsArea = document.getElementById("allResultsList");
const rerollBtn = document.getElementById("rerollBtn");
const backBtn = document.getElementById("backToLobbyBtn");

let currentRoom = null;
let currentUserId = null;
let isOwner = false;

export function initAllResults(roomId, userId, ownerId) {
  currentRoom = roomId;
  currentUserId = userId;
  isOwner = userId === ownerId;

  rerollBtn.style.display = isOwner ? "" : "none";

  const resultsRef = ref(db, `rooms/${roomId}/results`);

  onValue(resultsRef, (snapshot) => {
    const data = snapshot.val();
    renderResults(data);
  });
}

function renderResults(data) {
  resultsArea.innerHTML = "";

  if (!data) return;

  Object.values(data).forEach(player => {
    const card = document.createElement("div");
    card.className = "result-card";

    const name = document.createElement("div");
    name.className = "result-name";
    name.textContent = player.name;

    const img = document.createElement("img");
    img.src = `img/agents/${player.agent}.png`;
    img.className = "result-agent";

    card.appendChild(name);
    card.appendChild(img);

    resultsArea.appendChild(card);
  });
}

rerollBtn.addEventListener("click", async () => {
  if (!isOwner) return;

  await update(ref(db, `rooms/${currentRoom}`), {
    state: "stage-select"
  });
});

backBtn.addEventListener("click", () => {
  showScreen("screen-lobby");
});
