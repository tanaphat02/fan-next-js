"use client";

import { useEffect, useMemo, useState } from "react";

const STATUS_META = {
  on: {
    label: "ONLINE",
    detail: "Fan output channel is active and currently delivering airflow.",
    tone: "on",
  },
  off: {
    label: "OFFLINE",
    detail: "Fan output channel is idle and waiting for command input.",
    tone: "off",
  },
  unknown: {
    label: "NO DATA",
    detail: "Authenticate to read live device status from the control route.",
    tone: "unknown",
  },
};

const DEFAULT_SCHEDULE = {
  enabled: false,
  onTime: "07:00",
  offTime: "19:00",
  updatedAt: null,
};

function createDefaultSchedule() {
  return { ...DEFAULT_SCHEDULE };
}

function normalizeSchedule(input) {
  return {
    enabled: Boolean(input?.enabled),
    onTime: input?.onTime || DEFAULT_SCHEDULE.onTime,
    offTime: input?.offTime || DEFAULT_SCHEDULE.offTime,
    updatedAt: input?.updatedAt || null,
  };
}

function formatScheduleText(schedule) {
  if (!schedule.enabled) {
    return "Schedule disabled. Manual controls only.";
  }

  return `Daily automation: ON ${schedule.onTime} / OFF ${schedule.offTime} (24h local time).`;
}

