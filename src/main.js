import "./style.css";
import { store } from "./store.js";
import { GEAR_DATA, LOGISTICS_DATA, ADMIN_PIN } from "./data.js";

/** Layout-agnostic DOM accessors */
function target(name) {
  return document.querySelector(`[data-target="${name}"]`);
}

function targets(name) {
  return document.querySelectorAll(`[data-target="${name}"]`);
}

function action(name) {
  return document.querySelector(`[data-action="${name}"]`);
}

function viewEl(mode) {
  return document.querySelector(`[data-view="${mode}"]`);
}

const ADMIN_PIN_KEY = "wtm_admin_pin";
const DARK_MODE_KEY = "wtm_dark_mode";
const EDITOR_SESSION_KEY = "wtm_editor";

function isAdmin() {
  return sessionStorage.getItem(EDITOR_SESSION_KEY) === "1";
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
};

function applyRoleUI() {
  const admin = isAdmin();
  state.isEditor = admin;

  document.body.classList.toggle("is-admin", admin);
  document.body.classList.toggle("view-only", !admin);

  if (!admin) {
    target("editor-panel")?.classList.remove("open");
    state.editingId = null;
  }

  updateLockBadge();
}

function updateConnectionStatus() {
  const el = target("connection-status");
  if (!el) return;
  const online = navigator.onLine;
  el.textContent = online ? "🟢 Online" : "🔴 Offline";
  el.classList.toggle("offline", !online);
}

function syncThemeAttribute() {
  const dark = document.body.classList.contains("dark-mode");
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
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
// PIN
// ══════════════════════════════════════════════════════
let pinBuffer = "";

function pinKey(k) {
  if (k === "✓") {
    pinSubmit();
    return;
  }
  if (pinBuffer.length >= 4) return;
  pinBuffer += k;
  updatePinDots();
  if (pinBuffer.length === 4) setTimeout(pinSubmit, 150);
}

function pinDel() {
  pinBuffer = pinBuffer.slice(0, -1);
  updatePinDots();
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    document
      .querySelector(`[data-target="pin-dot"][data-index="${i}"]`)
      ?.classList.toggle("filled", i < pinBuffer.length);
  }
}

function pinSubmit() {
  const pin = state.settings?.adminPin || ADMIN_PIN;
  if (pinBuffer === pin) {
    sessionStorage.setItem(EDITOR_SESSION_KEY, "1");
    hidePinOverlay();
  } else {
    target("pin-error").textContent = "❌ קוד שגוי";
    pinBuffer = "";
    updatePinDots();
    setTimeout(() => (target("pin-error").textContent = ""), 1500);
  }
}

function enterAsViewer() {
  hidePinOverlay();
}

function hidePinOverlay() {
  target("login-screen").classList.add("hidden");
  target("main-app")?.classList.remove("hidden");
  applyRoleUI();
  renderAll();
}

function lockApp() {
  if (!isAdmin()) {
    target("login-screen").classList.remove("hidden");
    target("main-app")?.classList.add("hidden");
    pinBuffer = "";
    updatePinDots();
    target("pin-error").textContent = "";
  } else {
    sessionStorage.removeItem(EDITOR_SESSION_KEY);
    state.isEditor = false;
    applyRoleUI();
    renderAll();
  }
}

function logout() {
  closeKebabMenu();
  target("main-app")?.classList.add("hidden");
  target("login-screen")?.classList.remove("hidden");
  pinBuffer = "";
  updatePinDots();
  target("pin-error").textContent = "";
  const pinInput = target("setting-admin-pin");
  if (pinInput) pinInput.value = "";
  sessionStorage.removeItem(EDITOR_SESSION_KEY);
  state.isEditor = false;
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
  target("time-progress-bar").innerHTML = "";
  target("laps-progress-bar").innerHTML = "";
  target("time-progress-pct").textContent = "0%";
  target("laps-progress-pct").textContent = `0/${state.settings?.targetLaps || 10}`;

  const pi = target("pace-indicator");
  const pt = target("pace-indicator-text");
  if (pi) pi.className = "pace-indicator ontrack";
  if (pt) pt.textContent = "טרם התחיל";

  const ring = target("ring-time-progress");
  if (ring) ring.style.strokeDashoffset = String(2 * Math.PI * 35);
  target("ring-pct").textContent = "0%";
  target("ring-meta-time").textContent = "0%";
  target("ring-meta-laps").textContent = `0 / ${state.settings?.targetLaps || 10}`;
  target("ring-meta-km").textContent = '0 ק"מ';
}

