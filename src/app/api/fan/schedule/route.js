import { hasApiKeyConfigured, isAuthenticatedRequest } from "@/lib/auth";
import {
  applySchedule,
  clearScheduleConfig,
  ensureSchedulerStarted,
  getFanState,
  getScheduleConfig,
  setScheduleConfig,
} from "@/lib/fan-control";

export const runtime = "nodejs";

function unauthorized(msg = "Unauthorized") {
  return Response.json({ ok: false, message: msg }, { status: 401 });
}

function badRequest(msg) {
  return Response.json({ ok: false, message: msg }, { status: 400 });
}

function createPayload() {
  return {
    ok: true,
    schedule: getScheduleConfig(),
    state: getFanState(),
  };
}

export async function GET(req) {
  if (!hasApiKeyConfigured()) return unauthorized("Server missing FAN_API_KEY");
  if (!isAuthenticatedRequest(req)) return unauthorized("Please login first");

  ensureSchedulerStarted();
  applySchedule();
  return Response.json(createPayload());
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!hasApiKeyConfigured()) return unauthorized("Server missing FAN_API_KEY");
  if (!isAuthenticatedRequest(req, body.key || "")) return unauthorized("Please login first");

  try {
    ensureSchedulerStarted();
    setScheduleConfig({
      onTime: body.onTime,
      offTime: body.offTime,
      enabled: body.enabled !== false,
    });
    applySchedule();

    return Response.json(createPayload());
  } catch (error) {
    return badRequest(error.message || "Invalid schedule payload.");
  }
}

export async function DELETE(req) {
  if (!hasApiKeyConfigured()) return unauthorized("Server missing FAN_API_KEY");
  if (!isAuthenticatedRequest(req)) return unauthorized("Please login first");

  ensureSchedulerStarted();
  clearScheduleConfig();
  return Response.json(createPayload());
}
