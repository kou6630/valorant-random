// js/draw.js

import { db } from "./firebase.js";
import { showScreen } from "./app.js";
import { initPersonalResult } from "./personal-result.js";
import {
  ref,
  get,
  set,
  update
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

import { AGENTS } from "../data/agents.js";
import { MAP_COMPS } from "../data/map-comps.js";

const drawArea = document.getElementById("drawAnimationArea");

let drawTimer = null;
let frameTimer = null;
const AGENT_SETTINGS_KEY = "valorant_agent_settings";
const LEGACY_AGENT_SETTINGS_KEY = "agentUnlockSettings";

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function getAgentIdByName(name) {
  const agent = AGENTS.find(a => a.name === name);
  return agent?.id || "";
}

function getOrderedPlayers(players, ownerId) {
  return Object.values(players).sort((a, b) => {
    if (a.id === ownerId && b.id !== ownerId) return -1;
    if (a.id !== ownerId && b.id === ownerId) return 1;

    const aJoinedAt = Number(a.joinedAt || 0);
    const bJoinedAt = Number(b.joinedAt || 0);

    if (aJoinedAt !== bJoinedAt) return aJoinedAt - bJoinedAt;
    return String(a.id || "").localeCompare(String(b.id || ""), "ja");
  });
}

function loadLocalAgentSettings() {
  try {
    const raw =
      localStorage.getItem(AGENT_SETTINGS_KEY) ||
      localStorage.getItem(LEGACY_AGENT_SETTINGS_KEY);

    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getPlayerAgentSettings(player, ownerId) {
  if (player?.agentSettings && typeof player.agentSettings === "object") {
    return player.agentSettings;
  }

  if (player?.unlockSettings && typeof player.unlockSettings === "object") {
    return player.unlockSettings;
  }

  if (player?.settings && typeof player.settings === "object") {
    return player.settings;
  }

  if (player?.id === ownerId) {
    return loadLocalAgentSettings();
  }

  return null;
}

function isAgentAllowed(player, ownerId, agentId) {
  const settings = getPlayerAgentSettings(player, ownerId);
  if (!settings) return true;
  return settings[agentId] !== false;
}

function pickValidComp(compList, orderedPlayers, ownerId) {
  const validComps = compList.filter(comp => {
    if (!Array.isArray(comp) || comp.length < orderedPlayers.length) return false;

    return orderedPlayers.every((player, index) => {
      const agentId = getAgentIdByName(comp[index] || "");
      if (!agentId) return false;
      return isAgentAllowed(player, ownerId, agentId);
    });
  });

  return pickRandom(validComps.length > 0 ? validComps : compList);
}

async function runDraw() {
  const roomId = window.currentRoom;
  const myPlayerId = window.currentPlayerId;
  const ownerId = window.currentOwnerId;

  if (!roomId || !myPlayerId || !ownerId) return;

  const roomSnap = await get(ref(db, `rooms/${roomId}`));
  const roomData = roomSnap.val();
  if (!roomData) return;

  const stage = roomData.stage;
  const roleComp = roomData.roleComp;
  const players = roomData.players || {};
  const spectators = roomData.spectators || {};

  if (!stage || !roleComp || !MAP_COMPS[stage] || !MAP_COMPS[stage][roleComp]) return;

  if (myPlayerId === ownerId) {
    const orderedPlayers = getOrderedPlayers(players, ownerId);
    const comp = pickValidComp(MAP_COMPS[stage][roleComp], orderedPlayers, ownerId);
    if (!comp) return;

    const results = {};

    orderedPlayers.forEach((player, index) => {
      const agentName = comp[index] || "";
      const agentId = getAgentIdByName(agentName);

      results[player.id] = {
        id: player.id,
        name: player.name,
        agent: agentId,
        agentName,
        isCpu: !!player.isCpu
      };
    });

    await set(ref(db, `rooms/${roomId}/results`), results);
    await update(ref(db, `rooms/${roomId}`), {
      state: "result",
      selectedComp: comp,
      selectedRoleComp: roleComp,
      selectedStage: stage
    });
  }

  const myPlayerRef = ref(db, `rooms/${roomId}/players/${myPlayerId}`);
  const myPlayerSnap = await get(myPlayerRef);
  const spectator = !myPlayerSnap.exists() && !!spectators[myPlayerId];

  initPersonalResult(roomId, myPlayerId, spectator);
}

export function startDrawAnimation(onComplete) {

  showScreen("screen-draw");

  const frames = [
    "抽選中.",
    "抽選中..",
    "抽選中...",
    "キャラ決定中.",
    "キャラ決定中..",
    "キャラ決定中..."
  ];

  let index = 0;

  clearInterval(frameTimer);
  clearTimeout(drawTimer);

  if (drawArea) {
    drawArea.textContent = frames[0];

    frameTimer = setInterval(() => {
      index = (index + 1) % frames.length;
      drawArea.textContent = frames[index];
    }, 250);
  }

  drawTimer = setTimeout(async () => {

    clearInterval(frameTimer);
    frameTimer = null;

    if (drawArea) {
      drawArea.textContent = "決定！";
    }

    await runDraw();

    if (typeof onComplete === "function") {
      onComplete();
    }

  }, 3000);
}