function resetRaceLiveUI() {
  target("live-laps-count").textContent = "0";
  target("live-km-total").textContent = "0.0";
  target("live-status-icon").textContent = "🏕️";
  target("live-timeline").innerHTML =
    '<div style="color:var(--muted);font-size:.8rem;padding:10px">ממתין לתחילת המרוץ...</div>';
}

function resetRaceTablesUI() {
  target("lap-log-container").innerHTML =
    '<div style="color:var(--muted);text-align:center;padding:20px;font-size:.8rem">אין סיבובים מוגמרים</div>';
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
  return toArray(state.lapLog);
}

function getSchedule() {
  return toArray(state.schedule);
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

function findScheduleRowForLap(lapNum) {
  const schedule = getSchedule();
  const matches = schedule.filter((row) => lapRowMatches(row.lap, lapNum));
  if (matches.length) return matches[0];
  return schedule.find((row) => String(row.lap).includes(String(lapNum))) || null;
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
  const bar = target(targetName);
  if (!bar) return;

  const filtered = filterType ? segments.filter((seg) => seg.type === filterType) : segments;
  if (!filtered.length) {
    bar.innerHTML = "";
    return;
  }

  bar.innerHTML = filtered
    .map((seg) => {
      const pct = Math.max(0.15, (seg.ms / raceMs) * 100);
      return `<div class="progress-segment ${seg.type}" style="width:${pct}%"></div>`;
    })
    .join("");
}

function renderProgressBars(now = Date.now()) {
  if (!state.raceStarted) {
    target("time-progress-bar").innerHTML = "";
    target("laps-progress-bar").innerHTML = "";
    target("time-progress-pct").textContent = "0%";
    target("laps-progress-pct").textContent = `0/${state.settings?.targetLaps || 10}`;
    return;
  }

  const { segments, raceMs, raceStart, elapsedPct } = buildTimelineSegments(now);
  renderSegmentBar("time-progress-bar", segments, raceMs);
  renderSegmentBar("laps-progress-bar", segments, raceMs, "lap");

  target("time-progress-pct").textContent = `${Math.round(elapsedPct)}%`;

  const lapsDone = getLapLog().filter((lap) => lap.breakEnd).length;
  target("laps-progress-pct").textContent = `${lapsDone}/${state.settings.targetLaps}`;
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

  const managerLap = state.currentLapNum;
  const cur = findScheduleRowForLap(managerLap);

  badge.textContent = `סיבוב ${managerLap}`;
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

  const nextRow = findScheduleRowForLap(managerLap + 1);
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
  const card = target("pace-status");
  const text = target("pace-status-text");
  if (!card || !text) return;

  if (!state.raceStarted) {
    card.className = "neutral";
    text.textContent = "טרם התחיל";
    return;
  }

  const { deltaMs, completedLaps } = calculateCumulativeDelta();
  if (completedLaps === 0) {
    card.className = "neutral";
    text.textContent = "אין סיבובים מושלמים עדיין";
    return;
  }

  const deltaMin = Math.round(Math.abs(deltaMs) / 60000);
  if (deltaMs < 0) {
    card.className = "ahead";
    text.textContent = `🟢 מקדים את התוכנית ב-${deltaMin} דקות`;
  } else if (deltaMs > 0) {
    card.className = "behind";
    text.textContent = `🔴 בפיגור של ${deltaMin} דקות`;
  } else {
    card.className = "ahead";
    text.textContent = "🟢 בדיוק בקצב התוכנית";
  }
}

// ══════════════════════════════════════════════════════
// CLOCK TICK
// ══════════════════════════════════════════════════════
setInterval(tick, 1000);

function tick() {
  const now = Date.now();
  const d = new Date(now);
  target("live-timer").textContent =
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0") +
    ":" +
    String(d.getSeconds()).padStart(2, "0");

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
  const pi = target("pace-indicator");
  const pt = target("pace-indicator-text");
  if (diff > 0.3) {
    pi.className = "pace-indicator ahead";
    pt.textContent = `⬆ ${diff.toFixed(1)} סיבוב קדימה ביעד`;
  } else if (diff < -0.5) {
    pi.className = "pace-indicator behind";
    pt.textContent = `⬇ פיגור של ${Math.abs(diff).toFixed(1)} סיבוב`;
  } else {
    pi.className = "pace-indicator ontrack";
    pt.textContent = "✓ בדיוק בקצב";
  }

  target("live-laps-count").textContent = lapsDone;
  target("live-km-total").textContent = (lapsDone * (state.settings.lapDist || 8)).toFixed(1);
  target("live-status-icon").textContent = state.currentLapEnd === null ? "🏃" : "🏕️";
}

// ══════════════════════════════════════════════════════
// MODE & CONTENT TABS
// ══════════════════════════════════════════════════════
const CONTENT_VIEWS = {
  dashboard: "view-dashboard",
  log: "view-log",
  gear: "view-gear",
};

function switchTab(tab) {
  state.managerTab = tab;
  Object.entries(CONTENT_VIEWS).forEach(([name, targetName]) => {
    target(targetName)?.classList.toggle("hidden", name !== tab);
  });
  document.querySelectorAll('[data-action="switch-tab"]').forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
}

function setManagerTab(panel) {
  switchTab(panel);
}

function setMode(m) {
  state.mode = m;
  document.querySelectorAll("[data-view]").forEach((v) => v.classList.remove("active"));

  const tabBar = target("content-tab-bar");
  if (tabBar) tabBar.classList.toggle("hidden", m !== "manager" && m !== "gear");

  if (m === "gear") {
    viewEl("manager").classList.add("active");
    switchTab("gear");
    closeKebabMenu();
    return;
  }

  viewEl(m)?.classList.add("active");
  if (m === "manager") {
    switchTab(state.managerTab || "dashboard");
  }
  closeKebabMenu();
}

// ══════════════════════════════════════════════════════
// KEBAB MENU
// ══════════════════════════════════════════════════════
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
  });
}

