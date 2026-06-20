import { db, ref, update } from "./firebase.js";
import { RACE_PATH } from "./store.js";

const QUEUE_KEY = "WTM_QUEUE";
const SNAPSHOT_KEY = "WTM_SNAPSHOT";

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export class OfflineSyncManager {
  static saveSnapshot(state) {
    if (!state) return;
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(state));
  }

  static loadSnapshot() {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  static enqueueAction(updates) {
    const queue = readQueue();
    queue.push({ id: Date.now(), updates, failed: false });
    writeQueue(queue);
  }

  static getPendingCount() {
    return readQueue().length;
  }

  static async processQueue() {
    const queue = readQueue();
    if (!queue.length) return;

    const remaining = [];

    for (const item of queue) {
      try {
        await update(ref(db, RACE_PATH), item.updates);
      } catch (error) {
        item.failed = true;
        console.error("Offline sync queue item failed:", error);
        remaining.push(item);
      }
    }

    writeQueue(remaining);
    return remaining.length;
  }
}
