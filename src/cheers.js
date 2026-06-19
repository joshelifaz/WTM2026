import { db, ref, onValue, get, push, set, remove } from "./firebase.js";

const CHEERS_PATH = "cheers";
const MAX_TEXT_LENGTH = 500;
const RELATIVE_TIME_TICK_MS = 30_000;
const ADMIN_TICKER_LIMIT = 15;
const TICKER_SEPARATOR = " ✦ ";

const CHEER_LIST_EMPTY_HTML =
  '<p data-target="cheer-list-empty" class="cheer-list-empty">אין הודעות עידוד עדיין. היו הראשונים!</p>';

function queryTarget(name) {
  return document.querySelector(`[data-target="${name}"]`);
}

function formatRelativeTime(timestamp) {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "לפני רגע";
  if (diffMin === 1) return "לפני דקה";
  if (diffMin < 60) return `לפני ${diffMin} דקות`;
  if (diffHour === 1) return "לפני שעה";
  if (diffHour < 24) return `לפני ${diffHour} שעות`;
  if (diffDay === 1) return "לפני יום";
  return `לפני ${diffDay} ימים`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSortedCheerEntries(snapshot) {
  if (!snapshot.exists()) return [];

  return Object.entries(snapshot.val())
    .filter(([, item]) => item?.text && item?.timestamp)
    .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
}

function buildCheerListHtml(entries) {
  if (!entries.length) return CHEER_LIST_EMPTY_HTML;

  const admin = isAdminFn();

  return entries
    .map(([key, item]) => {
      const author = escapeHtml(item.authorName || "אורח");
      const text = escapeHtml(item.text);
      const time = formatRelativeTime(item.timestamp);
      const deleteBtn = admin
        ? `<button type="button" class="cheer-delete-btn" data-action="delete-cheer" data-cheer-id="${escapeHtml(key)}" aria-label="מחק הודעה">🗑️</button>`
        : "";

      return `<article class="cheer-item" data-cheer-id="${escapeHtml(key)}">
        <div class="cheer-item-header">
          <div class="cheer-item-meta">
            <span class="cheer-author">${author}</span>
            <time class="cheer-time" datetime="${item.timestamp}">${time}</time>
          </div>
          ${deleteBtn}
        </div>
        <p class="cheer-text">${text}</p>
      </article>`;
    })
    .join("");
}

function renderCheerList(entries) {
  const list = queryTarget("cheer-list");
  if (!list) return;
  list.innerHTML = buildCheerListHtml(entries);
}

function buildTickerRowHtml(entries) {
  const latest = entries.slice(0, ADMIN_TICKER_LIMIT);
  if (!latest.length) return "";

  return latest
    .map(([, item]) => {
      const author = escapeHtml(item.authorName || "אורח");
      const text = escapeHtml(item.text);
      return `<span class="admin-cheer-ticker__item"><strong class="admin-cheer-ticker__author">${author}:</strong> ${text}</span>`;
    })
    .join(`<span class="admin-cheer-ticker__sep" aria-hidden="true">${TICKER_SEPARATOR}</span>`);
}

function renderAdminCheerTicker(entries) {
  const wrap = queryTarget("admin-cheer-ticker");
  const track = queryTarget("admin-cheer-ticker-track");
  if (!wrap || !track) return;

  const show = shouldShowAdminTickerFn() && entries.length > 0;
  wrap.classList.toggle("hidden", !show);
  if (!show) {
    track.innerHTML = "";
    return;
  }

  const rowHtml = `<span class="admin-cheer-ticker__row">${buildTickerRowHtml(entries)}</span>`;
  track.innerHTML = `${rowHtml}${rowHtml}`;
  track.style.animation = "none";
  void track.offsetWidth;
  track.style.animation = "";
}

function syncCheerComposeChrome() {
  const compose = queryTarget("cheer-compose");
  if (!compose) return;
  compose.classList.toggle("cheer-compose--admin", isAdminFn());
}

let unsubscribe = null;
let relativeTimeTimer = null;
let cachedEntries = [];
let getAuthUserFn = () => null;
let isAdminFn = () => false;
let shouldShowAdminTickerFn = () => false;

function stopRelativeTimeTicker() {
  if (relativeTimeTimer) {
    clearInterval(relativeTimeTimer);
    relativeTimeTimer = null;
  }
}

function startRelativeTimeTicker() {
  if (relativeTimeTimer) return;
  relativeTimeTimer = setInterval(() => {
    if (cachedEntries.length) renderCheerList(cachedEntries);
  }, RELATIVE_TIME_TICK_MS);
}

function handleCheersSnapshot(snapshot) {
  cachedEntries = getSortedCheerEntries(snapshot);
  renderCheerList(cachedEntries);
  renderAdminCheerTicker(cachedEntries);
  syncCheerComposeChrome();
}

function resolveAuthorName() {
  const user = getAuthUserFn();
  const displayName = user?.displayName?.trim();
  if (displayName) return displayName;
  const emailLocal = user?.email?.split("@")[0]?.trim();
  if (emailLocal) return emailLocal;
  return "אורח";
}

export function refreshCheerBoard() {
  renderCheerList(cachedEntries);
  renderAdminCheerTicker(cachedEntries);
  syncCheerComposeChrome();
}

export function syncAdminCheerTickerVisibility() {
  renderAdminCheerTicker(cachedEntries);
}

async function hydrateCheersFromDatabase() {
  try {
    const snapshot = await get(ref(db, CHEERS_PATH));
    handleCheersSnapshot(snapshot);
  } catch (error) {
    console.error("cheers initial fetch error:", error);
  }
}

export function startCheersListener() {
  if (unsubscribe) {
    syncAdminCheerTickerVisibility();
    return;
  }

  void hydrateCheersFromDatabase();

  unsubscribe = onValue(ref(db, CHEERS_PATH), handleCheersSnapshot, (err) => {
    console.error("cheers listener error:", err);
  });
  startRelativeTimeTicker();
}

export function stopCheersListener() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  stopRelativeTimeTicker();
  cachedEntries = [];

  const list = queryTarget("cheer-list");
  if (list) list.innerHTML = CHEER_LIST_EMPTY_HTML;
  renderAdminCheerTicker([]);
  syncCheerComposeChrome();
}

