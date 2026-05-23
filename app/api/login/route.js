import { NextResponse } from "next/server.js";
import {
  createDemoAccessToken,
  DEMO_AUTH_COOKIE,
  LOGIN_PATH,
  normalizeReturnTo,
} from "../../../lib/auth.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const password = process.env.DEMO_ACCESS_PASSWORD;
  if (!password) {
    const url = new URL(`${LOGIN_PATH}?error=missing_password`, request.url);
    return NextResponse.redirect(url);
  }

  const formData = await request.formData();
  const submittedPassword = String(formData.get("password") ?? "");
  const returnTo = normalizeReturnTo(String(formData.get("return_to") ?? "/"));

  if (submittedPassword !== password) {
    const url = new URL(LOGIN_PATH, request.url);
    url.searchParams.set("error", "invalid_password");
    url.searchParams.set("from", returnTo);
    return NextResponse.redirect(url);
  }

  const token = await createDemoAccessToken(password);
  const response = NextResponse.redirect(new URL(returnTo, request.url));
  response.cookies.set({
    name: DEMO_AUTH_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
