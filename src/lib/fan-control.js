const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const SCHEDULE_TICK_MS = 15 * 1000;

let fanState = "off";

let scheduleConfig = {
  enabled: false,
  onTime: "07:00",
  offTime: "19:00",
  updatedAt: null,
};

let lastOnTriggerMinute = "";
let lastOffTriggerMinute = "";
let schedulerHandle = null;

function pad(value) {
  return String(value).padStart(2, "0");
}

function toMinuteKey(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

function toHHMM(now = new Date()) {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function assertTimeLabel(value, fieldName) {
  const input = String(value || "").trim();
  if (!TIME_PATTERN.test(input)) {
    throw new Error(`Invalid ${fieldName}. Use 24-hour HH:mm format.`);
  }

  return input;
}

function touchScheduleUpdatedAt(now = new Date()) {
  scheduleConfig = {
    ...scheduleConfig,
    updatedAt: now.toISOString(),
  };
}

export function setFanState(state, source = "manual") {
  const nextState = state === "on" ? "on" : "off";
  fanState = nextState;
  console.log("[FAN]", "set to", nextState, "via", source);
  return fanState;
}

export function getFanState() {
  return fanState;
}

export function getScheduleConfig() {
  return { ...scheduleConfig };
}

export function setScheduleConfig({ onTime, offTime, enabled }) {
  const normalizedOn = assertTimeLabel(onTime, "onTime");
  const normalizedOff = assertTimeLabel(offTime, "offTime");

  if (normalizedOn === normalizedOff) {
    throw new Error("onTime and offTime must be different.");
  }

  scheduleConfig = {
    enabled: Boolean(enabled),
    onTime: normalizedOn,
    offTime: normalizedOff,
    updatedAt: null,
  };

  lastOnTriggerMinute = "";
  lastOffTriggerMinute = "";
  touchScheduleUpdatedAt();

  return getScheduleConfig();
}

export function clearScheduleConfig() {
  scheduleConfig = {
    ...scheduleConfig,
    enabled: false,
  };
  lastOnTriggerMinute = "";
  lastOffTriggerMinute = "";
  touchScheduleUpdatedAt();
  return getScheduleConfig();
}

export function applySchedule(now = new Date()) {
  if (!scheduleConfig.enabled) {
    return false;
  }

  const currentHHMM = toHHMM(now);
  const minuteKey = toMinuteKey(now);
  let changed = false;

  if (currentHHMM === scheduleConfig.onTime && lastOnTriggerMinute !== minuteKey) {
    setFanState("on", "schedule:on");
    lastOnTriggerMinute = minuteKey;
    changed = true;
  }

  if (currentHHMM === scheduleConfig.offTime && lastOffTriggerMinute !== minuteKey) {
    setFanState("off", "schedule:off");
    lastOffTriggerMinute = minuteKey;
    changed = true;
  }

  return changed;
}

export function ensureSchedulerStarted() {
  if (schedulerHandle) {
    return;
  }

  schedulerHandle = setInterval(() => {
    applySchedule();
  }, SCHEDULE_TICK_MS);

  if (typeof schedulerHandle.unref === "function") {
    schedulerHandle.unref();
  }
}
