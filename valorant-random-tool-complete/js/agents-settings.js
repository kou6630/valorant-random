// js/agents-settings.js

import { AGENTS } from "../data/agents.js";

const list = document.getElementById("agentSettingsList");
const saveBtn = document.getElementById("saveAgentSettingsBtn");
const allBtn = document.getElementById("setAllAgentsOwnedBtn");
const backBtn = document.getElementById("backToHomeFromSettingsBtn");

const STORAGE_KEY = "agentUnlockSettings";

function loadSettings() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function createAgentItem(agent, enabled) {
  const wrapper = document.createElement("div");
  wrapper.className = "agent-item";

  const img = document.createElement("img");
  img.src = `img/agents/${agent.id}.png`;
  img.alt = agent.name;

  const label = document.createElement("label");
  label.textContent = agent.name;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = enabled;
  checkbox.dataset.agent = agent.id;

  wrapper.appendChild(img);
  wrapper.appendChild(label);
  wrapper.appendChild(checkbox);

  return wrapper;
}

function render() {
  list.innerHTML = "";

  const saved = loadSettings();
  const settings = saved || {};

  AGENTS.forEach(agent => {
    const enabled = settings[agent.id] !== false;
    const item = createAgentItem(agent, enabled);
    list.appendChild(item);
  });
}

function collectSettings() {
  const inputs = list.querySelectorAll("input[type=checkbox]");
  const result = {};

  inputs.forEach(i => {
    result[i.dataset.agent] = i.checked;
  });

  return result;
}

saveBtn.addEventListener("click", () => {
  const settings = collectSettings();
  saveSettings(settings);
  alert("保存しました");
});

allBtn.addEventListener("click", () => {
  const inputs = list.querySelectorAll("input[type=checkbox]");
  inputs.forEach(i => (i.checked = true));
});

backBtn.addEventListener("click", () => {
  document.getElementById("screen-agent-settings").classList.remove("active");
  document.getElementById("screen-home").classList.add("active");
});

render();