// ══════════════════════════════════════════════════════
// SCHEDULE
// ══════════════════════════════════════════════════════
function getCurrentScheduleRow() {
  if (!state.raceStarted) return -1;
  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  let best = 0;
  getSchedule().forEach((r, i) => {
    const [h, m] = r.planned.split(":").map(Number);
    if (h * 60 + m <= nowM) best = i;
  });
  return best;
}

function renderSchedule() {
  const clockIdx = getCurrentScheduleRow();
  const schedule = getSchedule();
  const tbody = target("schedule-body");
  tbody.innerHTML = schedule
    .map((row, i) => {
      const cls =
        i === clockIdx && state.raceStarted
          ? "current-row"
          : i < clockIdx && state.raceStarted
            ? "completed-row"
            : "";
      const editBtn = isAdmin()
        ? `<button type="button" class="edit-btn" data-action="edit-row" data-row-id="${row.id}">✏️</button>`
        : "";
      return `<tr class="${cls}">
      <td class="time-cell">${row.planned}</td>
      <td class="actual-time-cell">${row.actualTime || '<span style="color:var(--muted)">—</span>'}</td>
      <td class="lap-cell">${row.lap}</td>
      <td>${row.food || "—"}</td>
      <td>${row.drink || "—"}</td>
      <td>${row.supps || "—"}</td>
      <td>${row.gear || "—"}</td>
      <td>${row.clothing || "—"}</td>
      <td style="color:var(--amber);font-size:.75rem">${row.notes || ""}</td>
      <td>${editBtn}</td>
    </tr>`;
    })
    .join("");

  updateCurrentLapCard();

  const lapLog = getLapLog();
  const now2 = Date.now();
  if (state.raceStarted && (lapLog.length > 0 || state.currentLapStart)) {
    const raceStart2 = lapLog[0]?.lapStart || state.currentLapStart;
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
    target("ring-meta-laps").textContent = lapsDone2 + " / " + state.settings.targetLaps;
    target("ring-meta-km").textContent =
      (lapsDone2 * (state.settings.lapDist || 8)).toFixed(1) + ' ק"מ';
  } else if (!state.raceStarted) {
    const ring = target("ring-time-progress");
    if (ring) ring.style.strokeDashoffset = String(2 * Math.PI * 35);
    target("ring-pct").textContent = "0%";
    target("ring-meta-time").textContent = "0%";
    target("ring-meta-laps").textContent = `0 / ${state.settings.targetLaps}`;
    target("ring-meta-km").textContent = '0 ק"מ';
  }

  renderProgressBars(now2);
}

