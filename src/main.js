import "./style.css";
import { store } from "./store.js";

const els = {
  raceName: document.getElementById("race-name"),
  raceStatus: document.getElementById("race-status"),
  breakPanel: document.getElementById("break-panel"),
  breakTimer: document.getElementById("break-timer"),
  closeBreakBtn: document.getElementById("close-break-btn"),
  gearToggle: document.getElementById("gear-toggle"),
  gearStatus: document.getElementById("gear-status"),
  finishRaceBtn: document.getElementById("finish-race-btn"),
  scheduleBody: document.getElementById("schedule-body"),
  settingsForm: document.getElementById("settings-form"),
  lapDistance: document.getElementById("lap-distance"),
  breakMinutes: document.getElementById("break-minutes"),
  totalLaps: document.getElementById("total-laps"),
  settingsRaceName: document.getElementById("settings-race-name"),
};

let breakInterval = null;

function formatClock(timestamp) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatCountdown(ms) {
  if (ms <= 0) return "00:00:00";
  return store.formatDuration(ms);
}

function renderBreak(state) {
  const breakActive = state.break?.active;
  els.breakPanel.hidden = !breakActive;
  els.closeBreakBtn.hidden = !breakActive;

  if (!breakActive) {
    clearInterval(breakInterval);
    breakInterval = null;
    els.breakTimer.textContent = "—";
    return;
  }

  const updateTimer = () => {
    const remaining = (state.break.endsAt ?? 0) - Date.now();
    els.breakTimer.textContent = formatCountdown(remaining);
  };

  updateTimer();
  if (!breakInterval) {
    breakInterval = setInterval(updateTimer, 1000);
  }
}

function renderSchedule(state) {
  els.scheduleBody.innerHTML = "";

  (state.schedule ?? []).forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.dataset.bib = row.bib;

    const lapCount = row.laps?.length ?? 0;
    const lastLap = row.laps?.[lapCount - 1];
    const isRunning = row.status === "running" || Boolean(state.activeLaps?.[row.bib]);
    const disabled = state.raceFinished ? "disabled" : "";

    tr.innerHTML = `
      <td><input type="text" class="cell-input" data-field="bib" value="${row.bib ?? ""}" ${disabled} /></td>
      <td><input type="text" class="cell-input" data-field="name" value="${row.name ?? ""}" ${disabled} /></td>
      <td>${lapCount}</td>
      <td>${lastLap?.durationLabel ?? "—"}</td>
      <td>${isRunning ? "בריצה" : state.raceFinished ? "סיום" : "ממתין"}</td>
      <td class="actions">
        <button type="button" class="btn btn-start" data-action="start" data-bib="${row.bib}" ${disabled}${isRunning ? " disabled" : ""}>התחל הקפה</button>
        <button type="button" class="btn btn-finish" data-action="finish" data-bib="${row.bib}" ${disabled}${isRunning ? "" : " disabled"}>סיים הקפה</button>
      </td>
    `;

    tr.querySelectorAll(".cell-input").forEach((input) => {
      input.addEventListener("change", () => {
        store.updateScheduleRow(index, { [input.dataset.field]: input.value.trim() });
      });
    });

    tr.querySelector('[data-action="start"]')?.addEventListener("click", () => {
      store.startLap(row.bib);
    });

    tr.querySelector('[data-action="finish"]')?.addEventListener("click", () => {
      store.finishLap(row.bib);
    });

    els.scheduleBody.appendChild(tr);
  });
}

function renderAll(state) {
  const settings = state.settings ?? {};

  els.raceName.textContent = settings.raceName ?? "WTM 2026";
  els.raceStatus.textContent = state.raceFinished
    ? `המרוץ הסתיים · ${formatClock(state.finishedAt)}`
    : "המרוץ פעיל";

  els.gearToggle.checked = Boolean(state.gearCheck);
  els.gearStatus.textContent = state.gearCheck ? "בדיקת ציוד: פעילה" : "בדיקת ציוד: כבויה";
  els.finishRaceBtn.disabled = Boolean(state.raceFinished);

  els.settingsRaceName.value = settings.raceName ?? "";
  els.lapDistance.value = settings.lapDistanceKm ?? "";
  els.breakMinutes.value = settings.breakMinutes ?? "";
  els.totalLaps.value = settings.totalLaps ?? "";

  renderBreak(state);
  renderSchedule(state);
}

els.closeBreakBtn?.addEventListener("click", () => store.closeBreak());
els.gearToggle?.addEventListener("change", () => store.toggleGear());
els.finishRaceBtn?.addEventListener("click", () => {
  if (window.confirm("לסיים את המרוץ?")) {
    store.finishRace();
  }
});

els.settingsForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  store.saveSettings({
    raceName: els.settingsRaceName.value.trim(),
    lapDistanceKm: Number(els.lapDistance.value),
    breakMinutes: Number(els.breakMinutes.value),
    totalLaps: Number(els.totalLaps.value),
  });
});

store.subscribe(renderAll);
