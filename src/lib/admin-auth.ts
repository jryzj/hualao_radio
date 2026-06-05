import { cookies } from "next/headers";
import crypto from "crypto";
import { sign, verify } from "@/lib/admin-cookie";

const COOKIE_NAME = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;

function getSecret(): string | null {
  // Same key the login route uses to mint the cookie. The login route
  // fails closed if ADMIN_PASSWORD is unset/short, so the secret is
  // always present whenever anyone has managed to log in.
  //
  // Known design coupling (security review 2026-06-06, finding M2):
  // the admin's plaintext password is also the HMAC secret. A short
  // or guessable password weakens forgery resistance. The proper fix
  // is a separate ADMIN_SESSION_SECRET env var (32+ bytes, generated
  // at deploy time). Not done here because it would invalidate all
  // existing sessions on first deploy of this change — schedule it
  // for a maintenance window.
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 8) return null;
  return pw;
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
