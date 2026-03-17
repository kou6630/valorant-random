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
let decideTimer = null;
let drawBusy = false;
const AGENT_SETTINGS_KEY = "valorant_agent_settings";
const LEGACY_AGENT_SETTINGS_KEY = "agentUnlockSettings";
const DRAW_DURATION_MS = 3000;
const DECIDE_TIME_MS = 2400;
const PERSONAL_RESULT_HOLD_MS = 2000;
const DRAW_EFFECTS = ["slot", "card", "roulette", "glitch", "shuffle"];

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

function clearDrawTimers() {
  clearTimeout(drawTimer);
  clearTimeout(decideTimer);
  clearInterval(frameTimer);
  drawTimer = null;
  decideTimer = null;
  frameTimer = null;
}

function wait(ms) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    drawTimer = timer;
  });
}

function getEffectType(playerId) {
  const source = String(playerId || "");
  let total = 0;

  for (let i = 0; i < source.length; i++) {
    total += source.charCodeAt(i);
  }

  return DRAW_EFFECTS[total % DRAW_EFFECTS.length] || DRAW_EFFECTS[0];
}

function getAgentNamesPool(excludeName = "") {
  return shuffle(
    AGENTS
      .map(agent => agent?.name || "")
      .filter(name => !!name && name !== excludeName)
  );
}

function buildFakeSequence(confirmedName, effectType) {
  const pool = getAgentNamesPool(confirmedName);

  if (effectType === "card") {
    return [...pool.slice(0, 6), confirmedName];
  }

  if (effectType === "glitch") {
    return [...pool.slice(0, 8), confirmedName, confirmedName];
  }

  if (effectType === "shuffle") {
    return [...pool.slice(0, 9), confirmedName];
  }

  if (effectType === "roulette") {
    return [...pool.slice(0, 10), confirmedName];
  }

  return [...pool.slice(0, 10), confirmedName, confirmedName];
}

function formatEffectText(effectType) {
  if (effectType === "slot") return "スロット式";
  if (effectType === "card") return "カードめくり式";
  if (effectType === "roulette") return "ルーレット式";
  if (effectType === "glitch") return "グリッチ式";
  return "シャッフル式";
}

function renderDrawFrame(effectType, agentName, isDecided = false, phase = "play") {
  if (!drawArea) return;

  drawArea.dataset.effect = effectType || "slot";
  drawArea.dataset.phase = phase;
  drawArea.dataset.decided = isDecided ? "true" : "false";

  let displayName = agentName || "-";

  if (phase === "play") {
    if (effectType === "slot") displayName = `│ ${displayName} │`;
    else if (effectType === "card") displayName = `【 ${displayName} 】`;
    else if (effectType === "roulette") displayName = `◯ ${displayName} ◯`;
    else if (effectType === "glitch") displayName = `# ${displayName} #`;
    else displayName = `→ ${displayName} ←`;
  }

  const lines = [
    formatEffectText(effectType),
    displayName
  ];

  if (isDecided) {
    lines.push("決定！");
  }

  drawArea.textContent = lines.join("\n");
}

async function waitForConfirmedResult(roomId, myPlayerId) {
  for (let i = 0; i < 50; i++) {
    const roomSnap = await get(ref(db, `rooms/${roomId}`));
    if (!roomSnap.exists()) {
      return null;
    }

    const roomData = roomSnap.val() || {};
    const result = roomData.results?.[myPlayerId] || null;
    if (result) {
      return result;
    }

    if (roomData.state === "lobby") {
      return null;
    }

    await wait(100);
  }

  return null;
}

