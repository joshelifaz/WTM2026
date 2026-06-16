import { db, ref, onValue, set, update } from "./firebase.js";

const raceRef = ref(db, "race");

const DEFAULT_STATE = {
  settings: {
    raceName: "WTM 2026",
    lapDistanceKm: 6.706,
    breakMinutes: 30,
    totalLaps: 25,
  },
  schedule: [
    { id: "1", bib: "101", name: "מתחרה 1", laps: [], status: "idle" },
    { id: "2", bib: "102", name: "מתחרה 2", laps: [], status: "idle" },
    { id: "3", bib: "103", name: "מתחרה 3", laps: [], status: "idle" },
  ],
  activeLaps: {},
  break: {
    active: false,
    endsAt: null,
  },
  gearCheck: false,
  raceFinished: false,
  finishedAt: null,
  updatedAt: null,
};

let state = null;
const listeners = new Set();
let initialized = false;

function notify() {
  listeners.forEach((listener) => listener(state));
}

function ensureInitialized() {
  if (initialized) return;

  onValue(raceRef, (snapshot) => {
    if (snapshot.exists()) {
      state = snapshot.val();
    } else {
      state = structuredClone(DEFAULT_STATE);
      state.updatedAt = Date.now();
      set(raceRef, state);
    }
    notify();
  });

  initialized = true;
}

function subscribe(listener) {
  ensureInitialized();
  listeners.add(listener);
  if (state) listener(state);
  return () => listeners.delete(listener);
}

function findRowIndex(bib) {
  return (state?.schedule ?? []).findIndex((row) => row.bib === bib);
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

async function startLap(bib) {
  if (state?.raceFinished) return;

  const rowIndex = findRowIndex(bib);
  if (rowIndex < 0) return;

  const schedule = [...state.schedule];
  schedule[rowIndex] = { ...schedule[rowIndex], status: "running" };

  await update(raceRef, {
    schedule,
    [`activeLaps/${bib}`]: { startedAt: Date.now() },
    updatedAt: Date.now(),
  });
}

async function finishLap(bib) {
  if (state?.raceFinished) return;

  const activeLap = state?.activeLaps?.[bib];
  if (!activeLap) return;

  const rowIndex = findRowIndex(bib);
  if (rowIndex < 0) return;

  const finishedAt = Date.now();
  const duration = finishedAt - activeLap.startedAt;
  const schedule = [...state.schedule];
  const row = { ...schedule[rowIndex] };
  row.laps = [
    ...(row.laps ?? []),
    {
      startedAt: activeLap.startedAt,
      finishedAt,
      duration,
      durationLabel: formatDuration(duration),
    },
  ];
  row.status = "idle";
  schedule[rowIndex] = row;

  const activeLaps = { ...state.activeLaps };
  delete activeLaps[bib];

  const breakMinutes = state.settings?.breakMinutes ?? 30;
  const breakUpdate = {
    active: true,
    endsAt: finishedAt + breakMinutes * 60 * 1000,
  };

  await update(raceRef, {
    schedule,
    activeLaps,
    break: breakUpdate,
    updatedAt: Date.now(),
  });
}

async function closeBreak() {
  await update(raceRef, {
    break: { active: false, endsAt: null },
    updatedAt: Date.now(),
  });
}

async function updateScheduleRow(index, patch) {
  const schedule = [...(state?.schedule ?? [])];
  if (index < 0 || index >= schedule.length) return;

  schedule[index] = { ...schedule[index], ...patch };

  await update(raceRef, {
    schedule,
    updatedAt: Date.now(),
  });
}

async function toggleGear() {
  await update(raceRef, {
    gearCheck: !state?.gearCheck,
    updatedAt: Date.now(),
  });
}

async function finishRace() {
  await update(raceRef, {
    raceFinished: true,
    finishedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function saveSettings(settings) {
  await update(raceRef, {
    settings: { ...state?.settings, ...settings },
    updatedAt: Date.now(),
  });
}

export const store = {
  subscribe,
  startLap,
  finishLap,
  closeBreak,
  updateScheduleRow,
  toggleGear,
  finishRace,
  saveSettings,
  formatDuration,
};
