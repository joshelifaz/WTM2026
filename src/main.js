import { store } from "./store.js";
import { GEAR_DATA, LOGISTICS_DATA, ADMIN_PIN } from "./data.js";

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
  editingId: null,
};

function applyRoleUI() {
  const admin = isAdmin();
  state.isEditor = admin;

  document.body.classList.toggle("is-admin", admin);
  document.body.classList.toggle("view-only", !admin);

  if (!admin) {
    document.querySelector(".editor-panel")?.classList.remove("open");
    state.editingId = null;
  }

  updateLockBadge();
}

function updateConnectionStatus() {
  const el = document.getElementById("connection-status");
  if (!el) return;
  const online = navigator.onLine;
  el.textContent = online ? "🟢 Online" : "🔴 Offline";
  el.classList.toggle("offline", !online);
}

function initDarkMode() {
  if (localStorage.getItem(DARK_MODE_KEY) === "1") {
    document.body.classList.add("dark-mode");
  }
  updateDarkModeButton();
}

function updateDarkModeButton() {
  const btn = document.getElementById("dark-mode-btn");
  if (!btn) return;
  const dark = document.body.classList.contains("dark-mode");
  btn.textContent = dark ? "☀️ מצב בהיר" : "🌙 מצב כהה";
}

function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem(DARK_MODE_KEY, document.body.classList.contains("dark-mode") ? "1" : "0");
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
    document.getElementById("d" + i).classList.toggle("filled", i < pinBuffer.length);
  }
}

function pinSubmit() {
  const pin = state.settings?.adminPin || ADMIN_PIN;
  if (pinBuffer === pin) {
    sessionStorage.setItem(EDITOR_SESSION_KEY, "1");
    hidePinOverlay();
  } else {
    document.getElementById("pin-error").textContent = "❌ קוד שגוי";
    pinBuffer = "";
    updatePinDots();
    setTimeout(() => (document.getElementById("pin-error").textContent = ""), 1500);
  }
}

function enterAsViewer() {
  hidePinOverlay();
}

function hidePinOverlay() {
  document.getElementById("pin-overlay").classList.add("hidden");
  applyRoleUI();
  renderAll();
}

function lockApp() {
  if (!isAdmin()) {
    document.getElementById("pin-overlay").classList.remove("hidden");
    pinBuffer = "";
    updatePinDots();
    document.getElementById("pin-error").textContent = "";
  } else {
    sessionStorage.removeItem(EDITOR_SESSION_KEY);
    applyRoleUI();
    renderAll();
  }
}