async function ensureConfirmedResult(roomId, myPlayerId, ownerId) {
  const roomRef = ref(db, `rooms/${roomId}`);
  const roomSnap = await get(roomRef);
  const roomData = roomSnap.val();
  if (!roomData) return null;

  const existingResult = roomData.results?.[myPlayerId] || null;
  if (existingResult) {
    return existingResult;
  }

  const stage = roomData.stage;
  const roleComp = roomData.roleComp;
  const players = roomData.players || {};

  if (!stage || !roleComp || !MAP_COMPS[stage] || !MAP_COMPS[stage][roleComp]) {
    alert("抽選に必要な情報が不足しています");
    return null;
  }

  if (myPlayerId === ownerId) {
    const orderedPlayers = getOrderedPlayers(players, ownerId);
    if (orderedPlayers.length === 0) {
      alert("参加プレイヤーがいません");
      return null;
    }

    const selected = pickValidComp(MAP_COMPS[stage][roleComp], orderedPlayers, ownerId);
    if (!selected) {
      alert("成立する構成がありません");
      return null;
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
        agentName,
        effectType: getEffectType(player.id)
      };
    });

    await set(ref(db, `rooms/${roomId}/results`), results);
    await update(roomRef, {
      state: "draw",
      selectedComp: selected.comp,
      selectedRoleComp: roleComp,
      selectedStage: stage
    });

    return results[myPlayerId] || null;
  }

  return waitForConfirmedResult(roomId, myPlayerId);
}

function playPersonalDraw(result) {
  return new Promise(resolve => {
    const effectType = result?.effectType || getEffectType(result?.id || "");
    const confirmedName = result?.agentName || "-";
    const sequence = buildFakeSequence(confirmedName, effectType);
    let index = 0;

    let intervalMs = 90;
    if (effectType === "slot") intervalMs = 80;
    else if (effectType === "card") intervalMs = 160;
    else if (effectType === "roulette") intervalMs = 70;
    else if (effectType === "glitch") intervalMs = 55;
    else if (effectType === "shuffle") intervalMs = 95;

    renderDrawFrame(effectType, sequence[0] || confirmedName, false, "play");

    clearInterval(frameTimer);
    frameTimer = setInterval(() => {
      if (effectType === "card") {
        index = Math.min(index + 1, sequence.length - 1);
      } else {
        index = (index + 1) % sequence.length;
      }

      renderDrawFrame(effectType, sequence[index] || confirmedName, false, "play");
    }, intervalMs);

    clearTimeout(decideTimer);
    decideTimer = setTimeout(() => {
      clearInterval(frameTimer);
      frameTimer = null;
      renderDrawFrame(effectType, confirmedName, true, "decide");
      resolve();
    }, DECIDE_TIME_MS);
  });
}

async function runDraw() {
  const roomId = window.currentRoom;
  const myPlayerId = window.currentPlayerId;
  const ownerId = window.currentOwnerId;

  if (!roomId || !myPlayerId || !ownerId || drawBusy) return;

  drawBusy = true;

  try {
    const confirmedResult = await ensureConfirmedResult(roomId, myPlayerId, ownerId);
    if (!confirmedResult) {
      const roomSnap = await get(ref(db, `rooms/${roomId}`));

      if (!roomSnap.exists()) {
        alert("ルームが存在しません");
        showScreen("screen-home");
        return;
      }

      const latestRoomData = roomSnap.val() || {};
      if ((latestRoomData.state || "") === "lobby") {
        showScreen("screen-lobby");
        return;
      }

      alert("抽選結果の取得に失敗しました");
      showScreen("screen-stage-select");
      return;
    }

    await playPersonalDraw(confirmedResult);
    await wait(Math.max(0, DRAW_DURATION_MS - DECIDE_TIME_MS));

    if (myPlayerId === ownerId) {
      await update(ref(db, `rooms/${roomId}`), {
        state: "result"
      });
    }

    initPersonalResult(roomId, myPlayerId, false, {
      autoAdvance: true,
      displayMs: PERSONAL_RESULT_HOLD_MS,
      confirmedResult
    });
  } catch (error) {
    console.error(error);
    alert("抽選に失敗しました");
    showScreen("screen-stage-select");
  } finally {
    clearDrawTimers();
    drawBusy = false;
  }
}

export function startDrawAnimation(onComplete) {
  clearDrawTimers();
  showScreen("screen-draw");

  if (drawArea) {
    drawArea.dataset.effect = "prepare";
    drawArea.dataset.phase = "prepare";
    drawArea.dataset.decided = "false";
    drawArea.textContent = "結果確定中";
  }

  runDraw().finally(() => {
    if (typeof onComplete === "function") {
      onComplete();
    }
  });
}
