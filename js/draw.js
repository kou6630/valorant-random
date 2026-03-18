// js/draw.js

import { db } from "./firebase.js";
import { showScreen } from "./app.js";
import { initPersonalResult } from "./personal-result.js";
import {
  ref,
  get,
  set,
  update,
  remove
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
const LOCAL_RESULTS_KEY = "valorant_last_results";
const DRAW_DURATION_MS = 8000;
const DECIDE_TIME_MS = 7200;
const PERSONAL_RESULT_HOLD_MS = 5000;
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

function saveLocalResults(roomId, results, meta = {}) {
  try {
    const payload = {
      roomId: String(roomId || ""),
      results: results || {},
      savedAt: Date.now(),
      ...meta
    };

    localStorage.setItem(LOCAL_RESULTS_KEY, JSON.stringify(payload));
    window.lastDrawResults = payload;
  } catch {
    window.lastDrawResults = {
      roomId: String(roomId || ""),
      results: results || {},
      savedAt: Date.now(),
      ...meta
    };
  }
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
    return [...pool.slice(0, 9), confirmedName];
  }

  if (effectType === "glitch") {
    return [...pool.slice(0, 12), confirmedName, confirmedName, confirmedName];
  }

  if (effectType === "shuffle") {
    return [...pool.slice(0, 12), confirmedName];
  }

  if (effectType === "roulette") {
    return [...pool.slice(0, 14), confirmedName];
  }

  return [...pool.slice(0, 14), confirmedName, confirmedName, confirmedName];
}

function formatEffectText(effectType) {
  if (effectType === "slot") return "slot";
  if (effectType === "card") return "card";
  if (effectType === "roulette") return "roulette";
  if (effectType === "glitch") return "glitch";
  return "shuffle";
}

