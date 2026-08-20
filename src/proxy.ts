import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = ["/login", "/recuperar-acceso", "/api/auth", "/api/diagnostico"];

export const proxy = auth((req) => {
  const isPublicPath = PUBLIC_PATHS.some((path) => req.nextUrl.pathname.startsWith(path));
  const isLoggedIn = !!req.auth?.user;

  if (!isLoggedIn && !isPublicPath) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && req.nextUrl.pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
