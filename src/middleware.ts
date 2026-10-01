import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "clinic_session";
const PUBLIC_PATHS = ["/login", "/password-change"];
const PUBLIC_ASSETS = ["/manifest.webmanifest", "/sw.js", "/loreen-logo.svg"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (PUBLIC_ASSETS.includes(pathname)) return NextResponse.next();
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname === "/";
  if (isPublic) return NextResponse.next();

  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  let valid = false;
  try {
    const secret = process.env.SESSION_SECRET;
    if (secret && secret.length >= 32) {
      await jwtVerify(token, new TextEncoder().encode(secret));
      valid = true;
    }
  } catch {
    valid = false;
  }

  if (!valid) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const res = NextResponse.redirect(url);
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/files|public).*)"],
};
