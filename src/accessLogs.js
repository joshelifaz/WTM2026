import { db, ref, onValue, push, set } from "./firebase.js";

const ACCESS_LOGS_PATH = "access_logs";
const LEGACY_SESSION_KEY = "accessLogged";

const ACCESS_LOG_LIST_EMPTY_HTML =
  '<p data-target="access-log-list-empty" class="cheer-list-empty">אין רשומות כניסה עדיין.</p>';

let unsubscribe = null;
let cachedEntries = [];
let isLogging = false;

function getAccessLogStorageKey(uid) {
  return `accessLogged_${uid}`;
}

function hasLoggedThisSession(user) {
  return sessionStorage.getItem(getAccessLogStorageKey(user.uid)) === "true";
}

export function clearAccessLogSession(uid = null) {
  sessionStorage.removeItem(LEGACY_SESSION_KEY);
  if (uid) {
    sessionStorage.removeItem(getAccessLogStorageKey(uid));
  }
  isLogging = false;
}

function queryTarget(name) {
  return document.querySelector(`[data-target="${name}"]`);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatAccessLogTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("he-IL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getSortedAccessLogEntries(snapshot) {
  if (!snapshot.exists()) return [];

  return Object.entries(snapshot.val())
    .filter(([, item]) => item?.timestamp)
    .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
}

function buildAccessLogListHtml(entries) {
  if (!entries.length) return ACCESS_LOG_LIST_EMPTY_HTML;

  return entries
    .map(([, item]) => {
      const time = formatAccessLogTime(item.timestamp);
      const name = escapeHtml(item.name || "—");
      const email = escapeHtml(item.email || "—");

      return `<article class="access-log-item" dir="rtl">
        <div class="access-log-row access-log-row--top">
          <span class="access-log-name" dir="auto">${name}</span>
          <time class="access-log-time" datetime="${item.timestamp}" dir="ltr">${time}</time>
        </div>
        <div class="access-log-row access-log-row--bottom">
          <span class="access-log-email" dir="ltr">${email}</span>
        </div>
      </article>`;
    })
    .join("");
}

function renderAccessLogList(entries) {
  const list = queryTarget("access-log-list");
  if (!list) return;
  list.innerHTML = buildAccessLogListHtml(entries);
}

function handleAccessLogsSnapshot(snapshot) {
  cachedEntries = getSortedAccessLogEntries(snapshot);
  renderAccessLogList(cachedEntries);
}

export async function logAccessIfNeeded(user) {
  if (!user?.uid) return;

  sessionStorage.removeItem(LEGACY_SESSION_KEY);

  const storageKey = getAccessLogStorageKey(user.uid);

  console.log("Logging attempt...", {
    uid: user.uid,
    sessionFlag: sessionStorage.getItem(storageKey),
  });

  if (hasLoggedThisSession(user)) {
    console.log("Access log skipped: already logged this session.");
    return;
  }

  if (isLogging) {
    console.log("Access log skipped: write already in progress.");
    return;
  }

  isLogging = true;

  try {
    await user.getIdToken();

    await set(push(ref(db, ACCESS_LOGS_PATH)), {
      uid: user.uid,
      name: user.displayName,
      email: user.email,
      timestamp: Date.now(),
    });

    sessionStorage.setItem(storageKey, "true");
    console.log("Log successful!");
  } catch (error) {
    console.error("access log write failed:", error);
    sessionStorage.removeItem(storageKey);
  } finally {
    isLogging = false;
  }
}

export function startAccessLogsListener() {
  if (unsubscribe) return;

  unsubscribe = onValue(ref(db, ACCESS_LOGS_PATH), handleAccessLogsSnapshot, (error) => {
    console.error("access logs listener error:", error);
  });
}

export function stopAccessLogsListener() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  cachedEntries = [];
  const list = queryTarget("access-log-list");
  if (list) list.innerHTML = ACCESS_LOG_LIST_EMPTY_HTML;
}
