// js/agents-settings.js

import { AGENTS } from "../data/agents.js";
import { showScreen } from "./app.js";

const list = document.getElementById("agentSettingsList");
const saveBtn = document.getElementById("saveAgentSettingsBtn");
const allBtn = document.getElementById("setAllAgentsOwnedBtn");
const backBtn = document.getElementById("backToHomeFromSettingsBtn");

const AGENT_SETTINGS_KEY = "valorant_agent_settings";
const LEGACY_STORAGE_KEY = "agentUnlockSettings";

function loadSettings() {
  const saved =
    localStorage.getItem(AGENT_SETTINGS_KEY) ||
    localStorage.getItem(LEGACY_STORAGE_KEY);

  if (!saved) return {};

  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  const value = JSON.stringify(settings);
  localStorage.setItem(AGENT_SETTINGS_KEY, value);
  localStorage.setItem(LEGACY_STORAGE_KEY, value);
}

function createAgentItem(agent, enabled) {
  const wrapper = document.createElement("button");
  wrapper.type = "button";
  wrapper.className = `agent-item${enabled ? "" : " is-locked"}`;
  wrapper.dataset.agent = agent.id;
  wrapper.dataset.enabled = enabled ? "true" : "false";
  wrapper.setAttribute("aria-pressed", enabled ? "true" : "false");
  wrapper.setAttribute("aria-label", `${agent.name}を${enabled ? "所持済み" : "未所持"}にする`);

  const img = document.createElement("img");
  img.src = `img/agents/${agent.id}.png`;
  img.alt = agent.name;
  img.loading = "lazy";

  const label = document.createElement("div");
  label.className = "agent-item-name";
  label.textContent = agent.name;

  wrapper.appendChild(img);
  wrapper.appendChild(label);

  return wrapper;
}

export function initAgentSettings() {
  render();
}

function render() {
  if (!list) return;

  list.innerHTML = "";
  const settings = loadSettings();

  AGENTS.forEach((agent) => {
    const enabled = settings[agent.id] !== false;
    const item = createAgentItem(agent, enabled);
    list.appendChild(item);
  });
}

function collectSettings() {
  if (!list) return {};

  const items = list.querySelectorAll(".agent-item[data-agent]");
  const result = {};

  items.forEach((item) => {
    result[item.dataset.agent] = item.dataset.enabled !== "false";
  });

  return result;
}

saveBtn?.addEventListener("click", () => {
  const settings = collectSettings();
  saveSettings(settings);
  alert("保存しました");
});

allBtn?.addEventListener("click", () => {
  if (!list) return;

  const items = list.querySelectorAll(".agent-item[data-agent]");
  items.forEach((item) => {
    item.dataset.enabled = "true";
    item.classList.remove("is-locked");
    item.setAttribute("aria-pressed", "true");
  });
});

list?.addEventListener("click", (event) => {
  const item = event.target.closest(".agent-item[data-agent]");
  if (!item) return;

  const enabled = item.dataset.enabled !== "false";
  const nextEnabled = !enabled;

  item.dataset.enabled = nextEnabled ? "true" : "false";
  item.classList.toggle("is-locked", !nextEnabled);
  item.setAttribute("aria-pressed", nextEnabled ? "true" : "false");
});

backBtn?.addEventListener("click", () => {
  showScreen("screen-home");
});

render();
