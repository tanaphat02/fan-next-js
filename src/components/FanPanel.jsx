"use client";

import { useEffect, useState } from "react";
import mqtt from "mqtt";

const MQTT_STATUS_TOPIC = String(process.env.NEXT_PUBLIC_MQTT_STATUS_TOPIC || "fan/status").trim();
const MQTT_LWT_TOPIC = String(process.env.NEXT_PUBLIC_MQTT_LWT_TOPIC || "fan/lwt").trim();
const HEALTHY_BROKER_STATES = new Set(["CONNECTED"]);

function normalizeLabel(value, fallback = "UNKNOWN") {
  const text = String(value || "").trim();
  return text ? text.toUpperCase() : fallback;
}

function toFanStateClass(value) {
  if (value === "ON") return "is-on";
  if (value === "OFF") return "is-off";
  return "is-unknown";
}

function toChipClass(value, kind) {
  if (kind === "broker") {
    if (HEALTHY_BROKER_STATES.has(value)) return "is-good";
    if (value === "CONNECTING" || value === "RECONNECTING") return "is-warn";
    return "is-bad";
  }

  if (kind === "device") {
    if (value === "ONLINE" || value === "ON") return "is-good";
    if (value === "OFFLINE" || value === "OFF") return "is-bad";
    return "is-idle";
  }

  return "is-idle";
}