function updateLockBadge() {
  const b = document.getElementById("lock-badge");
  if (isAdmin()) {
    b.className = "lock-badge editor";
    b.textContent = "✏️ עורך";
  } else {
    b.className = "lock-badge viewer";
    b.textContent = "🔒 צופה";
  }
  document.getElementById("btn-start").disabled = !isAdmin() || state.raceFinished;
  document.getElementById("btn-finish").disabled =
    !isAdmin() || !state.raceStarted || state.currentLapEnd !== null || state.raceFinished;
  document.getElementById("btn-reset").disabled = !isAdmin();
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

function resetRace() {
  if (!isAdmin()) return;
  if (!confirm("לאפס את כל נתוני המרוץ?")) return;
  store.resetRace();
}

function updateActionButtons() {
  const s = document.getElementById("btn-start");
  const f = document.getElementById("btn-finish");

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
  document.getElementById("btn-reset").disabled = !isAdmin();
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

function renderSegmentBar(containerId, segments, raceMs, filterType = null) {
  const bar = document.getElementById(containerId);
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
    document.getElementById("time-progress").innerHTML = "";
    document.getElementById("laps-progress").innerHTML = "";
    document.getElementById("time-pct").textContent = "0%";
    document.getElementById("laps-pct").textContent = `0/${state.settings?.targetLaps || 10}`;
    return;
  }

  const { segments, raceMs, raceStart, elapsedPct } = buildTimelineSegments(now);
  renderSegmentBar("time-progress", segments, raceMs);
  renderSegmentBar("laps-progress", segments, raceMs, "lap");

  document.getElementById("time-pct").textContent = `${Math.round(elapsedPct)}%`;

  const lapsDone = getLapLog().filter((lap) => lap.breakEnd).length;
  document.getElementById("laps-pct").textContent = `${lapsDone}/${state.settings.targetLaps}`;
}

function updateCurrentLapCard() {
  const badge = document.getElementById("current-lap-badge");
  const foodEl = document.getElementById("cur-food");
  const drinkEl = document.getElementById("cur-drink");
  const suppsEl = document.getElementById("cur-supps");
  const gearEl = document.getElementById("cur-gear");
  const noteEl = document.getElementById("cur-note");
  const nextStrip = document.getElementById("next-lap-strip");

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
    document.getElementById("next-lap-num").textContent = nextRow.lap;
    const parts = [nextRow.food, nextRow.drink, nextRow.supps].filter(Boolean).join(" · ");
    document.getElementById("next-lap-content").textContent = parts || "—";
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

// ══════════════════════════════════════════════════════
// CLOCK TICK
// ══════════════════════════════════════════════════════
setInterval(tick, 1000);

function tick() {
  const now = Date.now();
  const d = new Date(now);
  document.getElementById("clock-now").textContent =
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0") +
    ":" +
    String(d.getSeconds()).padStart(2, "0");

  if (!state.raceStarted) {
    return;
  }

  const lapLog = getLapLog();

  if (state.currentLapEnd === null && state.currentLapStart) {
    document.getElementById("clock-lap-dur").textContent = fmtDurMs(now - state.currentLapStart);
  } else {
    const lastLap = lapLog[lapLog.length - 1];
    if (lastLap && lastLap.lapEnd)
      document.getElementById("clock-lap-dur").textContent = fmtDurMs(lastLap.lapEnd - lastLap.lapStart);
  }

  if (state.breakStart && state.currentLapEnd !== null) {
    const brk = Math.floor((now - state.breakStart) / 1000);
    document.getElementById("clock-break").textContent = fmtDurSec(brk);
    document.getElementById("break-display").style.display = "flex";
    document.getElementById("break-clock").textContent = fmtDurSec(brk);
  } else {
    document.getElementById("clock-break").textContent = "--:--";
    document.getElementById("break-display").style.display = "none";
  }

  if (state.currentLapStart && state.currentLapEnd === null) {
    const expReturn = new Date(state.currentLapStart + state.settings.lapPaceMin * 60000);
    document.getElementById("clock-return").textContent =
      String(expReturn.getHours()).padStart(2, "0") + ":" + String(expReturn.getMinutes()).padStart(2, "0");
  } else {
    document.getElementById("clock-return").textContent = "--:--";
  }

  const raceStart = lapLog.length > 0 ? lapLog[0].lapStart : state.currentLapStart || now;
  const elapsed = now - raceStart;

  renderProgressBars(now);

  const lapsDone = lapLog.filter((l) => l.breakEnd).length;

  const expectedLaps = elapsed / (state.settings.lapPaceMin * 60000);
  const diff = lapsDone - expectedLaps;
  const pi = document.getElementById("pace-indicator");
  const pt = document.getElementById("pace-text");
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

  document.getElementById("live-laps").textContent = lapsDone;
  document.getElementById("live-km").textContent = (lapsDone * (state.settings.lapDist || 8)).toFixed(1);
  document.getElementById("live-status").textContent = state.currentLapEnd === null ? "🏃" : "🏕️";
}

// ══════════════════════════════════════════════════════
// MODE
// ══════════════════════════════════════════════════════
function setMode(m) {
  state.mode = m;
  document.querySelectorAll(".mode-btn").forEach((b, i) => {
    b.classList.toggle("active", ["manager", "live", "gear", "settings"][i] === m);
  });
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + m).classList.add("active");
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
  const tbody = document.getElementById("schedule-body");
  tbody.innerHTML = schedule
    .map((row, i) => {
      const cls =
        i === clockIdx && state.raceStarted
          ? "current-row"
          : i < clockIdx && state.raceStarted
            ? "completed-row"
            : "";
      const editBtn = isAdmin()
        ? `<button class="edit-btn" onclick="openEditor(${row.id})">✏️</button>`
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
    const ring = document.getElementById("ring-time");
    if (ring) {
      ring.style.strokeDashoffset = offset;
    }
    document.getElementById("ring-pct-val").textContent = Math.round(pct) + "%";
    document.getElementById("rm-time").textContent = Math.round(pct) + "%";
    const lapsDone2 = lapLog.filter((l) => l.breakEnd).length;
    document.getElementById("rm-laps").textContent = lapsDone2 + " / " + state.settings.targetLaps;
    document.getElementById("rm-km").textContent =
      (lapsDone2 * (state.settings.lapDist || 8)).toFixed(1) + ' ק"מ';
  }

  renderProgressBars(now2);
}

function renderLapLog() {
  const container = document.getElementById("lap-log-rows");
  const lapLog = getLapLog();

  if (lapLog.length === 0) {
    container.innerHTML =
      '<div style="color:var(--muted);text-align:center;padding:20px;font-size:.8rem">אין סיבובים מוגמרים</div>';
    return;
  }
  const targetMs = state.settings.lapPaceMin * 60000;
  let prevLapMs = null;
  let html = "";

  lapLog.forEach((lap) => {
    if (!lap.lapStart || !lap.lapEnd) return;

    const lapMs = lap.lapEnd - lap.lapStart;
    const breakMs = lap.breakEnd ? lap.breakEnd - lap.lapEnd : null;
    const deltaMs = lapMs - targetMs;
    const deltaSign = deltaMs < 0 ? "-" : "+";
    const deltaCls = deltaMs < 0 ? "delta-pos" : "delta-neg";
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
        <span class="mono">${prBadge}${fmtDurMs(lapMs)}${vsPrev}</span>
        <span class="${deltaCls} mono">${deltaSign}${fmtDurMs(Math.abs(deltaMs))}</span>
      </div>
    </div>`;
    if (breakMs !== null || lap.breakEnd === null) {
      html += `<div class="lap-log-break">
        <span>⏸ הפסקה</span>
        <span class="mono">${fmtHHMM(lap.lapEnd)}</span>
        <span class="mono">${fmtHHMM(lap.breakEnd)}</span>
        <span class="mono">${lap.breakEnd ? fmtDurMs(lap.breakEnd - lap.lapEnd) : '<span class="blink">מתמשך...</span>'}</span>
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
  const tl = document.getElementById("live-timeline");
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
  document.getElementById("gear-grid").innerHTML = GEAR_DATA.map((item) => {
    const chk = !!state.gearChecked[item.id];
    return `<div class="gear-item ${chk ? "checked" : ""} ${item.mandatory ? "mandatory" : "optional"}" onclick="${isAdmin() ? `toggleGear(${item.id})` : ""}">
      <div class="gear-check">${chk ? "✓" : ""}</div>
      <div><div class="category-badge">${item.cat}</div><div class="gear-name">${item.name}</div>${item.desc ? `<div class="gear-desc">${item.desc}</div>` : ""}</div>
    </div>`;
  }).join("");

  document.getElementById("logistics-grid").innerHTML = LOGISTICS_DATA.map((item, i) => {
    const chk = !!state.logisticsChecked[i];
    return `<div class="gear-item ${chk ? "checked" : ""} ${item.mandatory ? "mandatory" : "optional"}" onclick="${isAdmin() ? `toggleLogistics(${i})` : ""}">
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
  document.getElementById("edit-time").value = row.planned;
  document.getElementById("edit-actual").value = row.actualTime || "";
  document.getElementById("edit-food").value = row.food || "";
  document.getElementById("edit-drink").value = row.drink || "";
  document.getElementById("edit-supps").value = row.supps || "";
  document.getElementById("edit-gear").value = row.gear || "";
  document.getElementById("edit-clothing").value = row.clothing || "";
  document.getElementById("edit-notes").value = row.notes || "";
  document.getElementById("editor-panel").classList.add("open");
  document.getElementById("editor-panel").scrollIntoView({ behavior: "smooth" });
}

function closeEditor() {
  state.editingId = null;
  document.getElementById("editor-panel").classList.remove("open");
}

function saveEdit() {
  if (!isAdmin()) return;
  const editingId = state.editingId;
  if (!editingId) return;
  store.saveEdit(editingId, {
    planned: document.getElementById("edit-time").value,
    actualTime: document.getElementById("edit-actual").value,
    food: document.getElementById("edit-food").value,
    drink: document.getElementById("edit-drink").value,
    supps: document.getElementById("edit-supps").value,
    gear: document.getElementById("edit-gear").value,
    clothing: document.getElementById("edit-clothing").value,
    notes: document.getElementById("edit-notes").value,
  });
  closeEditor();
}

// ══════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════
function saveSettings() {
  if (!isAdmin()) return;
  const newPin = document.getElementById("setting-pin").value;
  if (newPin && newPin.length === 4 && /^\d{4}$/.test(newPin)) {
    setAdminPin(newPin);
    state.settings.adminPin = newPin;
  }
  store.saveSettings({
    targetLaps: parseInt(document.getElementById("setting-laps").value) || 10,
    lapDist: parseFloat(document.getElementById("setting-dist").value) || 8,
    lapPaceMin: parseInt(document.getElementById("setting-pace").value) || 144,
    durationHours: parseInt(document.getElementById("setting-duration").value) || 25,
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
}

function updateFinishRaceButton() {
  const btn = document.getElementById("btn-finish-race");
  if (!btn) return;
  if (state.raceFinished) {
    btn.textContent = "🏆 מרוץ הסתיים";
    btn.style.background = "#f0fdf4";
    btn.style.color = "#15803d";
    btn.style.borderColor = "#86efac";
    btn.disabled = true;
  }
}

// ══════════════════════════════════════════════════════
// FINISH RACE
// ══════════════════════════════════════════════════════
let finishBuffer = "";

function finishRaceClick() {
  if (!isAdmin()) return;
  finishBuffer = "";
  updateFinishDots();
  document.getElementById("finish-error").textContent = "";
  document.getElementById("finish-modal").style.display = "flex";
}

function closeFinishModal() {
  document.getElementById("finish-modal").style.display = "none";
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
    document.getElementById("fd" + i).classList.toggle("filled", i < finishBuffer.length);
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
    document.getElementById("finish-error").textContent = "❌ קוד שגוי";
    finishBuffer = "";
    updateFinishDots();
    setTimeout(() => (document.getElementById("finish-error").textContent = ""), 1500);
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

  document.getElementById("setting-laps").value = state.settings.targetLaps;
  document.getElementById("setting-dist").value = state.settings.lapDist || 8;
  document.getElementById("setting-pace").value = state.settings.lapPaceMin;
  document.getElementById("setting-duration").value = state.settings.durationHours;

  renderAll();

  if (pendingFinishSummary && state.raceFinished) {
    pendingFinishSummary = false;
    showFinishSummary();
  }
}

function initApp() {
  applyRoleUI();
  initDarkMode();
  updateConnectionStatus();

  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);

  if (isAdmin()) {
    document.getElementById("pin-overlay").classList.add("hidden");
  }
}

store.subscribe(updateStateAndRender);
initApp();

Object.assign(window, {
  pinKey,
  pinDel,
  enterAsViewer,
  lockApp,
  setMode,
  btnStartClick,
  btnFinishClick,
  resetRace,
  toggleGear,
  toggleLogistics,
  openEditor,
  closeEditor,
  saveEdit,
  saveSettings,
  exportData,
  clearData,
  finishRaceClick,
  closeFinishModal,
  finishKey,
  finishDel,
  toggleDarkMode,
});
