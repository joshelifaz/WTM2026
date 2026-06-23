import "./style.css";
import { store } from "./store.js";
import {
  initLiveUpdates,
  handleUploadLiveImage,
  handleDeleteLiveImage,
  startLiveUpdatesListener,
  stopLiveUpdatesListener,
  closeLightbox,
  downloadLightboxImage,
} from "./liveUpdates.js";
import {
  initCheers,
  handleSubmitCheer,
  handleDeleteCheer,
  refreshCheerBoard,
  syncAdminCheerTickerVisibility,
  startCheersListener,
  stopCheersListener,
} from "./cheers.js";
import {
  logAccessIfNeeded,
  clearAccessLogSession,
  startAccessLogsListener,
  stopAccessLogsListener,
} from "./accessLogs.js";
import { ADMIN_PIN } from "./data.js";
import { OfflineSyncManager } from "./offlineSync.js";
import {
  auth,
  db,
  googleProvider,
  ref,
  set,
  remove,
  onValue,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "./firebase.js";

/** Layout-agnostic DOM accessors */
function target(name) {
  return document.querySelector(`[data-target="${name}"]`);
}

function targets(name) {
  return document.querySelectorAll(`[data-target="${name}"]`);
}

function setAllTargetText(name, text) {
  targets(name).forEach((el) => {
    el.textContent = text;
  });
}

function setAllTargetHtml(name, html) {
  targets(name).forEach((el) => {
    el.innerHTML = html;
  });
}

function action(name) {
  return document.querySelector(`[data-action="${name}"]`);
}

function viewEl(mode) {
  return document.querySelector(`[data-view="${mode}"]`);
}

const ADMIN_PIN_KEY = "wtm_admin_pin";
const DARK_MODE_KEY = "wtm_dark_mode";
const SUPER_ADMIN = "joshelifaz@gmail.com";
const SUPER_ADMIN_UID = "axbbTldIG9Pg1xfHk5tWrDlPUeJ2";
const ADMINS_PATH = "settings/admins";
const HEADER_LOGO_LIGHT = "/logo192D.png";
const HEADER_LOGO_DARK = "/logo192T.png";

let authUser = null;
let authRole = "viewer";
let adminsMap = {};
let unsubscribeAdmins = null;
let appListenersStarted = false;

function encodeEmail(email) {
  return email.trim().toLowerCase().replace(/\./g, ",");
}

function decodeEmail(encoded) {
  return encoded.replace(/,/g, ".");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isAdmin() {
  return authRole === "admin";
}

function isSuperAdminUid() {
  const uid = auth.currentUser?.uid ?? authUser?.uid;
  return uid === SUPER_ADMIN_UID;
}

function logSuperAdminAuthCheck() {
  const uid = auth.currentUser?.uid ?? authUser?.uid ?? null;
  const authorized = uid === SUPER_ADMIN_UID;
  console.log(`Admin Check - Auth UID: ${uid ?? "null"}, Authorized: ${authorized}`);
}

function evaluateAuthRole() {
  if (!authUser?.email) {
    authRole = "viewer";
  } else {
    const encoded = encodeEmail(authUser.email);
    const isAuthorized =
      authUser.email.toLowerCase() === SUPER_ADMIN || adminsMap[encoded] === true;
    authRole = isAuthorized ? "admin" : "viewer";
  }

  state.isEditor = isAdmin();
  applyRoleUI();

  const appVisible = !target("login-screen")?.classList.contains("hidden");
  if (appVisible) {
    applyRoleShell();
    renderAll();
  }
}

function renderAdminEmailList() {
  const list = target("admin-email-list");
  if (!list) return;

  const entries = Object.keys(adminsMap).filter((key) => adminsMap[key]);
  if (!entries.length) {
    list.innerHTML =
      '<li class="admin-email-list-empty" data-target="admin-list-empty">אין מנהלים רשומים</li>';
    return;
  }

  list.innerHTML = entries
    .map((encoded) => {
      const email = decodeEmail(encoded);
      const isSuper = email.toLowerCase() === SUPER_ADMIN;
      const removeBtn = isSuper
        ? ""
        : `<button type="button" class="btn-cancel" data-action="remove-admin" data-email="${encoded}">הסר</button>`;
      return `<li><span dir="ltr">${email}</span>${removeBtn}</li>`;
    })
    .join("");
}

function stopDatabaseListeners() {
  if (unsubscribeAdmins) {
    unsubscribeAdmins();
    unsubscribeAdmins = null;
  }
  store.stopListening();
  stopLiveUpdatesListener();
  stopCheersListener();
  stopAccessLogsListener();
  appListenersStarted = false;
  adminsMap = {};
}

function startAppDataListeners() {
  if (appListenersStarted) return;
  appListenersStarted = true;
  store.startListening();
  startLiveUpdatesListener();
  startCheersListener();
}

function startDatabaseListeners() {
  unsubscribeAdmins = onValue(
    ref(db, ADMINS_PATH),
    (snapshot) => {
      adminsMap = snapshot.val() || {};
      renderAdminEmailList();
      evaluateAuthRole();
    },
    (error) => {
      console.error("admins listener error:", error);
    }
  );
}

function resetClientRaceState() {
  return {
    isEditor: false,
    mode: "manager",
    managerTab: "dashboard",
    editingId: null,
  };
}

async function googleSignIn() {
  const errorEl = target("login-error");
  if (errorEl) errorEl.textContent = "";

  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Google sign-in failed:", error);
    if (errorEl) errorEl.textContent = "שגיאה בהתחברות עם Google";
  }
}

async function addAdminEmail() {
  if (!isAdmin()) return;

  const input = target("new-admin-input");
  const email = input?.value?.trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    alert("נא להזין כתובת אימייל תקינה");
    return;
  }

  const encoded = encodeEmail(email);
  try {
    await set(ref(db, `${ADMINS_PATH}/${encoded}`), true);
    if (input) input.value = "";
  } catch (error) {
    console.error("addAdminEmail failed:", error);
    alert("שגיאה בהוספת מנהל");
  }
}

async function removeAdminEmail(encodedEmail) {
  if (!isAdmin() || !encodedEmail) return;

  if (decodeEmail(encodedEmail).toLowerCase() === SUPER_ADMIN) return;

  try {
    await remove(ref(db, `${ADMINS_PATH}/${encodedEmail}`));
  } catch (error) {
    console.error("removeAdminEmail failed:", error);
    alert("שגיאה בהסרת מנהל");
  }
}

function initAuth() {
  onAuthStateChanged(auth, (user) => {
    stopDatabaseListeners();
    const previousUid = authUser?.uid;
    authUser = user;

    if (user) {
      void logAccessIfNeeded(user);
      evaluateAuthRole();
      logSuperAdminAuthCheck();
      renderMenu();

      target("login-screen")?.classList.add("hidden");
      target("main-app")?.classList.remove("hidden");
      applyRoleShell();
      startAppDataListeners();
      startDatabaseListeners();
      return;
    }

    authRole = "viewer";
    state = resetClientRaceState();
    clearAccessLogSession(previousUid);
    logSuperAdminAuthCheck();
    renderMenu();

    target("main-app")?.classList.add("hidden");
    target("login-screen")?.classList.remove("hidden");
    applyRoleUI();
  });
}

function getAdminPin() {
  return localStorage.getItem(ADMIN_PIN_KEY) || ADMIN_PIN;
}

function setAdminPin(pin) {
  localStorage.setItem(ADMIN_PIN_KEY, pin);
}

let state = {
  isEditor: false,
  mode: "manager",
  managerTab: "dashboard",
  editingId: null,
  scheduleEditorIsNew: false,
  editingTriggerId: null,
  triggerEditorIsNew: false,
};

function applyRoleUI() {
  const admin = isAdmin();
  state.isEditor = admin;

  document.body.classList.toggle("is-admin", admin);
  document.body.classList.toggle("view-only", !admin);

  if (!admin) {
    target("editor-panel")?.classList.remove("open");
    closeEditor();
    state.editingId = null;
    state.scheduleEditorIsNew = false;
  }

  renderMenu();
  updateLockBadge();
  refreshCheerBoard();
}

function isInViewerPreview() {
  return isAdmin() && state.mode === "viewer-preview";
}

function isUploadViewVisible() {
  const uploadView = target("admin-media-view");
  return Boolean(uploadView && !uploadView.classList.contains("hidden"));
}

function isAccessLogsViewVisible() {
  const accessLogsView = target("access-logs-view");
  return Boolean(accessLogsView && !accessLogsView.classList.contains("hidden"));
}