export default function FanPanel() {
  const [fanStatus, setFanStatus] = useState("UNKNOWN");
  const [deviceStatus, setDeviceStatus] = useState("UNKNOWN");
  const [brokerState, setBrokerState] = useState("LOCKED");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authKey, setAuthKey] = useState("");
  const [authWorking, setAuthWorking] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!mounted) return;
        setAuthenticated(Boolean(data.authenticated));
      } catch {
        if (!mounted) return;
        setAuthenticated(false);
      } finally {
        if (mounted) {
          setSessionReady(true);
        }
      }
    }

    checkSession();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    const url = String(process.env.NEXT_PUBLIC_MQTT_URL || "").trim();
    const username = String(process.env.NEXT_PUBLIC_MQTT_USER || "").trim();
    const password = String(process.env.NEXT_PUBLIC_MQTT_PASS || "").trim();

    setBrokerState("CONNECTING");

    if (!url || !username || !password) {
      setBrokerState("CONFIG ERROR");
      setMessage("Missing NEXT_PUBLIC_MQTT_URL, NEXT_PUBLIC_MQTT_USER, or NEXT_PUBLIC_MQTT_PASS.");
      return;
    }

    const client = mqtt.connect(url, {
      username,
      password,
      reconnectPeriod: 1000,
      connectTimeout: 10000,
      clean: true,
    });

    client.on("connect", () => {
      setBrokerState("CONNECTED");
      setMessage("");
      client.subscribe([MQTT_STATUS_TOPIC, MQTT_LWT_TOPIC], (error) => {
        if (error) {
          setMessage(`Subscribe failed: ${error.message}`);
        }
      });
    });

    client.on("reconnect", () => {
      setBrokerState("RECONNECTING");
    });

    client.on("offline", () => {
      setBrokerState("OFFLINE");
    });

    client.on("error", (error) => {
      setBrokerState("ERROR");
      setMessage(`MQTT error: ${error.message || String(error)}`);
    });

    client.on("message", (topic, payload) => {
      const data = normalizeLabel(payload?.toString());
      if (topic === MQTT_STATUS_TOPIC) {
        setFanStatus(data);
      }
      if (topic === MQTT_LWT_TOPIC) {
        setDeviceStatus(data);
      }
    });

    return () => {
      client.end(true);
    };
  }, [authenticated]);

  async function handleLogin(event) {
    event.preventDefault();
    const trimmedKey = authKey.trim();
    if (!trimmedKey) {
      setAuthMessage("Please enter API key.");
      return;
    }

    setAuthWorking(true);
    setAuthMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: trimmedKey }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Login failed.");
      }

      setAuthenticated(true);
      setAuthKey("");
      setAuthMessage("");
      setBrokerState("CONNECTING");
      setMessage("");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setAuthWorking(false);
    }
  }

  async function handleLogout() {
    setAuthWorking(true);
    setAuthMessage("");

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setAuthenticated(false);
      setFanStatus("UNKNOWN");
      setDeviceStatus("UNKNOWN");
      setBrokerState("LOCKED");
      setWorking(false);
      setMessage("");
      setAuthWorking(false);
      setAuthMessage("Logged out.");
    }
  }

  async function sendCommand(cmd) {
    if (!authenticated) {
      setMessage("Please login first.");
      return;
    }

    setWorking(true);
    setMessage("");

    try {
      const response = await fetch("/api/fan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || data.error || "Command failed.");
      }

      setMessage(`Command ${data.cmd || cmd} published.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Command failed.");
    } finally {
      setWorking(false);
    }
  }

  if (!sessionReady) {
    return (
      <section className="bank-grid">
        <article className="bank-panel bank-panel--auth">
          <p className="bank-panel-kicker">Session</p>
          <h2>Checking session...</h2>
          <p className="bank-panel-copy">Please wait.</p>
        </article>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className="bank-grid">
        <article className="bank-panel bank-panel--auth">
          <p className="bank-panel-kicker">Authentication</p>
          <h2>Login Required</h2>
          <p className="bank-panel-copy">Enter FAN API key to unlock the fan control panel.</p>

          <form className="bank-form" onSubmit={handleLogin}>
            <label htmlFor="fan-api-key">API Key</label>
            <input
              id="fan-api-key"
              type="password"
              autoComplete="current-password"
              placeholder="Enter FAN_API_KEY"
              value={authKey}
              onChange={(event) => setAuthKey(event.target.value)}
              required
            />
            <button type="submit" className="bank-button bank-button--primary" disabled={authWorking || !authKey.trim()}>
              {authWorking ? "Signing in..." : "Login"}
            </button>
          </form>

          <p className={`bank-message ${authMessage ? "is-visible" : ""}`} aria-live="polite" role="status">
            {authMessage || "Session is required before sending commands."}
          </p>
        </article>
      </section>
    );
  }

  const fanStateClass = toFanStateClass(fanStatus);
  const brokerClass = toChipClass(brokerState, "broker");
  const deviceClass = toChipClass(deviceStatus, "device");

  return (
    <section className="bank-grid">
      <article className="bank-panel">
        <p className="bank-panel-kicker">Live Telemetry</p>
        <div className="bank-status-head">
          <div>
            <h2>Fan Overview</h2>
            <p className="bank-panel-copy bank-panel-copy--tight">
              Real-time MQTT broker status with current device heartbeat.
            </p>
          </div>
          <span className={`bank-state-pill ${fanStateClass}`}>{fanStatus}</span>
        </div>

        <div className="bank-status-grid">
          <div className="bank-stat-item">
            <span className="bank-stat-label">Broker</span>
            <span className={`bank-chip ${brokerClass}`}>{brokerState}</span>
          </div>
          <div className="bank-stat-item">
            <span className="bank-stat-label">Device (LWT)</span>
            <span className={`bank-chip ${deviceClass}`}>{deviceStatus}</span>
          </div>
        </div>

        <p className="bank-panel-copy bank-panel-copy--summary bank-topic-line">
          Topics: <code>{MQTT_STATUS_TOPIC}</code> / <code>{MQTT_LWT_TOPIC}</code>
        </p>
      </article>

      <article className="bank-panel">
        <div className="bank-panel-head">
          <div>
            <p className="bank-panel-kicker">Quick Control</p>
            <h2>Command Center</h2>
          </div>
          <button type="button" className="bank-button bank-button--ghost bank-button--compact" onClick={handleLogout} disabled={authWorking}>
            {authWorking ? "Signing out..." : "Logout"}
          </button>
        </div>

        <p className="bank-panel-copy">
          Large touch targets for quick actions, including small screens like iPhone SE2.
        </p>

        <div className="bank-actions bank-actions--triple">
          <button
            type="button"
            className="bank-button bank-button--on"
            onClick={() => sendCommand("ON")}
            disabled={working || authWorking}
          >
            Turn ON
          </button>
          <button
            type="button"
            className="bank-button bank-button--off"
            onClick={() => sendCommand("OFF")}
            disabled={working || authWorking}
          >
            Turn OFF
          </button>
          <button
            type="button"
            className="bank-button bank-button--primary"
            onClick={() => sendCommand("TOGGLE")}
            disabled={working || authWorking}
          >
            Toggle
          </button>
        </div>

        <p className={`bank-message ${message ? "is-visible" : ""}`} aria-live="polite" role="status">
          {message || (working ? "Sending command..." : "Ready")}
        </p>
      </article>
    </section>
  );
}