export async function handleSubmitCheer() {
  const input = queryTarget("cheer-input");
  const statusEl = queryTarget("cheer-submit-status");
  const text = input?.value?.trim() || "";

  if (!text) {
    if (statusEl) statusEl.textContent = "נא לכתוב הודעה לפני השליחה";
    return;
  }

  if (!getAuthUserFn()) {
    if (statusEl) statusEl.textContent = "נדרשת התחברות לשליחת הודעה";
    return;
  }

  if (statusEl) statusEl.textContent = "";

  try {
    await set(push(ref(db, CHEERS_PATH)), {
      text: text.slice(0, MAX_TEXT_LENGTH),
      authorName: resolveAuthorName(),
      timestamp: Date.now(),
    });
    if (input) input.value = "";
    if (statusEl) statusEl.textContent = "נשלח!";
    setTimeout(() => {
      if (statusEl?.textContent === "נשלח!") statusEl.textContent = "";
    }, 2000);
  } catch (error) {
    console.error("submit cheer failed:", error);
    if (statusEl) statusEl.textContent = "שגיאה בשליחה. נסו שוב.";
  }
}

export async function handleDeleteCheer(cheerId) {
  if (!isAdminFn() || !cheerId) return;
  if (!confirm("למחוק הודעת עידוד זו?")) return;

  try {
    await remove(ref(db, `${CHEERS_PATH}/${cheerId}`));
  } catch (error) {
    console.error("delete cheer failed:", error);
    alert("שגיאה במחיקת ההודעה. נסו שוב.");
  }
}

/**
 * @param {{
 *   getAuthUser: () => import("firebase/auth").User | null;
 *   isAdmin: () => boolean;
 *   shouldShowAdminTicker: () => boolean;
 * }} options
 */
export function initCheers({ getAuthUser, isAdmin, shouldShowAdminTicker }) {
  getAuthUserFn = getAuthUser;
  isAdminFn = isAdmin;
  shouldShowAdminTickerFn = shouldShowAdminTicker || (() => false);
  syncCheerComposeChrome();

  const input = queryTarget("cheer-input");
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmitCheer();
    }
  });
}
