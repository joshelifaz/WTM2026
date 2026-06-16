import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, push } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAKWp9m1MJz4W7zGY4bXkXhnahiqBfHQfQ",
  authDomain: "wtm2026-fb982.firebaseapp.com",
  databaseURL: "https://wtm2026-fb982-default-rtdb.firebaseio.com",
  projectId: "wtm2026-fb982",
  storageBucket: "wtm2026-fb982.firebasestorage.app",
  messagingSenderId: "1041094852732",
  appId: "1:1041094852732:web:119adcea8caedb6e2a89f9"
};

export const db = getDatabase(initializeApp(firebaseConfig));
export { ref, onValue, set, update, push };
