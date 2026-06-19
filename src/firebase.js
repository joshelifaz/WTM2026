import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, push, remove, get } from "firebase/database";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAKWp9m1MJz4W7zGY4bXkXhnahiqBfHQfQ",
  authDomain: "wtm2026-fb982.firebaseapp.com",
  databaseURL: "https://wtm2026-fb982-default-rtdb.firebaseio.com",
  projectId: "wtm2026-fb982",
  storageBucket: "wtm2026-fb982.firebasestorage.app",
  messagingSenderId: "1041094852732",
  appId: "1:1041094852732:web:119adcea8caedb6e2a89f9"
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export {
  ref,
  onValue,
  set,
  update,
  push,
  remove,
  get,
  storageRef,
  uploadBytes,
  getDownloadURL,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
};
