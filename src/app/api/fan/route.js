import { hasApiKeyConfigured, isAuthenticatedRequest } from "@/lib/auth";
import { applySchedule, ensureSchedulerStarted, getFanState, setFanState } from "@/lib/fan-control";

export const runtime = "nodejs";
const BACKEND_BASE_URL = String(process.env.FAN_BACKEND_URL || "http://localhost:4000")
  .trim()
  .replace(/\/+$/, "");

function unauthorized(msg = "Unauthorized") {
  return Response.json({ ok: false, message: msg }, { status: 401 });
}

function badGateway(msg = "Unable to reach fan backend") {
  return Response.json({ ok: false, message: msg }, { status: 502 });
}

function normalizeBackendState(payload) {
  const value = String(payload?.relay || payload?.status || "").trim().toLowerCase();
  if (value === "on" || value === "off") {
    return value;
  }

  const rawText = String(payload?.raw || "").trim().toLowerCase();
  if (rawText.includes("relay=on")) {
    return "on";
  }

  if (rawText.includes("relay=off")) {
    return "off";
  }

  return "";
}

async function pushFanStateToBackend(state) {
  const endpoint = state === "on" ? "on" : "off";
  const response = await fetch(`${BACKEND_BASE_URL}/api/fan/${endpoint}`, {
    method: "POST",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Fan backend error (${response.status})`);
  }

  const normalizedStatus = normalizeBackendState(payload);
  if (normalizedStatus === "on" || normalizedStatus === "off") {
    return normalizedStatus;
  }

  return endpoint;
}

async function fetchFanStateFromBackend() {
  const response = await fetch(`${BACKEND_BASE_URL}/api/fan/status`, {
    method: "GET",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Fan backend error (${response.status})`);
  }

  const normalizedStatus = normalizeBackendState(payload);
  if (normalizedStatus === "on" || normalizedStatus === "off") {
    return normalizedStatus;
  }

  throw new Error("Fan backend returned unknown status payload");
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!hasApiKeyConfigured()) return unauthorized("Server missing FAN_API_KEY");

  if (!isAuthenticatedRequest(req, body.key || "")) {
    return unauthorized("Please login first");
  }

  ensureSchedulerStarted();
  applySchedule();

  try {
    const requestedState = body.state === "on" ? "on" : "off";
    const backendState = await pushFanStateToBackend(requestedState);
    return Response.json({ ok: true, state: setFanState(backendState, "manual") });
  } catch (error) {
    return badGateway(error instanceof Error ? error.message : "Unable to reach fan backend");
  }
}

export async function GET(req) {
  if (!hasApiKeyConfigured()) return unauthorized("Server missing FAN_API_KEY");
  if (!isAuthenticatedRequest(req)) return unauthorized("Please login first");

  ensureSchedulerStarted();
  applySchedule();

  try {
    const backendState = await fetchFanStateFromBackend();
    return Response.json({ ok: true, state: setFanState(backendState, "backend:status") });
  } catch (error) {
    return badGateway(error instanceof Error ? error.message : "Unable to reach fan backend");
  }
}