function shouldShowAdminCheerTicker() {
  // Hide on overlays
  if (typeof isUploadViewVisible === "function" && isUploadViewVisible()) return false;
  if (typeof isAccessLogsViewVisible === "function" && isAccessLogsViewVisible()) return false;

  // Admin in manager mode: show only on dashboard
  if (isAdmin() && state.mode === "manager") {
    return state.managerTab === "dashboard";
  }

  // Viewers (or admins in viewer mode): always show
  return true;
}

function applyAdminShellChrome() {
  const admin = isAdmin();
  const preview = isInViewerPreview();
  const uploadVisible = isUploadViewVisible();
  const accessLogsVisible = isAccessLogsViewVisible();

  document.body.classList.toggle("viewer-preview-mode", preview);

  target("action-bar")?.classList.toggle("hidden", !admin || preview);

  const showAdminTabs =
    admin && !preview && state.mode === "manager" && !uploadVisible && !accessLogsVisible;
  target("content-tab-bar")?.classList.toggle("hidden", !showAdminTabs);

  const showViewerTabs = !admin || preview;
  target("viewer-tabs")?.classList.toggle("hidden", !showViewerTabs);

  syncAdminCheerTickerVisibility();
}

const SHELL_VIEW_TARGETS = [
  "live-update-view",
  "admin-media-view",
  "viewer-status-view",
  "cheer-board-view",
  "access-logs-view",
];

function hideAllShellViews() {
  stopAccessLogsListener();
  Object.values(CONTENT_VIEWS).forEach((targetName) => {
    target(targetName)?.classList.add("hidden");
  });
  SHELL_VIEW_TARGETS.forEach((name) => {
    target(name)?.classList.add("hidden");
  });
  document.querySelectorAll("[data-view]").forEach((v) => v.classList.remove("active"));
}

function setViewerTabActive(actionName) {
  document
    .querySelectorAll(
      '[data-action="nav-viewer-status"], [data-action="nav-viewer-gallery"], [data-action="nav-viewer-cheers"]'
    )
    .forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.action === actionName);
    });
}

function applyRoleShell() {
  const admin = isAdmin();
  applyAdminShellChrome();

  if (admin) {
    if (isInViewerPreview()) {
      hideAllShellViews();
      navViewerStatus();
      renderMenu("viewer-preview");
      return;
    }

    hideAllShellViews();
    viewEl("manager")?.classList.add("active");
    switchTab(state.managerTab || "dashboard");
    renderMenu("dashboard");
    return;
  }

  hideAllShellViews();
  navViewerStatus();
  document.querySelectorAll('[data-action="switch-tab"]').forEach((btn) => {
    btn.classList.remove("active");
  });
  renderMenu();
}

function updateConnectionStatus() {
  const el = target("connection-status");
  if (!el) return;
  const online = navigator.onLine;
  el.textContent = online ? "🟢 Online" : "🔴 Offline";
  el.classList.toggle("offline", !online);
}

function updateOfflineUI() {
  const banner = document.getElementById("offline-status-banner");
  if (!banner) return;

  if (!navigator.onLine) {
    banner.textContent = "מצב לא מקוון - ממתין לסינכרון...";
    banner.classList.remove("hidden");
  } else {
    banner.textContent = "";
    banner.classList.add("hidden");
  }
}

function updateHeaderLogo() {
  const logo = target("header-logo");
  if (!logo) return;
  const dark = document.body.classList.contains("dark-mode");
  logo.src = dark ? HEADER_LOGO_DARK : HEADER_LOGO_LIGHT;
}

function syncThemeAttribute() {
  const dark = document.body.classList.contains("dark-mode");
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  updateHeaderLogo();
}

function initDarkMode() {
  if (localStorage.getItem(DARK_MODE_KEY) === "1") {
    document.body.classList.add("dark-mode");
  }
  syncThemeAttribute();
  updateDarkModeButton();
}

function updateDarkModeButton() {
  const dark = document.body.classList.contains("dark-mode");
  const themeBtn = action("toggle-theme");
  if (themeBtn) themeBtn.textContent = dark ? "🌙 תצוגה בהירה/כהה" : "🌓 תצוגה בהירה/כהה";
  const settingsBtn = action("toggle-theme-settings");
  if (settingsBtn) settingsBtn.textContent = dark ? "☀️ מצב בהיר" : "🌙 מצב כהה";
}

function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem(DARK_MODE_KEY, document.body.classList.contains("dark-mode") ? "1" : "0");
  syncThemeAttribute();
  updateDarkModeButton();
  renderMenu();
}

function mergeRemoteState(remote) {
  return {
    ...remote,
    isEditor: isAdmin(),
    mode: state.mode,
    editingId: state.editingId,
    settings: {
      ...remote.settings,
      adminPin: getAdminPin(),
    },
  };
}

// ══════════════════════════════════════════════════════
// AUTH ACTIONS
// ══════════════════════════════════════════════════════

function lockApp() {
  const errorEl = target("login-error");
  if (errorEl) errorEl.textContent = "";
  signOut(auth).catch((error) => console.error("lockApp signOut failed:", error));
}

async function logout() {
  closeKebabMenu();
  clearAccessLogSession(authUser?.uid);
  const errorEl = target("login-error");
  if (errorEl) errorEl.textContent = "";
  const pinInput = target("setting-admin-pin");
  if (pinInput) pinInput.value = "";

  try {
    await signOut(auth);
  } catch (error) {
    console.error("logout failed:", error);
  }

  authUser = null;
  authRole = "viewer";
  state.isEditor = false;
  target("main-app")?.classList.add("hidden");
  target("login-screen")?.classList.remove("hidden");
  applyRoleUI();
}

function updateLockBadge() {
  action("start-lap").disabled = !isAdmin() || state.raceFinished;
  action("finish-lap").disabled =
    !isAdmin() || !state.raceStarted || state.currentLapEnd !== null || state.raceFinished;
  action("reset-race").disabled = !isAdmin();
}

// ══════════════════════════════════════════════════════
// RACE LOGIC
// ══════════════════════════════════════════════════════

function btnStartClick() {
  if (!isAdmin() || state.raceFinished) return;
  store.btnStartClick();
}

function btnFinishClick() {
  if (!isAdmin() || !state.raceStarted || state.currentLapEnd !== null || state.raceFinished) return;
  store.btnFinishClick();
}

function resetRaceClockUI() {
  target("lap-duration").textContent = "--:--";
  target("break-clock").textContent = "--:--";
  target("break-timer-value").textContent = "0:00";
  target("break-timer-display")?.classList.add("is-collapsed");
  target("expected-return").textContent = "--:--";
}

function resetRaceProgressUI() {
  setAllTargetHtml("time-progress-bar", "");
  setAllTargetHtml("laps-progress-bar", "");
  setAllTargetText("time-progress-pct", "0%");
  setAllTargetText("laps-progress-pct", `0/${state.settings?.targetLaps || 10}`);

  targets("pace-indicator").forEach((el) => {
    el.className = "pace-indicator ontrack";
  });
  setAllTargetText("pace-indicator-text", "טרם התחיל");

  const ring = target("ring-time-progress");
  if (ring) ring.style.strokeDashoffset = String(2 * Math.PI * 35);
  target("ring-pct").textContent = "0%";
  target("ring-meta-time").textContent = "0%";
  target("ring-meta-laps").textContent = `0 / ${state.settings?.targetLaps || 10}`;
  target("ring-meta-km").textContent = '0 ק"מ';
}

function resetRaceLiveUI() {
  setAllTargetText("live-laps-count", "0");
  setAllTargetText("live-km-total", "0.0");
  setAllTargetText("live-status-icon", "🏕️");
  renderViewerCurrentStatus();
  target("live-timeline").innerHTML =
    '<div style="color:var(--muted);font-size:.8rem;padding:10px">ממתין לתחילת המרוץ...</div>';
}

function resetRaceTablesUI() {
  setAllTargetHtml(
    "lap-log-container",
    '<div style="color:var(--muted);text-align:center;padding:20px;font-size:.8rem">אין סיבובים מוגמרים</div>'
  );
}

function applyLocalRaceReset() {
  pendingFinishSummary = false;
  state.lapLog = [];
  state.currentLapNum = 0;
  state.currentLapStart = null;
  state.currentLapEnd = null;
  state.breakStart = null;
  state.raceStarted = false;
  state.raceFinished = false;
  state.raceFinishedAt = null;
  state.gearChecked = {};
  state.logisticsChecked = {};
}

function resetRaceUI() {
  resetRaceClockUI();
  resetRaceProgressUI();
  resetRaceLiveUI();
  resetRaceTablesUI();
}

function resetRace() {
  if (!isAdmin()) return;
  if (!confirm("לאפס את כל נתוני המרוץ?")) return;

  applyLocalRaceReset();
  resetRaceUI();
  updateActionButtons();
  updateFinishRaceButton();
  renderAll();

  store.resetRace().catch((err) => {
    console.error("resetRace failed:", err);
    alert("שגיאה באיפוס המרוץ. בדוק חיבור לרשת.");
  });
}

