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
let drawBusy = false;
const AGENT_SETTINGS_KEY = "valorant_agent_settings";
const LEGACY_AGENT_SETTINGS_KEY = "agentUnlockSettings";

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function shuffle(list) {
  const arr = [...list];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function getAgentIdByName(name) {
  const agent = AGENTS.find(a => a.name === name);
  return agent?.id || "";
}

function buildCompAgents(comp, playerCount) {
  if (!Array.isArray(comp) || comp.length < playerCount) return [];

  return comp.slice(0, playerCount).map(name => ({
    name,
    id: getAgentIdByName(name)
  }));
}

function getPermutations(list) {
  if (list.length <= 1) return [list];

  const results = [];

  list.forEach((item, index) => {
    const rest = [...list.slice(0, index), ...list.slice(index + 1)];
    const perms = getPermutations(rest);

    perms.forEach(perm => {
      results.push([item, ...perm]);
    });
  });

  return results;
}

function getOrderedPlayers(players, ownerId) {
  return Object.values(players || {})
    .filter(player => player && player.connected !== false)
    .sort((a, b) => {
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
  const candidates = shuffle(compList).map(comp => {
    const compAgents = buildCompAgents(comp, orderedPlayers.length);
    if (compAgents.length !== orderedPlayers.length) return null;
    if (compAgents.some(agent => !agent.id)) return null;

    const validAssignments = getPermutations(compAgents).filter(permutation => {
      return orderedPlayers.every((player, index) => {
        const agent = permutation[index];
        return !!agent && isAgentAllowed(player, ownerId, agent.id);
      });
    });

    if (validAssignments.length === 0) return null;

    return {
      comp,
      assignment: pickRandom(validAssignments)
    };
  }).filter(Boolean);

  return pickRandom(candidates);
}

async function runDraw() {
  const roomId = window.currentRoom;
  const myPlayerId = window.currentPlayerId;
  const ownerId = window.currentOwnerId;

  if (!roomId || !myPlayerId || !ownerId || drawBusy) return;

  drawBusy = true;

  try {
    const roomSnap = await get(ref(db, `rooms/${roomId}`));
    const roomData = roomSnap.val();
    if (!roomData) return;

    const stage = roomData.stage;
    const roleComp = roomData.roleComp;
    const players = roomData.players || {};

    if (!stage || !roleComp || !MAP_COMPS[stage] || !MAP_COMPS[stage][roleComp]) {
      alert("抽選に必要な情報が不足しています");
      return;
    }

    if (myPlayerId === ownerId) {
      const orderedPlayers = getOrderedPlayers(players, ownerId);
      if (orderedPlayers.length === 0) {
        alert("参加プレイヤーがいません");
        return;
      }

      const selected = pickValidComp(MAP_COMPS[stage][roleComp], orderedPlayers, ownerId);
      if (!selected) {
        alert("成立する構成がありません");
        return;
      }

      const results = {};

      orderedPlayers.forEach((player, index) => {
        const assigned = selected.assignment[index];
        const agentName = assigned?.name || "";
        const agentId = assigned?.id || "";

        results[player.id] = {
          id: player.id,
          name: player.name,
          agent: agentId,
          agentName
        };
      });

      await set(ref(db, `rooms/${roomId}/results`), results);
      await update(ref(db, `rooms/${roomId}`), {
        state: "result",
        selectedComp: selected.comp,
        selectedRoleComp: roleComp,
        selectedStage: stage
      });
    }

    initPersonalResult(roomId, myPlayerId, false);
  } catch (error) {
    console.error(error);
    alert("抽選に失敗しました");
    showScreen("screen-stage-select");
  } finally {
    drawBusy = false;
  }
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