import { db, ref, onValue, set, update } from "./firebase.js";
import { SCHEDULE_DATA, ENVIRONMENT_TRIGGERS } from "./data.js";

const RACE_PATH = "races/wtm2026";
const raceRef = ref(db, RACE_PATH);

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

function normalizeLapLog(raw) {
  return toArray(raw).map((lap) => ({
    lapNum: lap.lapNum ?? 0,
    lapStart: lap.lapStart ?? null,
    lapEnd: lap.lapEnd ?? null,
    breakEnd: lap.breakEnd ?? null,
  }));
}

function normalizeTriggerTime(time) {
  if (!time) return "00:00";
  const parts = String(time).trim().split(":");
  const h = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function triggersFromDefaults() {
  return Object.fromEntries(
    ENVIRONMENT_TRIGGERS.map((trigger) => [
      trigger.id,
      {
        id: trigger.id,
        time: normalizeTriggerTime(trigger.time),
        title: trigger.title,
        text: trigger.text,
      },
    ])
  );
}

function normalizeTriggers(raw, defaults) {
  if (!raw) return defaults;
  if (Array.isArray(raw)) {
    return Object.fromEntries(
      raw
        .filter((trigger) => trigger?.id)
        .map((trigger) => [
          trigger.id,
          {
            id: trigger.id,
            time: normalizeTriggerTime(trigger.time),
            title: trigger.title ?? "",
            text: trigger.text ?? "",
          },
        ])
    );
  }
  if (typeof raw === "object") {
    return Object.fromEntries(
      Object.entries(raw)
        .filter(([, trigger]) => trigger)
        .map(([key, trigger]) => {
          const id = trigger.id || key;
          return [
            id,
            {
              id,
              time: normalizeTriggerTime(trigger.time),
              title: trigger.title ?? "",
              text: trigger.text ?? "",
            },
          ];
        })
    );
  }
  return defaults;
}

function createDefaultState() {
  return {
    lapLog: [],
    currentLapNum: 0,
    currentLapStart: null,
    currentLapEnd: null,
    breakStart: null,
    raceStarted: false,
    schedule: structuredClone(SCHEDULE_DATA),
    gearChecked: {},
    logisticsChecked: {},
    settings: {
      targetLaps: 10,
      lapPaceMin: 144,
      targetLap: 143,
      targetPit: 5,
      durationHours: 25,
      lapDist: 8,
    },
    raceFinished: false,
    raceFinishedAt: null,
    triggers: triggersFromDefaults(),
    updatedAt: Date.now(),
  };
}

let remoteState = null;
const listeners = new Set();
let unsubscribeDb = null;

function normalizeState(raw) {
  const defaults = createDefaultState();
  if (!raw) return defaults;

  return {
    ...defaults,
    ...raw,
    settings: { ...defaults.settings, ...(raw.settings ?? {}) },
    schedule: toArray(raw.schedule).length ? toArray(raw.schedule) : defaults.schedule,
    lapLog: normalizeLapLog(raw.lapLog),
    gearChecked: raw.gearChecked ?? {},
    logisticsChecked: raw.logisticsChecked ?? {},
    triggers: normalizeTriggers(raw.triggers, defaults.triggers),
  };
}

function toRemotePayload(state) {
  const { settings, ...rest } = state;
  const { adminPin: _pin, ...remoteSettings } = settings ?? {};
  return {
    ...rest,
    settings: remoteSettings,
    updatedAt: Date.now(),
  };
}

function notify() {
  listeners.forEach((listener) => listener(remoteState));
}

function startListening() {
  if (unsubscribeDb) return;

  unsubscribeDb = onValue(
    raceRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        if (!val.triggers) {
          const defaults = createDefaultState();
          remoteState = normalizeState({ ...val, triggers: defaults.triggers });
          update(raceRef, { triggers: defaults.triggers, updatedAt: Date.now() });
        } else {
          remoteState = normalizeState(val);
        }
      } else {
        remoteState = createDefaultState();
        set(raceRef, remoteState);
      }
      notify();
    },
    (error) => {
      console.error("race listener error:", error);
    }
  );
}

function stopListening() {
  if (unsubscribeDb) {
    unsubscribeDb();
    unsubscribeDb = null;
  }
  remoteState = null;
  notify();
}

function subscribe(listener) {
  listeners.add(listener);
  if (remoteState) listener(remoteState);
  return () => listeners.delete(listener);
}

async function saveState(state) {
  await set(raceRef, toRemotePayload(state));
}

async function btnStartClick() {
  if (!remoteState || remoteState.raceFinished) return;

  const now = Date.now();
  const lapLog = normalizeLapLog(remoteState.lapLog);

  if (!remoteState.raceStarted) {
    await update(raceRef, {
      raceStarted: true,
      currentLapNum: 1,
      currentLapStart: now,
      currentLapEnd: null,
      breakStart: null,
      updatedAt: now,
    });
    return;
  }

  const prevLapNum = remoteState.currentLapNum;
  const lapStart = remoteState.currentLapStart;
  const lapEnd = remoteState.currentLapEnd || now;
  const breakEnd = now;

  const alreadyLogged = lapLog.find((l) => l.lapNum === prevLapNum);
  if (alreadyLogged) {
    alreadyLogged.breakEnd = breakEnd;
  } else {
    lapLog.push({ lapNum: prevLapNum, lapStart, lapEnd, breakEnd });
  }

  await update(raceRef, {
    lapLog,
    currentLapNum: prevLapNum + 1,
    currentLapStart: breakEnd,
    currentLapEnd: null,
    breakStart: null,
    updatedAt: now,
  });
}