function updateActionButtons() {
  const s = action("start-lap");
  const f = action("finish-lap");

  if (state.raceFinished) {
    s.disabled = true;
    f.disabled = true;
    return;
  }

  f.textContent = "הפסקה";

  if (!state.raceStarted) {
    s.textContent = "התחל סיבוב 1";
    f.disabled = true;
  } else if (state.currentLapEnd === null) {
    s.textContent = `התחל סיבוב ${state.currentLapNum + 1}`;
    f.disabled = !isAdmin();
  } else {
    s.textContent = `התחל סיבוב ${state.currentLapNum + 1}`;
    f.disabled = true;
  }

  s.disabled = !isAdmin() || state.raceFinished;
  action("reset-race").disabled = !isAdmin();
}

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.keys(value)
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => value[key]);
  }
  return [];
}

function getLapLog() {
  return toArray(state?.lapLog);
}

function getSchedule() {
  return toArray(state?.schedule);
}

function getRaceDurationMs() {
  return (state.settings?.durationHours || 25) * 3600000;
}

function lapRowMatches(lapField, lapNum) {
  const lapStr = String(lapNum);
  if (lapField === lapStr) return true;
  if (lapField.includes("+")) {
    return lapField.split("+").some((part) => part.trim() === lapStr);
  }
  return lapField.startsWith(`${lapStr}+`) || lapField.endsWith(`+${lapStr}`);
}

function getRowMaxLap(lapField) {
  const parts = String(lapField ?? "")
    .split("+")
    .map((part) => parseInt(part.trim(), 10))
    .filter((n) => !Number.isNaN(n));
  return parts.length ? Math.max(...parts) : 0;
}

function getActiveLapScheduleRow(lapNum) {
  if (lapNum == null || lapNum < 1) return null;
  const schedule = getSchedule();
  const matches = schedule.filter((row) => lapRowMatches(row.lap, lapNum));
  if (matches.length) return matches[0];
  return schedule.find((row) => String(row.lap).includes(String(lapNum))) || null;
}

function getScheduleFocusLapNum() {
  if (!state?.raceStarted || !state?.currentLapNum) return null;
  const inPit = state.currentLapEnd !== null;
  return inPit ? state.currentLapNum + 1 : state.currentLapNum;
}

function getPrepFocusLapNum() {
  return getScheduleFocusLapNum();
}

function isScheduleRowCompleted(row, focusLap) {
  if (!focusLap) return false;
  return getRowMaxLap(row.lap) < focusLap;
}

function findScheduleRowForLap(lapNum) {
  return getActiveLapScheduleRow(lapNum);
}

function buildTimelineSegments(now = Date.now()) {
  const raceMs = getRaceDurationMs();
  const lapLog = getLapLog();
  const segments = [];

  for (const lap of lapLog) {
    if (lap.lapStart && lap.lapEnd) {
      segments.push({ type: "lap", ms: Math.max(0, lap.lapEnd - lap.lapStart) });
    }
    if (lap.lapEnd) {
      if (lap.breakEnd) {
        segments.push({ type: "break", ms: Math.max(0, lap.breakEnd - lap.lapEnd) });
      } else if (state.currentLapEnd === lap.lapEnd) {
        segments.push({ type: "break", ms: Math.max(0, now - lap.lapEnd) });
      }
    }
  }

  const currentLapLogged = lapLog.some(
    (lap) => lap.lapNum === state.currentLapNum && lap.lapEnd
  );
  if (state.currentLapEnd === null && state.currentLapStart && !currentLapLogged) {
    segments.push({ type: "lap", ms: Math.max(0, now - state.currentLapStart) });
  }

  const raceStart = lapLog[0]?.lapStart || state.currentLapStart || now;
  const elapsedPct = Math.min(100, ((now - raceStart) / raceMs) * 100);

  return { segments, raceMs, raceStart, elapsedPct };
}

function renderSegmentBar(targetName, segments, raceMs, filterType = null) {
  const filtered = filterType ? segments.filter((seg) => seg.type === filterType) : segments;
  const html = !filtered.length
    ? ""
    : filtered
        .map((seg) => {
          const pct = Math.max(0.15, (seg.ms / raceMs) * 100);
          return `<div class="progress-segment ${seg.type}" style="width:${pct}%"></div>`;
        })
        .join("");

  setAllTargetHtml(targetName, html);
}

function renderProgressBars(now = Date.now()) {
  if (!state.raceStarted) {
    setAllTargetHtml("time-progress-bar", "");
    setAllTargetHtml("laps-progress-bar", "");
    setAllTargetText("time-progress-pct", "0%");
    setAllTargetText("laps-progress-pct", `0/${state.settings?.targetLaps || 10}`);
    return;
  }

  const { segments, raceMs, raceStart, elapsedPct } = buildTimelineSegments(now);
  renderSegmentBar("time-progress-bar", segments, raceMs);

  const elapsedMs = Math.max(0, now - raceStart);
  const elapsedHrs = Math.floor(elapsedMs / 3600000);
  const elapsedMins = Math.floor((elapsedMs % 3600000) / 60000).toString().padStart(2, "0");
  setAllTargetText("time-progress-pct", `זמן: ${elapsedHrs}:${elapsedMins} | ${Math.round(elapsedPct)}%`);

  const lapsDone = getLapLog().filter((lap) => lap.lapEnd).length;
  setAllTargetText("laps-progress-pct", `${lapsDone}/${state.settings.targetLaps}`);

  const targetLaps = parseInt(state.settings?.targetLaps) || 10;
  let lapsHtml = "";
  const segmentWidth = 100 / Math.max(1, targetLaps);
  for (let i = 0; i < targetLaps; i++) {
    const isDone = i < lapsDone;
    lapsHtml += `<div class="progress-segment ${isDone ? "lap" : ""}" style="width:${segmentWidth}%; border-right:1px solid rgba(255,255,255,0.4)"></div>`;
  }
  setAllTargetHtml("laps-progress-bar", lapsHtml);
}

