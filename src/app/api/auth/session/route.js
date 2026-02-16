import { NextResponse } from "next/server";
import { hasValidSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req) {
  return NextResponse.json({
    ok: true,
    authenticated: hasValidSessionCookie(req),
  });
}