async function btnFinishClick() {
  if (!remoteState || !remoteState.raceStarted || remoteState.currentLapEnd !== null) return;

  const now = Date.now();
  const lapLog = normalizeLapLog(remoteState.lapLog);
  const existing = lapLog.find((l) => l.lapNum === remoteState.currentLapNum);

  if (!existing) {
    lapLog.push({
      lapNum: remoteState.currentLapNum,
      lapStart: remoteState.currentLapStart,
      lapEnd: now,
      breakEnd: null,
    });
  }

  await update(raceRef, {
    lapLog,
    currentLapEnd: now,
    breakStart: now,
    updatedAt: now,
  });
}

async function resetRace() {
  if (!remoteState) return;

  await update(raceRef, {
    lapLog: [],
    currentLapNum: 0,
    currentLapStart: null,
    currentLapEnd: null,
    breakStart: null,
    raceStarted: false,
    raceFinished: false,
    raceFinishedAt: null,
    gearChecked: {},
    logisticsChecked: {},
    updatedAt: Date.now(),
  });
}

async function toggleGear(id) {
  const gearChecked = { ...remoteState.gearChecked };
  gearChecked[id] = !gearChecked[id];
  await update(raceRef, { gearChecked, updatedAt: Date.now() });
}

async function toggleLogistics(index) {
  const logisticsChecked = { ...remoteState.logisticsChecked };
  logisticsChecked[index] = !logisticsChecked[index];
  await update(raceRef, { logisticsChecked, updatedAt: Date.now() });
}

async function saveEdit(id, patch) {
  const schedule = toArray(remoteState.schedule).map((row) =>
    row.id === id
      ? {
          ...row,
          lap: patch.lap ?? row.lap,
          food: patch.food ?? row.food ?? "",
          drink: patch.drink ?? row.drink ?? "",
          supps: patch.supps ?? row.supps ?? "",
        }
      : row
  );
  await update(raceRef, { schedule, updatedAt: Date.now() });
}

async function addScheduleRow(newRowData) {
  const schedule = toArray(remoteState.schedule);
  const maxId = schedule.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
  const newRow = {
    id: maxId + 1,
    lap: String(newRowData.lap ?? "1").trim(),
    food: newRowData.food ?? "",
    drink: newRowData.drink ?? "",
    supps: newRowData.supps ?? "",
    planned: "",
    day: "",
    gear: "",
    clothing: "",
    notes: "",
  };
  await update(raceRef, { schedule: [...schedule, newRow], updatedAt: Date.now() });
  return newRow.id;
}

async function deleteScheduleRow(rowId) {
  const schedule = toArray(remoteState.schedule).filter((row) => row.id !== rowId);
  await update(raceRef, { schedule, updatedAt: Date.now() });
}

async function saveSettings(settings) {
  await update(raceRef, {
    settings: { ...remoteState.settings, ...settings },
    updatedAt: Date.now(),
  });
}

async function finishRace() {
  const now = Date.now();
  const lapLog = normalizeLapLog(remoteState.lapLog);
  const updates = {
    raceFinished: true,
    raceFinishedAt: now,
    updatedAt: now,
  };

  if (remoteState.currentLapEnd === null && remoteState.currentLapStart) {
    updates.currentLapEnd = now;
    updates.breakStart = now;

    const existing = lapLog.find((l) => l.lapNum === remoteState.currentLapNum);
    if (!existing) {
      lapLog.push({
        lapNum: remoteState.currentLapNum,
        lapStart: remoteState.currentLapStart,
        lapEnd: now,
        breakEnd: now,
      });
    } else {
      existing.lapEnd = now;
      existing.breakEnd = now;
    }
    updates.lapLog = lapLog;
  }

  await update(raceRef, updates);
}

async function clearData() {
  await set(raceRef, createDefaultState());
}

async function addTrigger(triggerObj) {
  if (!remoteState || !triggerObj) return null;

  const id = String(triggerObj.id || `trigger_${Date.now()}`).trim();
  const trigger = {
    id,
    time: normalizeTriggerTime(triggerObj.time),
    title: String(triggerObj.title ?? "").trim(),
    text: String(triggerObj.text ?? "").trim(),
  };

  if (!trigger.time || !trigger.title) return null;

  await update(raceRef, {
    [`triggers/${id}`]: trigger,
    updatedAt: Date.now(),
  });
  return id;
}

async function deleteTrigger(triggerId) {
  if (!remoteState || !triggerId) return;
  await update(raceRef, {
    [`triggers/${triggerId}`]: null,
    updatedAt: Date.now(),
  });
}

function getTriggerById(triggerId) {
  if (!remoteState?.triggers || !triggerId) return null;
  const raw = remoteState.triggers;
  if (raw[triggerId]) return raw[triggerId];
  return Object.values(raw).find((trigger) => trigger?.id === triggerId) ?? null;
}

async function editTrigger(triggerId, updatedData) {
  if (!remoteState || !triggerId || !updatedData) return false;

  const existing = getTriggerById(triggerId);
  if (!existing) return false;

  const trigger = {
    id: triggerId,
    time: normalizeTriggerTime(updatedData.time ?? existing.time),
    title: String(updatedData.title ?? existing.title).trim(),
    text: String(updatedData.text ?? existing.text ?? "").trim(),
  };

  if (!trigger.time || !trigger.title) return false;

  await update(raceRef, {
    [`triggers/${triggerId}`]: trigger,
    updatedAt: Date.now(),
  });
  return true;
}

export const store = {
  RACE_PATH,
  subscribe,
  startListening,
  stopListening,
  saveState,
  btnStartClick,
  btnFinishClick,
  resetRace,
  toggleGear,
  toggleLogistics,
  saveEdit,
  addScheduleRow,
  deleteScheduleRow,
  saveSettings,
  finishRace,
  clearData,
  addTrigger,
  deleteTrigger,
  editTrigger,
};
