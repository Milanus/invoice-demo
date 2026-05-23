import { NextResponse } from "next/server";
import {
  createDemoAccessToken,
  DEMO_AUTH_COOKIE,
  LOGIN_PATH,
  normalizeReturnTo,
} from "./lib/auth.js";

function isPublicPath(pathname) {
  return (
    pathname === LOGIN_PATH ||
    pathname === "/api/login" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  );
}

export async function middleware(request) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const password = process.env.DEMO_ACCESS_PASSWORD;
  if (!password) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Chybí serverová proměnná DEMO_ACCESS_PASSWORD." },
        { status: 500 },
      );
    }

    const url = new URL(LOGIN_PATH, request.url);
    url.searchParams.set("error", "missing_password");
    return NextResponse.redirect(url);
  }

  const expectedToken = await createDemoAccessToken(password);
  const actualToken = request.cookies.get(DEMO_AUTH_COOKIE)?.value;
  if (actualToken === expectedToken) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Nepřihlášený přístup. Nejprve se přihlas do demo aplikace." },
      { status: 401 },
    );
  }

  const url = new URL(LOGIN_PATH, request.url);
  url.searchParams.set("from", normalizeReturnTo(`${pathname}${search}`));
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