function formatDateTime(value) {
  if (!value) {
    return "Not configured yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not configured yet";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function FanPage() {
  const [sessionChecking, setSessionChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [working, setWorking] = useState(false);
  const [key, setKey] = useState("");
  const [status, setStatus] = useState("unknown");
  const [message, setMessage] = useState("");
  const [schedule, setSchedule] = useState(createDefaultSchedule);
  const [scheduleForm, setScheduleForm] = useState(createDefaultSchedule);

  const statusMeta = useMemo(() => STATUS_META[status] || STATUS_META.unknown, [status]);
  const controlsLocked = working || sessionChecking || !authenticated;

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    const pollHandle = setInterval(() => {
      fetchStatus().catch(() => {
        // Auth/state errors are handled in fetchStatus.
      });
    }, 15000);

    return () => clearInterval(pollHandle);
  }, [authenticated]);

  function applyScheduleState(nextSchedule) {
    const normalized = normalizeSchedule(nextSchedule);
    setSchedule(normalized);
    setScheduleForm({ ...normalized });
  }

  function resetScheduleState() {
    const fallback = createDefaultSchedule();
    setSchedule(fallback);
    setScheduleForm({ ...fallback });
  }

  async function loadSession() {
    setSessionChecking(true);
    setMessage("");

    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const sessionOk = res.ok && data.authenticated === true;

      setAuthenticated(sessionOk);
      if (sessionOk) {
        await Promise.all([fetchStatus(), fetchSchedule()]);
        setMessage("Secure session active.");
      } else {
        setStatus("unknown");
        resetScheduleState();
      }
    } catch {
      setAuthenticated(false);
      setStatus("unknown");
      resetScheduleState();
      setMessage("Could not validate session.");
    } finally {
      setSessionChecking(false);
    }
  }

  async function fetchStatus() {
    const res = await fetch("/api/fan", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401) {
        setAuthenticated(false);
        setStatus("unknown");
        resetScheduleState();
      }
      throw new Error(data.message || "Unable to fetch fan status.");
    }

    const nextState = data.state === "on" ? "on" : "off";
    setStatus(nextState);
    return nextState;
  }

  async function fetchSchedule() {
    const res = await fetch("/api/fan/schedule", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401) {
        setAuthenticated(false);
        resetScheduleState();
      }
      throw new Error(data.message || "Unable to fetch schedule.");
    }

    applyScheduleState(data.schedule);
    return data.schedule;
  }

  async function login(event) {
    event.preventDefault();

    const trimmedKey = key.trim();
    if (!trimmedKey) {
      setMessage("Access key is required.");
      return;
    }

    setWorking(true);
    setMessage("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: trimmedKey }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Login failed.");
      }

      setAuthenticated(true);
      setKey("");
      await Promise.all([fetchStatus(), fetchSchedule()]);
      setMessage("Authentication completed.");
    } catch (error) {
      setAuthenticated(false);
      setStatus("unknown");
      resetScheduleState();
      setMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setWorking(false);
    }
  }

  async function logout() {
    setWorking(true);
    setMessage("");

    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setAuthenticated(false);
      setStatus("unknown");
      resetScheduleState();
      setMessage("Session closed.");
    } finally {
      setWorking(false);
    }
  }

  async function setFan(nextState) {
    setWorking(true);
    setMessage("");

    try {
      const res = await fetch("/api/fan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: nextState }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          setAuthenticated(false);
          setStatus("unknown");
          resetScheduleState();
        }
        throw new Error(data.message || "Command rejected.");
      }

      const state = data.state === "on" ? "on" : "off";
      setStatus(state);
      setMessage(state === "on" ? "Fan switched ON." : "Fan switched OFF.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Command failed.");
    } finally {
      setWorking(false);
    }
  }

  async function saveSchedule(event) {
    event.preventDefault();

    if (!scheduleForm.onTime || !scheduleForm.offTime) {
      setMessage("Please set both ON and OFF time in HH:mm.");
      return;
    }

    if (scheduleForm.onTime === scheduleForm.offTime) {
      setMessage("ON and OFF time must be different.");
      return;
    }

    setWorking(true);
    setMessage("");

    try {
      const res = await fetch("/api/fan/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: scheduleForm.enabled,
          onTime: scheduleForm.onTime,
          offTime: scheduleForm.offTime,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          setAuthenticated(false);
          setStatus("unknown");
          resetScheduleState();
        }
        throw new Error(data.message || "Unable to save schedule.");
      }

      applyScheduleState(data.schedule);
      if (data.state === "on" || data.state === "off") {
        setStatus(data.state);
      }
      setMessage(
        scheduleForm.enabled
          ? `Schedule saved: ON ${scheduleForm.onTime} / OFF ${scheduleForm.offTime}.`
          : "Schedule saved but currently disabled.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save schedule.");
    } finally {
      setWorking(false);
    }
  }

  async function disableSchedule() {
    setWorking(true);
    setMessage("");

    try {
      const res = await fetch("/api/fan/schedule", {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          setAuthenticated(false);
          setStatus("unknown");
          resetScheduleState();
        }
        throw new Error(data.message || "Unable to disable schedule.");
      }

      applyScheduleState(data.schedule);
      if (data.state === "on" || data.state === "off") {
        setStatus(data.state);
      }
      setMessage("Schedule disabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to disable schedule.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="bank-shell">
      <section className="bank-console">
        <header className="bank-header">
          <div className="bank-brand">
            <span className="bank-badge">RA</span>
            <div>
              <p className="bank-eyebrow">Remote Air Systems</p>
              <h1>Secure Fan Command Desk</h1>
            </div>
          </div>
          <p className="bank-session-note">
            {sessionChecking
              ? "Validating session signature..."
              : authenticated
                ? "Authenticated operator session"
                : "No active session"}
          </p>
        </header>

        <div className="bank-grid">
          <article className="bank-panel">
            <p className="bank-panel-kicker">Authentication</p>
            <h2>Operator Login</h2>
            <p className="bank-panel-copy">
              Enter your control key once. The server issues a signed HttpOnly cookie and keeps the key out
              of client storage.
            </p>

            <form className="bank-form" onSubmit={login}>
              <label htmlFor="control-key">Access Key</label>
              <input
                id="control-key"
                type="password"
                autoComplete="off"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="Enter control key"
                disabled={working}
              />
              <button type="submit" className="bank-button bank-button--primary" disabled={working}>
                {working ? "Processing..." : authenticated ? "Re-authenticate" : "Authenticate"}
              </button>
            </form>

            <div className="bank-chip-row">
              <span className={`bank-chip ${authenticated ? "is-good" : "is-idle"}`}>
                {authenticated ? "Session: Active" : "Session: Locked"}
              </span>
              <span className="bank-chip">HttpOnly Cookie</span>
              <span className="bank-chip">SameSite=Strict</span>
            </div>
          </article>

          <article className="bank-panel">
            <div className="bank-status-head">
              <div>
                <p className="bank-panel-kicker">Operations</p>
                <h2>Fan Control</h2>
              </div>
              <span className={`bank-state-pill is-${statusMeta.tone}`}>{statusMeta.label}</span>
            </div>

            <p className="bank-panel-copy bank-panel-copy--tight">{statusMeta.detail}</p>
            <p className="bank-panel-copy bank-panel-copy--summary">{formatScheduleText(schedule)}</p>

            <div className="bank-actions">
              <button
                className="bank-button bank-button--on"
                onClick={() => setFan("on")}
                disabled={controlsLocked}
              >
                Power ON
              </button>
              <button
                className="bank-button bank-button--off"
                onClick={() => setFan("off")}
                disabled={controlsLocked}
              >
                Power OFF
              </button>
            </div>

            <div className="bank-actions bank-actions--secondary">
              <button
                className="bank-button bank-button--ghost"
                onClick={loadSession}
                disabled={working || sessionChecking}
              >
                Refresh Session
              </button>
              <button
                className="bank-button bank-button--danger"
                onClick={logout}
                disabled={working || !authenticated}
              >
                Sign Out
              </button>
            </div>
          </article>

          <article className="bank-panel bank-panel--wide">
            <div className="bank-status-head">
              <div>
                <p className="bank-panel-kicker">Automation</p>
                <h2>24-Hour ON/OFF Schedule</h2>
              </div>
              <span className={`bank-state-pill ${schedule.enabled ? "is-on" : "is-unknown"}`}>
                {schedule.enabled ? "ARMED" : "DISABLED"}
              </span>
            </div>

            <p className="bank-panel-copy">
              Configure daily trigger times in local server time using 24-hour format (`HH:mm`).
            </p>

            <form className="bank-form" onSubmit={saveSchedule}>
              <div className="bank-time-grid">
                <div className="bank-field">
                  <label htmlFor="schedule-on">Daily ON (24h)</label>
                  <input
                    id="schedule-on"
                    name="onTime"
                    type="time"
                    step="60"
                    value={scheduleForm.onTime}
                    onChange={(event) =>
                      setScheduleForm((prev) => ({
                        ...prev,
                        onTime: event.target.value,
                      }))
                    }
                    disabled={controlsLocked}
                  />
                </div>

                <div className="bank-field">
                  <label htmlFor="schedule-off">Daily OFF (24h)</label>
                  <input
                    id="schedule-off"
                    name="offTime"
                    type="time"
                    step="60"
                    value={scheduleForm.offTime}
                    onChange={(event) =>
                      setScheduleForm((prev) => ({
                        ...prev,
                        offTime: event.target.value,
                      }))
                    }
                    disabled={controlsLocked}
                  />
                </div>
              </div>

              <label className="bank-toggle" htmlFor="schedule-enabled">
                <input
                  id="schedule-enabled"
                  type="checkbox"
                  checked={scheduleForm.enabled}
                  onChange={(event) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      enabled: event.target.checked,
                    }))
                  }
                  disabled={controlsLocked}
                />
                <span>Enable daily automation</span>
              </label>

              <div className="bank-actions bank-actions--secondary">
                <button type="submit" className="bank-button bank-button--primary" disabled={controlsLocked}>
                  Save Schedule
                </button>
                <button
                  type="button"
                  className="bank-button bank-button--ghost"
                  onClick={disableSchedule}
                  disabled={controlsLocked}
                >
                  Disable Schedule
                </button>
              </div>
            </form>

            <p className="bank-schedule-summary">
              Active config: {schedule.onTime} / {schedule.offTime} | Updated: {formatDateTime(schedule.updatedAt)}
            </p>
          </article>
        </div>

        <p className={`bank-message ${message ? "is-visible" : ""}`} aria-live="polite">
          {message || "Awaiting operator input."}
        </p>
      </section>
    </main>
  );
}
