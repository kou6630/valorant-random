// js/draw.js

import { showScreen } from "./app.js";

const drawArea = document.getElementById("drawAnimationArea");

let drawTimer = null;
let frameTimer = null;

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
  drawArea.textContent = frames[0];

  clearInterval(frameTimer);
  clearTimeout(drawTimer);

  frameTimer = setInterval(() => {
    index = (index + 1) % frames.length;
    drawArea.textContent = frames[index];
  }, 250);

  drawTimer = setTimeout(() => {
    clearInterval(frameTimer);
    frameTimer = null;
    drawArea.textContent = "決定！";

    if (typeof onComplete === "function") {
      onComplete();
    }
  }, 3000);
}