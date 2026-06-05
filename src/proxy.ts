import { NextRequest, NextResponse } from "next/server";
import { verify } from "@/lib/admin-cookie";

// Cookie name matches ADMIN_COOKIE_NAME in src/lib/admin-auth.ts. Both
// sides read ADMIN_PASSWORD as the HMAC secret.
const COOKIE_NAME = "admin_session";

// Path prefixes that require an authenticated admin session. /api/live
// was previously NOT in this matcher, which meant any internet caller
// could POST /api/live/start, /api/live/stop, or hit the dev test-*
// endpoints. It is now gated. Public sub-paths under /api/live are
// listed in PUBLIC_LIVE_PATHS below.
const PROTECTED_PREFIXES = ["/admin", "/api/admin", "/api/live"];

// Endpoints that intentionally stay public even though their prefix is
// in PROTECTED_PREFIXES. Keep this list small and audited — anything
// added here is callable by anyone on the internet.
const PUBLIC_LIVE_PATHS = new Set<string>([
  "/api/live/status",            // GET — returns { running: bool }, info only
  "/api/live/playback-complete", // POST — fired by the public listener page
                                  //         when audio finishes playing
]);

function getSecret(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 8) return null;
  return pw;
}

function isAuthed(req: NextRequest): boolean {
  const secret = getSecret();
  // Fail closed: if the server is misconfigured (no password) refuse
  // every admin request rather than letting anyone in.
  if (!secret) return false;
  const value = req.cookies.get(COOKIE_NAME)?.value;
  if (!value) return false;
  // Real HMAC verify, not just a presence check. Forging a non-empty
  // cookie is no longer sufficient — the signature has to match the
  // secret that the login route signs with.
  return verify(value, secret) !== null;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The login route itself (UI + API) must always be reachable.
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return NextResponse.next();
  }
  if (pathname === "/api/admin/login" || pathname.startsWith("/api/admin/login/")) {
    return NextResponse.next();
  }

  if (PUBLIC_LIVE_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (!needsAuth) return NextResponse.next();

  if (!isAuthed(req)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/live/:path*"],
};
