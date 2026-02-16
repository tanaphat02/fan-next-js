import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "fan_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

function readApiKey() {
  return String(process.env.FAN_API_KEY || "").trim();
}

function readSessionSecret() {
  return String(process.env.FAN_SESSION_SECRET || process.env.FAN_API_KEY || "").trim();
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload) {
  const secret = readSessionSecret();
  if (!secret) {
    return "";
  }

  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function hasApiKeyConfigured() {
  return readApiKey().length > 0;
}

export function isValidApiKey(input) {
  const apiKey = readApiKey();
  const value = String(input || "").trim();

  return apiKey.length > 0 && value.length > 0 && safeEqual(apiKey, value);
}

export function createSessionToken(now = Date.now()) {
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;
  const nonce = crypto.randomBytes(12).toString("base64url");
  const payload = `${expiresAt}.${nonce}`;
  const signature = sign(payload);

  return `${payload}.${signature}`;
}

export function hasValidSessionCookie(req, now = Date.now()) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value || "";
  if (!token) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [expiresAtRaw, nonce, signature] = parts;
  if (!expiresAtRaw || !nonce || !signature) {
    return false;
  }

  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return false;
  }

  const expectedSignature = sign(`${expiresAtRaw}.${nonce}`);
  if (!expectedSignature) {
    return false;
  }

  return safeEqual(signature, expectedSignature);
}

export function isAuthenticatedRequest(req, bodyKey = "") {
  if (hasValidSessionCookie(req)) {
    return true;
  }

  const headerKey = req.headers.get("x-api-key") || "";
  if (isValidApiKey(headerKey)) {
    return true;
  }

  return isValidApiKey(bodyKey);
}
