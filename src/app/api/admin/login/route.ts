import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { ADMIN_COOKIE_MAX_AGE, ADMIN_COOKIE_NAME, mintAdminCookie } from "@/lib/admin-auth";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_PASSWORD_MIN_LENGTH = 8;

function misconfigured() {
  return NextResponse.json(
    { error: "Admin login is not configured on this server." },
    { status: 503 },
  );
}

function passwordsEqual(a: string, b: string): boolean {
  // timingSafeEqual requires equal-length inputs, so guard first.
  // Comparing against a fixed-length server secret means we leak the
  // length of the attacker-supplied password, which is acceptable
  // for a single-account admin endpoint.
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return misconfigured();
  }
  const { password } = await req.json();
  if (typeof password !== "string" || !passwordsEqual(password, ADMIN_PASSWORD)) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }
  // Issue a signed session id (HMAC of a random nonce, keyed by the
  // admin password). The value is opaque to the client; the server
  // verifies the HMAC on every admin request via the proxy.
  const cookieValue = mintAdminCookie();
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
  return NextResponse.json({ success: true });
}