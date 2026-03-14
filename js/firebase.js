// js/firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCwmQvy1tC_5HR-qrraR9U9IL3jffAaNYM",
  authDomain: "valorant-random-f9f34.firebaseapp.com",
  databaseURL: "https://valorant-random-f9f34-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "valorant-random-f9f34",
  storageBucket: "valorant-random-f9f34.firebasestorage.app",
  messagingSenderId: "540032263062",
  appId: "1:540032263062:web:35436ae7fc639d9b26b3b7"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { app, db };