function padCenter(text, width = 14) {
  const value = String(text || "-");
  const space = Math.max(0, width - value.length);
  const left = Math.floor(space / 2);
  const right = space - left;
  return `${" ".repeat(left)}${value}${" ".repeat(right)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getAgentImageSrc(agentName) {
  const agentId = getAgentIdByName(agentName);
  return agentId ? `img/agents/${agentId}.png` : "";
}

function renderAgentTile(agentName, className = "", label = "") {
  const src = getAgentImageSrc(agentName);
  const safeName = escapeHtml(agentName || "-");
  const rawClass = String(className || "").trim();
  const safeClass = escapeHtml(rawClass);
  const baseClass = rawClass.includes(" ") ? rawClass.split(" ")[0] : (rawClass || "draw-agent-tile");
  const safeBaseClass = escapeHtml(baseClass);
  const safeLabel = label ? `<div class="${safeBaseClass}-label">${escapeHtml(label)}</div>` : "";

  if (!src) {
    return `
      <div class="${safeClass}">
        <div class="${safeBaseClass}-fallback">${safeName}</div>
        ${safeLabel}
      </div>
    `;
  }

  return `
    <div class="${safeClass}">
      <img src="${escapeHtml(src)}" alt="${safeName}" class="${safeBaseClass}-img" loading="eager" decoding="async">
      <div class="${safeBaseClass}-name">${safeName}</div>
      ${safeLabel}
    </div>
  `;
}

function buildSlotFrame(agentName, phase, progress) {
  const pool = getAgentNamesPool(agentName);
  const topName = phase === "decide"
    ? agentName
    : (progress > 0.82 ? agentName : (pool[0] || agentName));
  const bottomName = phase === "decide"
    ? agentName
    : (progress > 0.9 ? agentName : (pool[1] || agentName));
  const glowClass = phase === "decide" ? " draw-slot is-decide" : (progress > 0.72 ? " draw-slot is-slow" : " draw-slot");

  return `
    <div class="${glowClass}">
      <div class="draw-slot-reel draw-slot-reel-top">${renderAgentTile(topName, "draw-slot-card")}</div>
      <div class="draw-slot-reel draw-slot-reel-center">${renderAgentTile(agentName, "draw-slot-card", phase === "decide" ? "決定" : "")}</div>
      <div class="draw-slot-reel draw-slot-reel-bottom">${renderAgentTile(bottomName, "draw-slot-card")}</div>
    </div>
  `;
}

function buildCardFrame(agentName, phase, progress) {
  const totalCards = 10;
  const revealedCount = phase === "decide"
    ? totalCards
    : Math.max(0, Math.min(totalCards, Math.floor(progress * (totalCards + 1))));

  const cards = Array.from({ length: totalCards }, (_, index) => {
    const isLast = index === totalCards - 1;
    const isOpened = index < revealedCount;

    if (!isOpened) {
      return "[ 伏せ ]";
    }

    if (isLast) {
      return `[ ${padCenter(agentName, 6)} ]`;
    }

    return "[ハズレ]";
  });

  const topRow = cards.slice(0, 5).join("  ");
  const bottomRow = cards.slice(5, 10).join("  ");
  const focus = phase === "decide"
    ? "▼ 最後の1枚で決定 ▼"
    : revealedCount >= totalCards ? "▼ 本命オープン ▼" : "▼ 1枚ずつ公開 ▼";

  return [topRow, "", bottomRow, focus].filter(Boolean).join("\\n");
}

function buildRouletteFrame(agentName, phase, progress) {
  const pool = getAgentNamesPool(agentName);
  const leftName = phase === "decide"
    ? agentName
    : (progress > 0.88 ? agentName : (pool[0] || agentName));
  const centerName = agentName;
  const rightName = phase === "decide"
    ? agentName
    : (progress > 0.94 ? agentName : (pool[1] || agentName));
  const marker = phase === "decide" ? "▼ 3枚一致 ▼" : progress > 0.72 ? "▼ そろいかけ ▼" : "▼ 回転中 ▼";

  return [
    `        ${marker}`,
    "┌────────┐ ┌────────┐ ┌────────┐",
    `│${padCenter(leftName, 8)}│ │${padCenter(centerName, 8)}│ │${padCenter(rightName, 8)}│`,
    "└────────┘ └────────┘ └────────┘"
  ].join("\\n");
}

function buildGlitchText(agentName, progress) {
  const chars = String(agentName || "-").split("");
  const noise = ["#", "%", "@", "&", "/", "*", "+", "="];
  return chars.map((char, index) => {
    if (progress > 0.8 || Math.random() > 0.35 + (progress * 0.45)) {
      return char;
    }
    return noise[(index + Math.floor(Math.random() * noise.length)) % noise.length];
  }).join("");
}

function buildGlitchSlices(agentName, progress) {
  const src = getAgentImageSrc(agentName);
  const safeName = escapeHtml(agentName || "-");
  if (!src) {
    return `<div class="draw-glitch-fallback">${escapeHtml(buildGlitchText(agentName, progress))}</div>`;
  }

  const offsets = [
    `${Math.round((0.5 - Math.random()) * 28)}px`,
    `${Math.round((0.5 - Math.random()) * 20)}px`,
    `${Math.round((0.5 - Math.random()) * 32)}px`
  ];

  return `
    <div class="draw-glitch-stack">
      <img src="${escapeHtml(src)}" alt="${safeName}" class="draw-glitch-img draw-glitch-base" loading="eager" decoding="async">
      <img src="${escapeHtml(src)}" alt="${safeName}" class="draw-glitch-img draw-glitch-slice draw-glitch-slice-a" style="transform:translateX(${offsets[0]});" loading="eager" decoding="async">
      <img src="${escapeHtml(src)}" alt="${safeName}" class="draw-glitch-img draw-glitch-slice draw-glitch-slice-b" style="transform:translateX(${offsets[1]});" loading="eager" decoding="async">
      <img src="${escapeHtml(src)}" alt="${safeName}" class="draw-glitch-img draw-glitch-slice draw-glitch-slice-c" style="transform:translateX(${offsets[2]});" loading="eager" decoding="async">
    </div>
  `;
}

function buildGlitchFrame(agentName, phase, progress) {
  const content = phase === "decide"
    ? renderAgentTile(agentName, "draw-glitch-card", "決定")
    : buildGlitchSlices(agentName, progress);

  return `
    <div class="draw-glitch ${phase === "decide" ? "is-decide" : ""}">
      ${content}
      <div class="draw-glitch-name">${escapeHtml(phase === "decide" ? agentName : buildGlitchText(agentName, progress))}</div>
    </div>
  `;
}

function buildShuffleFrame(agentName, phase, progress) {
  const pool = shuffle(getAgentNamesPool(agentName)).slice(0, 4);
  const center = phase === "decide" ? agentName : (progress > 0.78 ? agentName : (pool[0] || agentName));
  const left = pool[1] || agentName;
  const right = pool[2] || agentName;
  const tail = pool[3] || agentName;

  return `
    <div class="draw-shuffle ${phase === "decide" ? "is-decide" : ""}">
      <div class="draw-shuffle-row draw-shuffle-row-top">
        ${renderAgentTile(left, "draw-shuffle-card draw-shuffle-side")}
        ${renderAgentTile(right, "draw-shuffle-card draw-shuffle-side")}
      </div>
      <div class="draw-shuffle-row draw-shuffle-row-center">
        ${renderAgentTile(center, "draw-shuffle-card draw-shuffle-main", phase === "decide" ? "決定" : "")}
      </div>
      <div class="draw-shuffle-row draw-shuffle-row-bottom">
        ${renderAgentTile(tail, "draw-shuffle-card draw-shuffle-side")}
        ${renderAgentTile(left, "draw-shuffle-card draw-shuffle-side")}
      </div>
    </div>
  `;
}

function buildDecideBadge() {
  return "\\n\\n★ 決定 ★";
}

function renderDrawFrame(effectType, agentName, isDecided = false, phase = "play", progress = 0) {
  if (!drawArea) return;

  drawArea.dataset.effect = effectType || "slot";
  drawArea.dataset.phase = phase;
  drawArea.dataset.decided = isDecided ? "true" : "false";

  const safeName = agentName || "-";
  let content = "";
  let useHtml = false;

  if (effectType === "slot") {
    content = buildSlotFrame(safeName, phase, progress);
    useHtml = true;
  } else if (effectType === "card") {
    content = buildCardFrame(safeName, phase, progress);
  } else if (effectType === "roulette") {
    content = buildRouletteFrame(safeName, phase, progress);
  } else if (effectType === "glitch") {
    content = buildGlitchFrame(safeName, phase, progress);
    useHtml = true;
  } else {
    content = buildShuffleFrame(safeName, phase, progress);
    useHtml = true;
  }

  if (useHtml) {
    drawArea.innerHTML = isDecided ? `${content}<div class="draw-decide-badge">★ 決定 ★</div>` : content;
  } else {
    drawArea.textContent = isDecided ? `${content}${buildDecideBadge()}` : content;
  }
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
      saveLocalResults(roomId, roomData.results || {}, {
        selectedComp: roomData.selectedComp || null,
        selectedRoleComp: roomData.selectedRoleComp || null,
        selectedStage: roomData.selectedStage || null
      });
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

    saveLocalResults(roomId, results, {
      selectedComp: selected.comp,
      selectedRoleComp: roleComp,
      selectedStage: stage
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
    let tick = 0;
    const startAt = Date.now();

    renderDrawFrame(effectType, sequence[0] || confirmedName, false, "play", 0);

    clearInterval(frameTimer);
    frameTimer = setInterval(() => {
      const elapsed = Date.now() - startAt;
      const progress = Math.max(0, Math.min(1, elapsed / DECIDE_TIME_MS));
      const eased = 1 - Math.pow(1 - progress, 3);

      if (effectType === "card") {
        index = Math.min(Math.floor(eased * (sequence.length - 1)), sequence.length - 1);
      } else if (effectType === "roulette") {
        const step = progress < 0.55 ? 1 : (tick % (progress > 0.82 ? 4 : 2) === 0 ? 1 : 0);
        index = (index + step) % sequence.length;
      } else if (effectType === "glitch") {
        const nearEnd = progress > 0.84;
        index = nearEnd ? sequence.length - 1 : (index + 1 + (tick % 2)) % sequence.length;
      } else if (effectType === "shuffle") {
        index = progress > 0.8 ? sequence.length - 1 : (index + 1) % sequence.length;
      } else {
        const step = progress < 0.62 ? 1 : (tick % (progress > 0.85 ? 5 : 2) === 0 ? 1 : 0);
        index = (index + step) % sequence.length;
      }

      tick += 1;
      const currentName = sequence[index] || confirmedName;
      renderDrawFrame(effectType, currentName, false, "play", progress);
    }, 50);

    clearTimeout(decideTimer);
    decideTimer = setTimeout(() => {
      clearInterval(frameTimer);
      frameTimer = null;
      renderDrawFrame(effectType, confirmedName, true, "decide", 1);
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
      await remove(ref(db, `rooms/${roomId}`));
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
    drawArea.textContent = "";
  }

  runDraw().finally(() => {
    if (typeof onComplete === "function") {
      onComplete();
    }
  });
}
