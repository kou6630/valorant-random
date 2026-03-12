// js/storage.js

const NAME_KEY = "valorant_random_name";
const PASS_KEY = "valorant_random_pass";
const AGENT_SETTINGS_KEY = "valorant_agent_settings";

export function savePlayerName(name) {
  localStorage.setItem(NAME_KEY, name);
}

export function loadPlayerName() {
  return localStorage.getItem(NAME_KEY) || "";
}

export function saveRoomPass(pass) {
  localStorage.setItem(PASS_KEY, pass);
}

export function loadRoomPass() {
  return localStorage.getItem(PASS_KEY) || "";
}

export function saveAgentSettings(settings) {
  localStorage.setItem(AGENT_SETTINGS_KEY, JSON.stringify(settings));
}

export function loadAgentSettings() {
  const data = localStorage.getItem(AGENT_SETTINGS_KEY);
  if (!data) return null;

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function clearRoomPass() {
  localStorage.removeItem(PASS_KEY);
}

export function clearPlayerName() {
  localStorage.removeItem(NAME_KEY);
}