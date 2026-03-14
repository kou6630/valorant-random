// js/home.js

import { showScreen } from "./app.js";
import { initLobby } from "./lobby.js";
import { db } from "./firebase.js";
import { ref, get, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

let joinBusy = false;

const nameInput = document.getElementById("playerName");
const passInput = document.getElementById("roomPass");

const joinBtn = document.getElementById("joinRoomBtn");
const openSettingsBtn = document.getElementById("openAgentSettingsBtn");

const NAME_KEY = "valorant_random_name";
const PASS_KEY = "valorant_random_pass";

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
    const snap = await get(roomRef);

    if (!snap.exists()) {
      await set(roomRef, {
        createdAt: Date.now(),
        state: "lobby"
      });
    }

    window.currentRoom = pass;
    window.playerName = name;

    showScreen("screen-lobby");
    await initLobby();
  } catch {
    alert("入室に失敗しました");
  } finally {
    joinBusy = false;
    if (joinBtn) joinBtn.disabled = false;
  }
}

joinBtn?.addEventListener("click", joinRoom);

openSettingsBtn?.addEventListener("click", () => {
  showScreen("screen-agent-settings");
});

loadLocal();
