import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;

function getSecret(): string | null {
  // Same key the login route uses to mint the cookie. The login route
  // fails closed if ADMIN_PASSWORD is unset/short, so the secret is
  // always present whenever anyone has managed to log in.
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 8) return null;
  return pw;
}

function sign(value: string, secret: string): string {
  const mac = crypto.createHmac("sha256", secret).update(value).digest("hex");
  return `${value}.${mac}`;
}

function verify(signed: string, secret: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = crypto.createHmac("sha256", secret).update(value).digest("hex");
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex"))) {
    return null;
  }
  return value;
}

export function mintAdminCookie(): string {
  const secret = getSecret();
  if (!secret) throw new Error("ADMIN_PASSWORD is not configured");
  // Random session id; the HMAC over it is what prevents forgery.
  const sid = crypto.randomBytes(24).toString("hex");
  return sign(sid, secret);
}

export async function readAdminCookie(): Promise<string | null> {
  const c = (await cookies()).get(COOKIE_NAME)?.value;
  if (!c) return null;
  const secret = getSecret();
  if (!secret) return null;
  return verify(c, secret);
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
export const ADMIN_COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS;