function updateCurrentLapCard() {
  const badge = target("current-lap-badge");
  const foodEl = target("current-food");
  const drinkEl = target("current-drink");
  const suppsEl = target("current-supps");
  const gearEl = target("current-gear");
  const noteEl = target("current-note");
  const nextStrip = target("next-lap-strip");

  if (!state.raceStarted || !state.currentLapNum) {
    badge.textContent = "סיבוב —";
    foodEl.textContent = "—";
    drinkEl.textContent = "—";
    suppsEl.textContent = "—";
    gearEl.textContent = "—";
    noteEl.style.display = "none";
    nextStrip.style.display = "none";
    return;
  }

  const prepLap = getPrepFocusLapNum();
  const cur = getActiveLapScheduleRow(prepLap);

  badge.textContent = prepLap ? `סיבוב ${prepLap}` : "סיבוב —";
  foodEl.textContent = cur?.food || "—";
  drinkEl.textContent = cur?.drink || "—";
  suppsEl.textContent = cur?.supps || "—";
  gearEl.textContent = [cur?.gear, cur?.clothing].filter(Boolean).join(" · ") || "—";

  if (cur?.notes) {
    noteEl.textContent = cur.notes;
    noteEl.style.display = "block";
  } else {
    noteEl.style.display = "none";
  }

  const nextRow = prepLap ? getActiveLapScheduleRow(prepLap + 1) : null;
  if (nextRow) {
    target("next-lap-number").textContent = nextRow.lap;
    const parts = [nextRow.food, nextRow.drink, nextRow.supps].filter(Boolean).join(" · ");
    target("next-lap-content").textContent = parts || "—";
    nextStrip.style.display = "flex";
  } else {
    nextStrip.style.display = "none";
  }
}
function fmtHHMM(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function fmtDurMs(ms) {
  if (ms == null || ms < 0) return "—";
  const tot = Math.floor(ms / 1000);
  const h = Math.floor(tot / 3600);
  const m = Math.floor((tot % 3600) / 60);
  const s = tot % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDurSec(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getTargetLapMs() {
  return (state.settings?.targetLap ?? state.settings?.lapPaceMin ?? 143) * 60000;
}

function getTargetPitMs() {
  return (state.settings?.targetPit ?? 5) * 60000;
}

function fmtDeltaBadge(deltaMs) {
  const sign = deltaMs < 0 ? "-" : "+";
  const cls = deltaMs < 0 ? "delta-badge-fast" : "delta-badge-slow";
  const totalSec = Math.floor(Math.abs(deltaMs) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const timeStr =
    h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `<span class="delta-badge ${cls}">(${sign}${timeStr})</span>`;
}

function calculateCumulativeDelta() {
  const lapLog = getLapLog();
  const targetLapMs = getTargetLapMs();
  const targetPitMs = getTargetPitMs();
  let actualTotal = 0;
  let expectedTotal = 0;
  let completedLaps = 0;

  for (const lap of lapLog) {
    if (lap.lapStart && lap.lapEnd) {
      actualTotal += lap.lapEnd - lap.lapStart;
      expectedTotal += targetLapMs;
      completedLaps++;
    }
    if (lap.lapEnd && lap.breakEnd) {
      actualTotal += lap.breakEnd - lap.lapEnd;
      expectedTotal += targetPitMs;
    }
  }

  return { deltaMs: actualTotal - expectedTotal, completedLaps };
}

function renderPaceStatus() {
  let stateClass = "neutral";
  let message = "טרם התחיל";

  if (!state.raceStarted) {
    applyPaceStatusToAll(stateClass, message);
    return;
  }

  const { deltaMs, completedLaps } = calculateCumulativeDelta();
  if (completedLaps === 0) {
    message = "אין סיבובים מושלמים עדיין";
    applyPaceStatusToAll(stateClass, message);
    return;
  }

  const deltaMin = Math.round(Math.abs(deltaMs) / 60000);
  if (deltaMs < 0) {
    stateClass = "ahead";
    message = `🟢 מקדים את התוכנית ב-${deltaMin} דקות`;
  } else if (deltaMs > 0) {
    stateClass = "behind";
    message = `🔴 בפיגור של ${deltaMin} דקות`;
  } else {
    stateClass = "ahead";
    message = "🟢 בדיוק בקצב התוכנית";
  }

  applyPaceStatusToAll(stateClass, message);
}

function applyPaceStatusToAll(stateClass, message) {
  targets("pace-status").forEach((card) => {
    card.className = stateClass;
  });
  setAllTargetText("pace-status-text", message);
}

function renderViewerCurrentStatus() {
  let status = "waiting";
  let label = "⚪ ממתין לתחילת המרוץ";

  if (state.raceStarted) {
    if (state.currentLapEnd === null && state.currentLapStart) {
      status = "on-course";
      label = "🟢 במסלול";
    } else {
      status = "in-pit";
      label = "🟠 בפיט / במנוחה";
    }
  }

  targets("viewer-current-status-badge").forEach((el) => {
    el.dataset.status = status;
    el.textContent = label;
  });
}

// ══════════════════════════════════════════════════════
// ENVIRONMENT TIME TRIGGERS
// ══════════════════════════════════════════════════════
const TRIGGER_WINDOW_MINUTES = 90;

function parseTimeToMinutes(hhmm) {
  if (hhmm == null) return NaN;
  const match = String(hhmm).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN;
  return hours * 60 + minutes;
}

function getCurrentTimeMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getTriggersList() {
  if (!state?.triggers) return [];
  const raw = state.triggers;
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  return list
    .filter((trigger) => trigger?.id && trigger?.time)
    .sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
}

function isTriggerActive(trigger, currentMinutes) {
  const triggerMinutes = parseTimeToMinutes(trigger.time);
  if (Number.isNaN(triggerMinutes)) return false;
  return (
    currentMinutes >= triggerMinutes &&
    currentMinutes <= triggerMinutes + TRIGGER_WINDOW_MINUTES
  );
}

function getActiveEnvironmentTriggers() {
  const currentMinutes = getCurrentTimeMinutes();
  return getTriggersList().filter((trigger) => isTriggerActive(trigger, currentMinutes));
}

function ensureEnvironmentAlertsContainer() {
  let container = document.getElementById("environment-alerts-container");
  if (container) return container;

  const lapCard = document.getElementById("current-lap-card");
  if (!lapCard?.parentNode) return null;

  container = document.createElement("div");
  container.id = "environment-alerts-container";
  container.className = "hidden";
  container.setAttribute("dir", "rtl");
  lapCard.parentNode.insertBefore(container, lapCard);
  return container;
}

function updateEnvironmentAlerts() {
  const container = ensureEnvironmentAlertsContainer();
  if (!container) return;

  const active = getActiveEnvironmentTriggers();
  container.replaceChildren();

  if (active.length === 0) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");

  for (const trigger of active) {
    const banner = document.createElement("div");
    const isNight =
      trigger.id === "midnight" ||
      parseTimeToMinutes(trigger.time) < 6 * 60;
    banner.className = isNight
      ? "env-alert-banner env-alert-banner--night"
      : "env-alert-banner";
    banner.setAttribute("role", "alert");
    banner.setAttribute("dir", "rtl");

    const title = document.createElement("div");
    title.className = "env-alert-title";
    title.textContent = trigger.title;

    const text = document.createElement("div");
    text.className = "env-alert-text";
    text.textContent = trigger.text;

    banner.append(title, text);
    container.appendChild(banner);
  }
}

// ══════════════════════════════════════════════════════
// CLOCK TICK
// ══════════════════════════════════════════════════════
setInterval(tick, 1000);

function tick() {
  const now = Date.now();
  const d = new Date(now);
  const liveTimer = target("live-timer");
  if (liveTimer) {
    liveTimer.textContent =
      String(d.getHours()).padStart(2, "0") +
      ":" +
      String(d.getMinutes()).padStart(2, "0") +
      ":" +
      String(d.getSeconds()).padStart(2, "0");
  }

  updateEnvironmentAlerts();

  if (!state?.settings) return;

  if (!state.raceStarted) {
    resetRaceClockUI();
    return;
  }

  const lapLog = getLapLog();

  if (state.currentLapEnd === null && state.currentLapStart) {
    target("lap-duration").textContent = fmtDurMs(now - state.currentLapStart);
  } else {
    const lastLap = lapLog[lapLog.length - 1];
    if (lastLap && lastLap.lapEnd)
      target("lap-duration").textContent = fmtDurMs(lastLap.lapEnd - lastLap.lapStart);
  }

  if (state.breakStart && state.currentLapEnd !== null) {
    const brk = Math.floor((now - state.breakStart) / 1000);
    target("break-clock").textContent = fmtDurSec(brk);
    target("break-timer-display").classList.remove("is-collapsed");
    target("break-timer-value").textContent = fmtDurSec(brk);
  } else {
    target("break-clock").textContent = "--:--";
    target("break-timer-display").classList.add("is-collapsed");
  }

  if (state.currentLapStart && state.currentLapEnd === null) {
    const expReturn = new Date(state.currentLapStart + state.settings.lapPaceMin * 60000);
    target("expected-return").textContent =
      String(expReturn.getHours()).padStart(2, "0") + ":" + String(expReturn.getMinutes()).padStart(2, "0");
  } else {
    target("expected-return").textContent = "--:--";
  }

  const raceStart = lapLog.length > 0 ? lapLog[0].lapStart : state.currentLapStart || now;
  const elapsed = now - raceStart;

  renderProgressBars(now);

  const lapsDone = lapLog.filter((l) => l.breakEnd).length;

  const expectedLaps = elapsed / (state.settings.lapPaceMin * 60000);
  const diff = lapsDone - expectedLaps;
  let paceClass = "ontrack";
  let paceText = "✓ בדיוק בקצב";
  if (diff > 0.3) {
    paceClass = "ahead";
    paceText = `⬆ ${diff.toFixed(1)} סיבוב קדימה ביעד`;
  } else if (diff < -0.5) {
    paceClass = "behind";
    paceText = `⬇ פיגור של ${Math.abs(diff).toFixed(1)} סיבוב`;
  }

  targets("pace-indicator").forEach((el) => {
    el.className = `pace-indicator ${paceClass}`;
  });
  setAllTargetText("pace-indicator-text", paceText);

  const lapDist = state.settings.lapDist || 8;
  setAllTargetText("live-laps-count", String(lapsDone));
  setAllTargetText("live-km-total", (lapsDone * lapDist).toFixed(1));
  setAllTargetText("live-status-icon", state.currentLapEnd === null ? "🏃" : "🏕️");
  renderViewerCurrentStatus();
}

// ══════════════════════════════════════════════════════
// MODE & CONTENT TABS
// ══════════════════════════════════════════════════════
const CONTENT_VIEWS = {
  dashboard: "view-dashboard",
  log: "view-log",
  alerts: "view-alerts",
};

function switchTab(tab) {
  if (tab === "gear") tab = "alerts";
  state.managerTab = tab;
  state.mode = "manager";
  hideAllShellViews();
  Object.entries(CONTENT_VIEWS).forEach(([name, targetName]) => {
    target(targetName)?.classList.toggle("hidden", name !== tab);
  });
  document.querySelectorAll('[data-action="switch-tab"]').forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  viewEl("manager")?.classList.add("active");
  applyAdminShellChrome();
  renderMenu("dashboard");
}

function navigateUpload() {
  if (!isAdmin()) return;
  state.mode = "manager";
  hideAllShellViews();
  target("admin-media-view")?.classList.remove("hidden");
  document.querySelectorAll('[data-action="switch-tab"]').forEach((btn) => {
    btn.classList.remove("active");
  });
  viewEl("manager")?.classList.remove("active");
  closeKebabMenu();
  applyAdminShellChrome();
  renderMenu("upload-image");
}

function navigateDashboard() {
  if (!isAdmin()) return;
  closeKebabMenu();
  setMode("manager");
}

function navigateSettings() {
  if (!isAdmin()) return;
  closeKebabMenu();
  setMode("settings");
}

function navigateViewerPreview() {
  if (!isAdmin()) return;
  closeKebabMenu();
  startLiveUpdatesListener();
  setMode("viewer-preview");
  renderAll();
}

function navigateAccessLogs() {
  if (!isSuperAdminUid()) return;
  state.mode = "manager";
  hideAllShellViews();
  target("access-logs-view")?.classList.remove("hidden");
  document.querySelectorAll('[data-action="switch-tab"]').forEach((btn) => {
    btn.classList.remove("active");
  });
  viewEl("manager")?.classList.remove("active");
  closeKebabMenu();
  applyAdminShellChrome();
  startAccessLogsListener();
  renderMenu("access-logs");
}

function navAdminMedia() {
  navigateUpload();
}

function navViewerStatus() {
  hideAllShellViews();
  target("viewer-status-view")?.classList.remove("hidden");
  setViewerTabActive("nav-viewer-status");
}

function navViewerGallery() {
  hideAllShellViews();
  target("live-update-view")?.classList.remove("hidden");
  setViewerTabActive("nav-viewer-gallery");
}

function navViewerCheers() {
  hideAllShellViews();
  target("cheer-board-view")?.classList.remove("hidden");
  setViewerTabActive("nav-viewer-cheers");
}

function setManagerTab(panel) {
  switchTab(panel);
}

function updateSettingsNavButton() {
  renderMenu();
}

function toggleSettingsView() {
  if (state.mode === "settings") {
    setMode("manager");
  } else {
    setMode("settings");
  }
}

function setMode(m) {
  state.mode = m;
  hideAllShellViews();
  document.querySelectorAll(
    '[data-action="nav-viewer-status"], [data-action="nav-viewer-gallery"], [data-action="nav-viewer-cheers"]'
  ).forEach((btn) => {
    btn.classList.remove("active");
  });

  applyAdminShellChrome();

  if (m === "viewer-preview") {
    viewEl("manager")?.classList.remove("active");
    viewEl("settings")?.classList.remove("active");
    navViewerStatus();
    renderMenu("viewer-preview");
    return;
  }

  if (m === "alerts" || m === "gear") {
    viewEl("manager").classList.add("active");
    switchTab("alerts");
    closeKebabMenu();
    renderMenu();
    return;
  }

  viewEl(m)?.classList.add("active");
  if (m === "manager") {
    switchTab(state.managerTab || "dashboard");
    return;
  }
  closeKebabMenu();
  renderMenu(m === "settings" ? "settings" : undefined);
}

// ══════════════════════════════════════════════════════
// KEBAB MENU
// ══════════════════════════════════════════════════════
const ADMIN_MENU_VIEWS = ["dashboard", "settings", "upload-image", "viewer-preview"];

const ADMIN_MENU_VIEW_OPTIONS = {
  dashboard: { action: "navigate-dashboard", label: "🏠 מסך ראשי" },
  settings: { action: "navigate-settings", label: '<span class="icon">⚙️</span> הגדרות' },
  "upload-image": { action: "navigate-upload", label: "📷 העלאת תמונה" },
  "viewer-preview": { action: "navigate-viewer-preview", label: "תצוגת צופים" },
};

function getAdminViewType() {
  if (state.mode === "settings") return "settings";
  if (state.mode === "viewer-preview") return "viewer-preview";
  if (isAccessLogsViewVisible()) return "access-logs";
  if (isUploadViewVisible()) return "upload-image";
  return "dashboard";
}

function getThemeMenuLabel() {
  const dark = document.body.classList.contains("dark-mode");
  return `${dark ? "🌙" : "🌓"} תצוגה בהירה/כהה`;
}

function renderMenu(viewType = null) {
  const adminItems = target("admin-kebab-items");
  const viewerItems = target("viewer-kebab-items");

  logSuperAdminAuthCheck();

  if (!isAdmin()) {
    adminItems?.classList.add("hidden");
    viewerItems?.classList.remove("hidden");
    return;
  }

  viewerItems?.classList.add("hidden");
  adminItems?.classList.remove("hidden");

  const currentView = viewType || getAdminViewType();
  const items = ADMIN_MENU_VIEWS.filter((view) => view !== currentView).map((view) => {
    const { action, label } = ADMIN_MENU_VIEW_OPTIONS[view];
    return `<button type="button" class="kebab-item" data-action="${action}">${label}</button>`;
  });

  if (isSuperAdminUid() && currentView !== "access-logs") {
    items.unshift(
      '<button type="button" class="kebab-item" data-action="navigate-access-logs">יומן כניסות</button>'
    );
  }

  items.push(
    `<button type="button" class="kebab-item" data-action="toggle-theme">${getThemeMenuLabel()}</button>`,
    '<button type="button" class="kebab-item" data-action="logout">התנתק</button>'
  );

  if (adminItems) adminItems.innerHTML = items.join("");
}

function openKebabMenu() {
  const dropdown = target("kebab-dropdown");
  const toggle = action("toggle-kebab");
  if (!dropdown || !toggle) return;

  dropdown.classList.add("open");
  dropdown.setAttribute("aria-hidden", "false");
  toggle.setAttribute("aria-expanded", "true");
}

function closeKebabMenu() {
  const dropdown = target("kebab-dropdown");
  const toggle = action("toggle-kebab");
  if (!dropdown || !toggle) return;

  dropdown.classList.remove("open");
  dropdown.setAttribute("aria-hidden", "true");
  toggle.setAttribute("aria-expanded", "false");
}

function initKebabMenu() {
  const wrap = target("kebab-menu");
  if (!wrap) return;

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) closeKebabMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeKebabMenu();
    if (e.key === "Escape" && target("schedule-editor-modal")?.classList.contains("open")) {
      closeEditor();
    }
    if (e.key === "Escape" && target("trigger-editor-modal")?.classList.contains("open")) {
      closeTriggerEditor();
    }
  });
}

// ══════════════════════════════════════════════════════
// SCHEDULE
// ══════════════════════════════════════════════════════
function escapeScheduleHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getScheduleSortLap(row) {
  const lap = row.lap ?? row.lapNumber ?? "";
  const parsed = parseInt(String(lap), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getSortedSchedule() {
  return [...getSchedule()].sort((a, b) => {
    const lapDiff = getScheduleSortLap(a) - getScheduleSortLap(b);
    if (lapDiff !== 0) return lapDiff;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
}

function buildScheduleCardItem(label, value) {
  if (!String(value ?? "").trim()) return "";
  return `<div class="schedule-card__item">
    <span class="schedule-card__label">${label}</span>
    <span class="schedule-card__value">${escapeScheduleHtml(value)}</span>
  </div>`;
}

function renderSchedule() {
  const container = target("schedule-cards-container");
  if (!container || !state?.settings) return;

  const targetLaps = state?.settings?.targetLaps ?? 10;
  const lapDist = state?.settings?.lapDist ?? 8;
  const focusLap = getScheduleFocusLapNum();
  const activeRow = focusLap ? getActiveLapScheduleRow(focusLap) : null;
  const sortedSchedule = getSortedSchedule();

  container.innerHTML = sortedSchedule
    .map((row) => {
      const isActive = state?.raceStarted && activeRow && row.id === activeRow.id;
      const isCompleted = state?.raceStarted && !isActive && isScheduleRowCompleted(row, focusLap);
      const cardCls = ["schedule-card", isActive ? "is-active" : "", isCompleted ? "is-completed" : ""]
        .filter(Boolean)
        .join(" ");
      const editBtn = isAdmin()
        ? `<button type="button" class="schedule-card__edit" data-action="edit-row" data-row-id="${row.id}" aria-label="ערוך שורה" style="position:absolute;top:8px;left:8px;">✏️</button>`
        : "";
      const bodyHtml = [
        buildScheduleCardItem("🍎 אוכל:", row.food),
        buildScheduleCardItem("💧 שתייה:", row.drink),
        buildScheduleCardItem("💊 תוסף:", row.supps),
      ]
        .filter(Boolean)
        .join("");

      return `<article class="${cardCls}" data-schedule-row-id="${row.id}" dir="rtl">
        ${editBtn}
        <h3 class="schedule-card__title">סיבוב ${escapeScheduleHtml(row.lap)}</h3>
        <div class="schedule-card__body">${
          bodyHtml || '<p class="schedule-card__empty">אין פריטים מוגדרים</p>'
        }</div>
      </article>`;
    })
    .join("");

  updateCurrentLapCard();

  const lapLog = getLapLog();
  const now2 = Date.now();
  if (state?.raceStarted && (lapLog.length > 0 || state?.currentLapStart)) {
    const raceStart2 = lapLog[0]?.lapStart || state?.currentLapStart;
    const elapsed2 = now2 - raceStart2;
    const raceMs2 = getRaceDurationMs();
    const pct = Math.min(100, (elapsed2 / raceMs2) * 100);
    const circumference = 2 * Math.PI * 35;
    const offset = circumference * (1 - pct / 100);
    const ring = target("ring-time-progress");
    if (ring) {
      ring.style.strokeDashoffset = offset;
    }
    target("ring-pct").textContent = Math.round(pct) + "%";
    target("ring-meta-time").textContent = Math.round(pct) + "%";
    const lapsDone2 = lapLog.filter((l) => l.breakEnd).length;
    target("ring-meta-laps").textContent = lapsDone2 + " / " + targetLaps;
    target("ring-meta-km").textContent = (lapsDone2 * lapDist).toFixed(1) + ' ק"מ';
  } else if (!state?.raceStarted) {
    const ring = target("ring-time-progress");
    if (ring) ring.style.strokeDashoffset = String(2 * Math.PI * 35);
    target("ring-pct").textContent = "0%";
    target("ring-meta-time").textContent = "0%";
    target("ring-meta-laps").textContent = `0 / ${targetLaps}`;
    target("ring-meta-km").textContent = '0 ק"מ';
  }

  renderProgressBars(now2);
}

const LAP_LOG_EMPTY_HTML =
  '<div style="color:var(--muted);text-align:center;padding:20px;font-size:.8rem">אין סיבובים מוגמרים</div>';

function buildLapLogHtml() {
  const lapLog = getLapLog();

  if (lapLog.length === 0) {
    return LAP_LOG_EMPTY_HTML;
  }

  const targetLapMs = getTargetLapMs();
  const targetPitMs = getTargetPitMs();
  let prevLapMs = null;
  let html = "";

  lapLog.forEach((lap) => {
    if (!lap.lapStart || !lap.lapEnd) return;

    const lapMs = lap.lapEnd - lap.lapStart;
    const lapDeltaBadge = fmtDeltaBadge(lapMs - targetLapMs);
    let vsPrev = "";
    let prBadge = "";
    if (prevLapMs !== null) {
      const d = lapMs - prevLapMs;
      vsPrev = ` <span class="${d < 0 ? "delta-pos" : "delta-neg"}" style="font-size:.7rem">(${d < 0 ? "" : "+"}${fmtDurMs(Math.abs(d))} מהקודם)</span>`;
      if (d < 0) prBadge = '<span class="pr-badge">⚡ שיא</span>';
    }
    prevLapMs = lapMs;

    html += `<div class="lap-log-row">
      <div class="lap-log-data">
        <span style="font-weight:900;color:var(--rust)">סיבוב ${lap.lapNum}</span>
        <span class="mono">${fmtHHMM(lap.lapStart)}</span>
        <span class="mono">${fmtHHMM(lap.lapEnd)}</span>
        <span class="mono">${prBadge}${fmtDurMs(lapMs)}${lapDeltaBadge}${vsPrev}</span>
        <span></span>
      </div>
    </div>`;

    if (lap.lapEnd) {
      const breakMs = lap.breakEnd ? lap.breakEnd - lap.lapEnd : null;
      const breakDuration = lap.breakEnd
        ? `${fmtDurMs(breakMs)}${fmtDeltaBadge(breakMs - targetPitMs)}`
        : '<span class="blink">מתמשך...</span>';

      html += `<div class="lap-log-break">
        <span>⏸ הפסקה</span>
        <span class="mono">${fmtHHMM(lap.lapEnd)}</span>
        <span class="mono">${lap.breakEnd ? fmtHHMM(lap.breakEnd) : "—"}</span>
        <span class="mono">${breakDuration}</span>
        <span></span>
      </div>`;
    }
  });

  return html;
}

function renderLapLog() {
  setAllTargetHtml("lap-log-container", buildLapLogHtml());
}

// ══════════════════════════════════════════════════════
// LIVE VIEW
// ══════════════════════════════════════════════════════
function renderLive() {
  const tl = target("live-timeline");
  if (!state.raceStarted) {
    tl.innerHTML =
      '<div style="color:var(--muted);font-size:.8rem;padding:10px">ממתין לתחילת המרוץ...</div>';
    return;
  }

  let html = "";
  const lapLog = getLapLog();

  lapLog.forEach((lap) => {
    if (!lap.lapStart || !lap.lapEnd) return;

    const lapMs = lap.lapEnd - lap.lapStart;
    const done = !!lap.breakEnd;
    html += `<div class="timeline-item ${done ? "done" : "current"}">
      <div class="timeline-dot"></div>
      <div class="timeline-time">סיבוב ${lap.lapNum} · יצא ${fmtHHMM(lap.lapStart)} → חזר ${fmtHHMM(lap.lapEnd)} · ⏱ ${fmtDurMs(lapMs)}</div>
      <div class="timeline-desc">${done ? `✅ הפסקה: ${fmtDurMs(lap.breakEnd - lap.lapEnd)}` : "⏸ בהפסקה..."}</div>
    </div>`;
  });

  if (state.currentLapEnd === null && state.currentLapStart) {
    html += `<div class="timeline-item current">
      <div class="timeline-dot"></div>
      <div class="timeline-time">סיבוב ${state.currentLapNum} · יצא ${fmtHHMM(state.currentLapStart)}</div>
      <div class="timeline-desc pulsing">🏃 רץ כרגע...</div>
    </div>`;
  }

  tl.innerHTML =
    html || '<div style="color:var(--muted);font-size:.8rem;padding:10px">אין נתונים עדיין</div>';
}

// ══════════════════════════════════════════════════════
// ALERTS (TIME TRIGGERS) MANAGER
// ══════════════════════════════════════════════════════
function getTriggerEditorFields() {
  return {
    time: target("trigger-editor-time")?.value?.trim() ?? "",
    title: target("trigger-editor-title-input")?.value?.trim() ?? "",
    text: target("trigger-editor-text")?.value?.trim() ?? "",
  };
}

function setTriggerEditorFields(trigger = {}) {
  const timeInput = target("trigger-editor-time");
  const titleInput = target("trigger-editor-title-input");
  const textInput = target("trigger-editor-text");
  if (timeInput) timeInput.value = trigger.time ?? "";
  if (titleInput) titleInput.value = trigger.title ?? "";
  if (textInput) textInput.value = trigger.text ?? "";
}

function updateTriggerEditorChrome() {
  const titleEl = target("trigger-editor-title");
  if (titleEl) {
    titleEl.textContent = state.triggerEditorIsNew ? "➕ התרעה חדשה" : "✏️ עריכת התרעה";
  }
}

function openTriggerEditorModal() {
  const modal = target("trigger-editor-modal");
  if (!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  updateTriggerEditorChrome();
  target("trigger-editor-time")?.focus();
}

function closeTriggerEditor() {
  state.editingTriggerId = null;
  state.triggerEditorIsNew = false;
  setTriggerEditorFields();
  const modal = target("trigger-editor-modal");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
}

function openNewTrigger() {
  if (!isAdmin()) return;
  state.editingTriggerId = null;
  state.triggerEditorIsNew = true;
  setTriggerEditorFields();
  openTriggerEditorModal();
}

function openEditTrigger(triggerId) {
  if (!isAdmin() || !triggerId) return;
  const trigger = getTriggersList().find((item) => item.id === triggerId);
  if (!trigger) return;
  state.editingTriggerId = triggerId;
  state.triggerEditorIsNew = false;
  setTriggerEditorFields(trigger);
  openTriggerEditorModal();
}

async function saveTriggerEditor(e) {
  if (e) e.preventDefault();
  if (!isAdmin()) return;

  const fields = getTriggerEditorFields();
  if (!fields.time || !fields.title) {
    alert("נא למלא שעה וכותרת");
    return;
  }

  try {
    if (state.triggerEditorIsNew) {
      await store.addTrigger(fields);
    } else if (state.editingTriggerId) {
      await store.editTrigger(state.editingTriggerId, fields);
    }
    closeTriggerEditor();
  } catch (error) {
    console.error("saveTriggerEditor failed:", error);
    alert("שגיאה בשמירת ההתרעה");
  }
}

function renderTriggers() {
  const listEl = target("triggers-list");
  if (!listEl) return;

  const triggers = getTriggersList();
  const canEdit = isAdmin();
  target("triggers-add-bar")?.classList.toggle("hidden", !canEdit);

  listEl.replaceChildren();

  if (!triggers.length) {
    const empty = document.createElement("div");
    empty.className = "triggers-empty";
    empty.textContent = "אין התרעות מוגדרות";
    listEl.appendChild(empty);
    return;
  }

  for (const trigger of triggers) {
    const card = document.createElement("article");
    card.className = "trigger-card";
    card.setAttribute("dir", "rtl");

    if (canEdit) {
      const actions = document.createElement("div");
      actions.className = "trigger-card-actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "trigger-card-icon-btn";
      editBtn.dataset.action = "edit-trigger";
      editBtn.dataset.triggerId = trigger.id;
      editBtn.setAttribute("aria-label", "עריכה");
      editBtn.textContent = "✏️";

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "trigger-card-icon-btn trigger-card-icon-btn--danger";
      deleteBtn.dataset.action = "delete-trigger";
      deleteBtn.dataset.triggerId = trigger.id;
      deleteBtn.setAttribute("aria-label", "מחק");
      deleteBtn.textContent = "🗑️";

      actions.append(editBtn, deleteBtn);
      card.appendChild(actions);
    }

    const timeEl = document.createElement("div");
    timeEl.className = "trigger-card-time";
    timeEl.textContent = trigger.time;

    const titleEl = document.createElement("div");
    titleEl.className = "trigger-card-title";
    titleEl.textContent = trigger.title;

    card.append(timeEl, titleEl);

    if (trigger.text) {
      const textEl = document.createElement("div");
      textEl.className = "trigger-card-text";
      textEl.textContent = trigger.text;
      card.appendChild(textEl);
    }

    listEl.appendChild(card);
  }
}

async function handleDeleteTrigger(triggerId) {
  if (!isAdmin() || !triggerId) return;
  if (!confirm("למחוק התרעה זו?")) return;

  try {
    await store.deleteTrigger(triggerId);
  } catch (error) {
    console.error("deleteTrigger failed:", error);
    alert("שגיאה במחיקת התרעה");
  }
}

// ══════════════════════════════════════════════════════
// EDITOR
// ══════════════════════════════════════════════════════
function getScheduleEditorFields() {
  return {
    lap: target("edit-lap")?.value?.trim() ?? "",
    food: target("edit-food")?.value?.trim() ?? "",
    drink: target("edit-drink")?.value?.trim() ?? "",
    supps: target("edit-supps")?.value?.trim() ?? "",
    gear: document.getElementById("edit-gear")?.value.trim() || "",
    clothing: "",
  };
}

function setScheduleEditorFields(row = {}) {
  const lapInput = target("edit-lap");
  const foodInput = target("edit-food");
  const drinkInput = target("edit-drink");
  const suppsInput = target("edit-supps");
  if (lapInput) lapInput.value = row.lap ?? "";
  if (foodInput) foodInput.value = row.food ?? "";
  if (drinkInput) drinkInput.value = row.drink ?? "";
  if (suppsInput) suppsInput.value = row.supps ?? "";
  const gearEl = document.getElementById("edit-gear");
  if (gearEl) gearEl.value = [row.gear, row.clothing].filter(Boolean).join(" · ") || "";
}

function updateScheduleEditorChrome() {
  const isNew = state.scheduleEditorIsNew;
  const title = target("schedule-editor-title");
  const deleteBtn = target("delete-schedule-row-btn");
  if (title) title.textContent = isNew ? "➕ שורה חדשה" : "✏️ עריכת שורה";
  deleteBtn?.classList.toggle("hidden", isNew || !state.editingId);
}

function openScheduleEditorModal() {
  const modal = target("schedule-editor-modal");
  if (!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  updateScheduleEditorChrome();
}

function openEditor(id) {
  if (!isAdmin()) return;
  const row = getSchedule().find((r) => r.id === id);
  if (!row) return;
  state.editingId = id;
  state.scheduleEditorIsNew = false;
  setScheduleEditorFields(row);
  openScheduleEditorModal();
}

function openNewScheduleRow() {
  if (!isAdmin()) return;
  const focusLap = getScheduleFocusLapNum() || state.currentLapNum || 1;
  state.editingId = null;
  state.scheduleEditorIsNew = true;
  setScheduleEditorFields({ lap: String(focusLap) });
  openScheduleEditorModal();
}

function closeEditor() {
  state.editingId = null;
  state.scheduleEditorIsNew = false;
  const modal = target("schedule-editor-modal");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
}

async function saveEdit() {
  if (!isAdmin()) return;
  const fields = getScheduleEditorFields();
  if (!fields.lap) {
    alert("נא להזין מספר סיבוב");
    return;
  }

  try {
    if (state.scheduleEditorIsNew) {
      await store.addScheduleRow(fields);
    } else if (state.editingId) {
      await store.saveEdit(state.editingId, fields);
    }
    closeEditor();
  } catch (error) {
    console.error("save schedule row failed:", error);
    alert("שגיאה בשמירת השורה");
  }
}

async function deleteScheduleRow() {
  if (!isAdmin() || state.scheduleEditorIsNew || !state.editingId) return;
  if (!confirm("האם למחוק שורה זו מהלוח?")) return;

  try {
    await store.deleteScheduleRow(state.editingId);
    closeEditor();
  } catch (error) {
    console.error("delete schedule row failed:", error);
    alert("שגיאה במחיקת השורה");
  }
}

// ══════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════
function saveSettings() {
  if (!isAdmin()) return;
  const newPin = target("setting-admin-pin").value;
  if (newPin && newPin.length === 4 && /^\d{4}$/.test(newPin)) {
    setAdminPin(newPin);
    state.settings.adminPin = newPin;
  }
  store.saveSettings({
    targetLaps: parseInt(target("setting-target-laps").value) || 10,
    lapDist: parseFloat(target("setting-lap-dist").value) || 8,
    lapPaceMin: parseInt(target("setting-lap-pace").value) || 144,
    targetLap: parseInt(target("setting-target-lap").value) || 143,
    targetPit: parseInt(target("setting-target-pit").value) || 5,
    durationHours: parseInt(target("setting-duration").value) || 25,
  });
  alert("✅ הגדרות נשמרו!");
}

function exportData() {
  const b = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = "wtm2026_data.json";
  a.click();
}

function clearData() {
  if (!isAdmin()) return;
  if (!confirm("למחוק את כל נתוני המרוץ?")) return;
  store.clearData().then(() => location.reload());
}

// ══════════════════════════════════════════════════════
// RENDER ALL
// ══════════════════════════════════════════════════════
function renderAll() {
  if (!state || !state.settings) return;

  applyRoleUI();
  renderSchedule();
  renderLapLog();
  renderTriggers();
  renderLive();
  renderProgressBars();
  updateLockBadge();
  updateActionButtons();
  updateFinishRaceButton();
  renderPaceStatus();
  renderViewerCurrentStatus();
  updateEnvironmentAlerts();
}

function updateFinishRaceButton() {
  const btn = action("finish-race");
  if (!btn) return;
  if (state.raceFinished) {
    btn.textContent = "🏆 מרוץ הסתיים";
    btn.style.background = "#f0fdf4";
    btn.style.color = "#15803d";
    btn.style.borderColor = "#86efac";
    btn.disabled = true;
    return;
  }

  btn.textContent = "🏁 סיום מרוץ";
  btn.style.background = "#f1f5f9";
  btn.style.color = "#64748b";
  btn.style.borderColor = "#e2e8f0";
  btn.disabled = false;
}

// ══════════════════════════════════════════════════════
// FINISH RACE
// ══════════════════════════════════════════════════════
let finishBuffer = "";

function finishRaceClick() {
  if (!isAdmin()) return;
  finishBuffer = "";
  updateFinishDots();
  target("finish-error").textContent = "";
  target("finish-modal").style.display = "flex";
}

function closeFinishModal() {
  target("finish-modal").style.display = "none";
}

function finishKey(k) {
  if (k === "✓") {
    finishSubmit();
    return;
  }
  if (finishBuffer.length >= 4) return;
  finishBuffer += k;
  updateFinishDots();
  if (finishBuffer.length === 4) setTimeout(finishSubmit, 150);
}

function finishDel() {
  finishBuffer = finishBuffer.slice(0, -1);
  updateFinishDots();
}

function updateFinishDots() {
  for (let i = 0; i < 4; i++) {
    document
      .querySelector(`[data-target="finish-dot"][data-index="${i}"]`)
      ?.classList.toggle("filled", i < finishBuffer.length);
  }
}

let pendingFinishSummary = false;

function finishSubmit() {
  const pin = state.settings.adminPin || ADMIN_PIN;
  if (finishBuffer === pin) {
    closeFinishModal();
    pendingFinishSummary = true;
    store.finishRace();
  } else {
    target("finish-error").textContent = "❌ קוד שגוי";
    finishBuffer = "";
    updateFinishDots();
    setTimeout(() => (target("finish-error").textContent = ""), 1500);
  }
}

function showFinishSummary() {
  const lapLog = getLapLog();
  const lapsDone = lapLog.filter((l) => l.breakEnd).length;
  const dist = (lapsDone * (state.settings.lapDist || 8)).toFixed(1);
  const totalMs = state.raceFinishedAt - (lapLog[0]?.lapStart || state.raceFinishedAt);
  const totalBreakMs = lapLog.reduce(
    (s, l) => s + (l.breakEnd && l.lapEnd ? l.breakEnd - l.lapEnd : 0),
    0
  );
  const runMs = totalMs - totalBreakMs;
  alert(
    `🏆 מרוץ הסתיים!\n\nסיבובים: ${lapsDone}\nמרחק: ${dist} ק"מ\nזמן ריצה נטו: ${fmtDurMs(runMs)}\nזמן הפסקות: ${fmtDurMs(totalBreakMs)}\nזמן כולל: ${fmtDurMs(totalMs)}`
  );
}

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
function updateStateAndRender(remote) {
  const clientFields = {
    mode: state.mode,
    managerTab: state.managerTab,
    editingId: state.editingId,
  };

  if (!remote) {
    state = {
      ...resetClientRaceState(),
      isEditor: isAdmin(),
      mode: clientFields.mode,
      managerTab: clientFields.managerTab,
      editingId: null,
    };
    renderAll();
    return;
  }

  state = mergeRemoteState(remote);
  state.mode = clientFields.mode;
  state.editingId = clientFields.editingId;

  const settings = state?.settings ?? {};
  const lapsInput = target("setting-target-laps");
  const distInput = target("setting-lap-dist");
  const paceInput = target("setting-lap-pace");
  const targetLapInput = target("setting-target-lap");
  const targetPitInput = target("setting-target-pit");
  const durationInput = target("setting-duration");

  if (lapsInput) lapsInput.value = settings.targetLaps ?? 10;
  if (distInput) distInput.value = settings.lapDist ?? 8;
  if (paceInput) paceInput.value = settings.lapPaceMin ?? 144;
  if (targetLapInput) targetLapInput.value = settings.targetLap ?? settings.lapPaceMin ?? 143;
  if (targetPitInput) targetPitInput.value = settings.targetPit ?? 5;
  if (durationInput) durationInput.value = settings.durationHours ?? 25;

  renderAll();

  if (pendingFinishSummary && state.raceFinished) {
    pendingFinishSummary = false;
    showFinishSummary();
  }
}

async function deleteImageClick(docId, storagePath) {
  if (!isAdmin() || !docId) return;
  if (!confirm("האם למחוק תמונה זו מהגלריה?")) return;

  try {
    await handleDeleteLiveImage(docId, storagePath);
  } catch (error) {
    console.error("delete image failed:", error);
    alert("שגיאה במחיקת התמונה. נסה שוב.");
  }
}

function initActionDelegation() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;

    switch (el.dataset.action) {
      case "google-sign-in":
        googleSignIn();
        break;
      case "toggle-kebab":
        e.stopPropagation();
        if (target("kebab-dropdown")?.classList.contains("open")) closeKebabMenu();
        else openKebabMenu();
        break;
      case "open-settings":
        navigateSettings();
        break;
      case "logout":
        logout();
        break;
      case "go-home":
        if (isAdmin()) setMode("manager");
        else navViewerStatus();
        closeKebabMenu();
        break;
      case "toggle-theme":
        toggleDarkMode();
        break;
      case "start-lap":
        btnStartClick();
        break;
      case "finish-lap":
        btnFinishClick();
        break;
      case "finish-race":
        finishRaceClick();
        break;
      case "reset-race":
        resetRace();
        break;
      case "switch-tab":
        switchTab(el.dataset.tab);
        break;
      case "nav-admin-media":
        navigateUpload();
        break;
      case "navigate-upload":
        navigateUpload();
        break;
      case "navigate-dashboard":
        navigateDashboard();
        break;
      case "navigate-settings":
        navigateSettings();
        break;
      case "navigate-viewer-preview":
        navigateViewerPreview();
        break;
      case "navigate-access-logs":
        navigateAccessLogs();
        break;
      case "nav-viewer-status":
        navViewerStatus();
        break;
      case "nav-viewer-gallery":
        navViewerGallery();
        break;
      case "nav-viewer-cheers":
        navViewerCheers();
        break;
      case "submit-cheer":
        handleSubmitCheer();
        break;
      case "delete-cheer":
        handleDeleteCheer(el.dataset.cheerId);
        break;
      case "upload-live-image":
      case "submit-live-photo":
        handleUploadLiveImage();
        break;
      case "delete-image":
        deleteImageClick(el.dataset.docId, el.dataset.storagePath);
        break;
      case "close-editor":
        closeEditor();
        break;
      case "save-edit":
        void saveEdit();
        break;
      case "add-schedule-row":
        openNewScheduleRow();
        break;
      case "delete-schedule-row":
        void deleteScheduleRow();
        break;
      case "save-settings":
        saveSettings();
        break;
      case "add-admin-email":
        addAdminEmail();
        break;
      case "remove-admin":
        removeAdminEmail(el.dataset.email);
        break;
      case "export-data":
        exportData();
        break;
      case "clear-data":
        clearData();
        break;
      case "finish-key":
        finishKey(el.dataset.finishValue);
        break;
      case "finish-delete":
        finishDel();
        break;
      case "close-finish-modal":
        closeFinishModal();
        break;
      case "close-lightbox":
        closeLightbox();
        break;
      case "download-lightbox-image":
        downloadLightboxImage();
        break;
      case "edit-row":
        openEditor(Number(el.dataset.rowId));
        break;
      case "open-new-trigger":
        openNewTrigger();
        break;
      case "edit-trigger":
        openEditTrigger(el.dataset.triggerId);
        break;
      case "close-trigger-editor":
        closeTriggerEditor();
        break;
      case "delete-trigger":
        handleDeleteTrigger(el.dataset.triggerId);
        break;
      default:
        break;
    }
  });
}

function initApp() {
  applyRoleUI();
  initDarkMode();
  initActionDelegation();
  initKebabMenu();
  initAuth();
  updateConnectionStatus();
  updateOfflineUI();
  updateSettingsNavButton();

  window.addEventListener("online", async () => {
    await OfflineSyncManager.processQueue();
    updateOfflineUI();
    updateConnectionStatus();
  });
  window.addEventListener("offline", () => {
    updateOfflineUI();
    updateConnectionStatus();
  });
  window.addEventListener("beforeunload", (e) => {
    if (OfflineSyncManager.getPendingCount() > 0) {
      e.preventDefault();
      e.returnValue = "יש נתונים שלא נשמרו בשרת!";
    }
  });

  if (navigator.onLine) {
    OfflineSyncManager.processQueue().then(() => {
      updateOfflineUI();
    });
  }

  initLiveUpdates({ isAdmin });
  initCheers({
    getAuthUser: () => authUser,
    isAdmin,
    shouldShowAdminTicker: shouldShowAdminCheerTicker,
  });

  target("trigger-editor-form")?.addEventListener("submit", saveTriggerEditor);
  updateEnvironmentAlerts();
}

function exposeUiGlobals() {
  window.lockApp = lockApp;
  window.logout = logout;
  window.setMode = setMode;
  window.switchTab = switchTab;
  window.setManagerTab = setManagerTab;
  window.btnStartClick = btnStartClick;
  window.btnFinishClick = btnFinishClick;
  window.resetRace = resetRace;
  window.openEditor = openEditor;
  window.openNewScheduleRow = openNewScheduleRow;
  window.closeEditor = closeEditor;
  window.saveEdit = saveEdit;
  window.deleteScheduleRow = deleteScheduleRow;
  window.saveSettings = saveSettings;
  window.exportData = exportData;
  window.clearData = clearData;
  window.finishRaceClick = finishRaceClick;
  window.closeFinishModal = closeFinishModal;
  window.finishKey = finishKey;
  window.finishDel = finishDel;
  window.toggleDarkMode = toggleDarkMode;
  window.closeLightbox = closeLightbox;
  window.downloadLightboxImage = downloadLightboxImage;
}

exposeUiGlobals();
store.subscribe(updateStateAndRender);
initApp();
