import { NextResponse } from "next/server";

const AUTH_PATHS = new Set(["/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/auth/change-password", "/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"]);

export function middleware(request: Request) {
  const url = new URL(request.url);
  if (AUTH_PATHS.has(url.pathname)) return NextResponse.next();
  // Sites injects the authenticated ChatGPT identity into every request. The
  // guard protects both page loads and API mutations when a request bypasses
  // the UI, while keeping the delegated sign-in endpoints reachable.
  if (!request.headers.get("oai-authenticated-user-id") || !request.headers.get("oai-authenticated-user-email")) {
    if (url.pathname.startsWith("/api/")) return Response.json({ error: { code: "UNAUTHORIZED", message: "Требуется вход администратора" } }, { status: 401 });
    return NextResponse.redirect(new URL(`/signin-with-chatgpt?return_to=${encodeURIComponent(`${url.pathname}${url.search}`)}`, request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/:section*", "/api/:path*"] };
