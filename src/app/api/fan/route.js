import mqtt from "mqtt";

export const runtime = "nodejs";

const MQTT_CONTROL_TOPIC = String(process.env.MQTT_CONTROL_TOPIC || "fan/control").trim();
const COMMANDS = new Set(["ON", "OFF", "TOGGLE"]);
const CONNECT_TIMEOUT_MS = 10000;
const OPERATION_TIMEOUT_MS = 12000;

function readConfig() {
  return {
    url: String(process.env.MQTT_URL || "").trim(),
    username: String(process.env.MQTT_USER || "").trim(),
    password: String(process.env.MQTT_PASS || "").trim(),
  };
}

function missingEnvResponse() {
  return Response.json(
    {
      ok: false,
      message: "Server missing MQTT_URL, MQTT_USER, or MQTT_PASS",
    },
    { status: 500 },
  );
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const command = String(body.cmd || "").trim().toUpperCase();

  if (!COMMANDS.has(command)) {
    return Response.json(
      {
        ok: false,
        message: "Invalid cmd. Use ON, OFF, or TOGGLE.",
      },
      { status: 400 },
    );
  }

  const { url, username, password } = readConfig();
  if (!url || !username || !password) {
    return missingEnvResponse();
  }

  return new Promise((resolve) => {
    const client = mqtt.connect(url, {
      username,
      password,
      reconnectPeriod: 0,
      connectTimeout: CONNECT_TIMEOUT_MS,
      clean: true,
    });

    let settled = false;

    const finalize = (status, payload, forceClose = false) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(opTimer);
      client.end(forceClose);
      resolve(Response.json(payload, { status }));
    };

    const opTimer = setTimeout(() => {
      finalize(504, { ok: false, message: "MQTT publish timeout" }, true);
    }, OPERATION_TIMEOUT_MS);

    client.on("connect", () => {
      client.publish(MQTT_CONTROL_TOPIC, command, { qos: 1 }, (error) => {
        if (error) {
          finalize(502, { ok: false, message: `Publish failed: ${error.message}` }, true);
          return;
        }

        finalize(200, {
          ok: true,
          cmd: command,
          topic: MQTT_CONTROL_TOPIC,
        });
      });
    });

    client.on("error", (error) => {
      finalize(502, {
        ok: false,
        message: `MQTT connection error: ${error.message || String(error)}`,
      }, true);
    });
  });
}

export async function GET() {
  const { url, username, password } = readConfig();
  if (!url || !username || !password) {
    return missingEnvResponse();
  }

  return Response.json({
    ok: true,
    controlTopic: MQTT_CONTROL_TOPIC,
  });
}
