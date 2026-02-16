import { NextResponse } from "next/server";
import {
  createSessionToken,
  hasApiKeyConfigured,
  isValidApiKey,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "@/lib/auth";

export const runtime = "nodejs";

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ ok: false, message }, { status: 401 });
}

export async function POST(req) {
  if (!hasApiKeyConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Server missing FAN_API_KEY" },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const key = String(body.key || "").trim();
  if (!isValidApiKey(key)) {
    return unauthorized("Bad key");
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: createSessionToken(),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return response;
}
