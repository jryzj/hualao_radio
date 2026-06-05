import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_PASSWORD_MIN_LENGTH = 8;

function misconfigured() {
  return NextResponse.json(
    { error: "Admin login is not configured on this server." },
    { status: 503 },
  );
}

export async function POST(req: NextRequest) {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return misconfigured();
  }
  const { password } = await req.json();
  if (password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }
  const cookieStore = await cookies();
  cookieStore.set("admin_session", "1", { httpOnly: false, sameSite: "lax", maxAge: 60 * 60 * 24 });
  return NextResponse.json({ success: true });
}