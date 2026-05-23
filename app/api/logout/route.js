import { NextResponse } from "next/server.js";
import { DEMO_AUTH_COOKIE, LOGIN_PATH } from "../../../lib/auth.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const response = NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  response.cookies.set({
    name: DEMO_AUTH_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
