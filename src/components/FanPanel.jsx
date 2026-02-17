"use client";

import { useEffect, useState } from "react";
import mqtt from "mqtt";

const MQTT_STATUS_TOPIC = String(process.env.NEXT_PUBLIC_MQTT_STATUS_TOPIC || "fan/status").trim();
const MQTT_LWT_TOPIC = String(process.env.NEXT_PUBLIC_MQTT_LWT_TOPIC || "fan/lwt").trim();

function normalizeLabel(value, fallback = "UNKNOWN") {
  const text = String(value || "").trim();
  return text ? text.toUpperCase() : fallback;
}

export default function FanPanel() {
  const [fanStatus, setFanStatus] = useState("UNKNOWN");
  const [deviceStatus, setDeviceStatus] = useState("UNKNOWN");
  const [brokerState, setBrokerState] = useState("CONNECTING");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const url = String(process.env.NEXT_PUBLIC_MQTT_URL || "").trim();
    const username = String(process.env.NEXT_PUBLIC_MQTT_USER || "").trim();
    const password = String(process.env.NEXT_PUBLIC_MQTT_PASS || "").trim();

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
  }, []);

  async function sendCommand(cmd) {
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

  return (
    <section style={{ display: "grid", gap: 12, maxWidth: 440 }}>
      <h1 style={{ margin: 0 }}>Fan MQTT Panel</h1>
      <div>
        Broker: <b>{brokerState}</b>
      </div>
      <div>
        Device (LWT): <b>{deviceStatus}</b>
      </div>
      <div>
        Fan Status: <b>{fanStatus}</b>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => sendCommand("ON")} disabled={working}>
          ON
        </button>
        <button type="button" onClick={() => sendCommand("OFF")} disabled={working}>
          OFF
        </button>
        <button type="button" onClick={() => sendCommand("TOGGLE")} disabled={working}>
          TOGGLE
        </button>
      </div>

      <p style={{ minHeight: 20, margin: 0 }} aria-live="polite">
        {message}
      </p>
    </section>
  );
}
