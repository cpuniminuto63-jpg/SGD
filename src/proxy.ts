import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = ["/login", "/recuperar-acceso", "/api/auth"];

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

  const response = NextResponse.next();
  // Todo lo que pasa por aquí es contenido autenticado (o la página de login, que
  // igual no debe quedar cacheada con datos de sesión de otra persona detrás de un
  // proxy/CDN) — nunca debe guardarse en caché compartida.
  if (!isPublicPath || req.nextUrl.pathname === "/login") {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
