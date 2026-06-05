import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "admin_session";
const PROTECTED_PREFIXES = ["/admin", "/api/admin"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The login route itself and the listener UI are public. Everything
  // else under /admin and /api/admin requires a valid signed cookie.
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return NextResponse.next();
  }
  // The login API accepts credentials and mints the cookie; no check.
  if (pathname === "/api/admin/login") {
    return NextResponse.next();
  }
  // /api/admin/logout (if added later) would also be public.

  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (!needsAuth) return NextResponse.next();

  const hasCookie = !!req.cookies.get(COOKIE_NAME)?.value;
  if (!hasCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // The cookie's *presence* is the gate at the middleware layer. The
  // server-side route handlers do a full HMAC verify in readAdminCookie
  // before doing any work — this middleware exists primarily to keep
  // the unauthenticated request off the route handler at all.
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
