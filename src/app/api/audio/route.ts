// This route previously served a hardcoded developer path
// (C:/Users/jryzj/...) that leaked the developer's username and
// 404'd on any other machine. It served no production purpose and
// has been removed.
//
// Any client still hitting /api/audio will receive a 410 Gone so
// the failure is unambiguous. If a real audio-serve endpoint is
// needed in the future, it should be reimplemented with a
// configured audio directory and proper auth.
import { NextResponse } from "next/server";

export const GET = () =>
  NextResponse.json({ error: "removed" }, { status: 410 });