function renderLapLog() {
  const container = target("lap-log-container");
  const lapLog = getLapLog();

  if (lapLog.length === 0) {
    container.innerHTML =
      '<div style="color:var(--muted);text-align:center;padding:20px;font-size:.8rem">אין סיבובים מוגמרים</div>';
    return;
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

  container.innerHTML = html;
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
// GEAR
// ══════════════════════════════════════════════════════
function renderGear() {
  target("gear-grid").innerHTML = GEAR_DATA.map((item) => {
    const chk = !!state.gearChecked[item.id];
    const toggleAttr = isAdmin() ? `data-action="toggle-gear" data-gear-id="${item.id}"` : "";
    return `<div class="gear-item ${chk ? "checked" : ""} ${item.mandatory ? "mandatory" : "optional"}" ${toggleAttr}>
      <div class="gear-check">${chk ? "✓" : ""}</div>
      <div><div class="category-badge">${item.cat}</div><div class="gear-name">${item.name}</div>${item.desc ? `<div class="gear-desc">${item.desc}</div>` : ""}</div>
    </div>`;
  }).join("");

  target("logistics-grid").innerHTML = LOGISTICS_DATA.map((item, i) => {
    const chk = !!state.logisticsChecked[i];
    const toggleAttr = isAdmin() ? `data-action="toggle-logistics" data-logistics-index="${i}"` : "";
    return `<div class="gear-item ${chk ? "checked" : ""} ${item.mandatory ? "mandatory" : "optional"}" ${toggleAttr}>
      <div class="gear-check">${chk ? "✓" : ""}</div>
      <div><div class="gear-name">${item.name}</div>${item.desc ? `<div class="gear-desc">${item.desc}</div>` : ""}</div>
    </div>`;
  }).join("");
}

function toggleGear(id) {
  if (!isAdmin()) return;
  store.toggleGear(id);
}

function toggleLogistics(i) {
  if (!isAdmin()) return;
  store.toggleLogistics(i);
}

// ══════════════════════════════════════════════════════
// EDITOR
// ══════════════════════════════════════════════════════
function openEditor(id) {
  if (!isAdmin()) return;
  const row = getSchedule().find((r) => r.id === id);
  if (!row) return;
  state.editingId = id;
  target("edit-planned-time").value = row.planned;
  target("edit-actual-time").value = row.actualTime || "";
  target("edit-food").value = row.food || "";
  target("edit-drink").value = row.drink || "";
  target("edit-supps").value = row.supps || "";
  target("edit-gear-field").value = row.gear || "";
  target("edit-clothing").value = row.clothing || "";
  target("edit-notes").value = row.notes || "";
  const panel = target("editor-panel");
  panel.classList.add("open");
  panel.scrollIntoView({ behavior: "smooth" });
}

function closeEditor() {
  state.editingId = null;
  target("editor-panel").classList.remove("open");
}

function saveEdit() {
  if (!isAdmin()) return;
  const editingId = state.editingId;
  if (!editingId) return;
  store.saveEdit(editingId, {
    planned: target("edit-planned-time").value,
    actualTime: target("edit-actual-time").value,
    food: target("edit-food").value,
    drink: target("edit-drink").value,
    supps: target("edit-supps").value,
    gear: target("edit-gear-field").value,
    clothing: target("edit-clothing").value,
    notes: target("edit-notes").value,
  });
  closeEditor();
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
  applyRoleUI();
  renderSchedule();
  renderLapLog();
  renderGear();
  renderLive();
  updateLockBadge();
  updateActionButtons();
  updateFinishRaceButton();
  renderPaceStatus();
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
    editingId: state.editingId,
  };
  state = mergeRemoteState(remote);
  state.mode = clientFields.mode;
  state.editingId = clientFields.editingId;

  target("setting-target-laps").value = state.settings.targetLaps;
  target("setting-lap-dist").value = state.settings.lapDist || 8;
  target("setting-lap-pace").value = state.settings.lapPaceMin;
  target("setting-target-lap").value =
    state.settings.targetLap ?? state.settings.lapPaceMin ?? 143;
  target("setting-target-pit").value = state.settings.targetPit ?? 5;
  target("setting-duration").value = state.settings.durationHours;

  renderAll();

  if (pendingFinishSummary && state.raceFinished) {
    pendingFinishSummary = false;
    showFinishSummary();
  }
}

function initActionDelegation() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;

    switch (el.dataset.action) {
      case "pin-key":
        pinKey(el.dataset.pinValue);
        break;
      case "pin-delete":
        pinDel();
        break;
      case "enter-viewer":
        enterAsViewer();
        break;
      case "toggle-kebab":
        e.stopPropagation();
        if (target("kebab-dropdown")?.classList.contains("open")) closeKebabMenu();
        else openKebabMenu();
        break;
      case "open-settings":
        setMode("settings");
        break;
      case "logout":
        logout();
        break;
      case "go-home":
        setMode("manager");
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
      case "close-editor":
        closeEditor();
        break;
      case "save-edit":
        saveEdit();
        break;
      case "save-settings":
        saveSettings();
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
      case "edit-row":
        openEditor(Number(el.dataset.rowId));
        break;
      case "toggle-gear":
        toggleGear(Number(el.dataset.gearId));
        break;
      case "toggle-logistics":
        toggleLogistics(Number(el.dataset.logisticsIndex));
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
  updateConnectionStatus();
  setManagerTab("dashboard");

  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);

  if (isAdmin()) {
    target("login-screen").classList.add("hidden");
    target("main-app")?.classList.remove("hidden");
  }
}

function exposeUiGlobals() {
  window.pinKey = pinKey;
  window.pinDel = pinDel;
  window.enterAsViewer = enterAsViewer;
  window.lockApp = lockApp;
  window.logout = logout;
  window.setMode = setMode;
  window.switchTab = switchTab;
  window.setManagerTab = setManagerTab;
  window.btnStartClick = btnStartClick;
  window.btnFinishClick = btnFinishClick;
  window.resetRace = resetRace;
  window.toggleGear = toggleGear;
  window.toggleLogistics = toggleLogistics;
  window.openEditor = openEditor;
  window.closeEditor = closeEditor;
  window.saveEdit = saveEdit;
  window.saveSettings = saveSettings;
  window.exportData = exportData;
  window.clearData = clearData;
  window.finishRaceClick = finishRaceClick;
  window.closeFinishModal = closeFinishModal;
  window.finishKey = finishKey;
  window.finishDel = finishDel;
  window.toggleDarkMode = toggleDarkMode;
}

exposeUiGlobals();
store.subscribe(updateStateAndRender);
initApp();
