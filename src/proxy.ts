import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_TOKEN_PATTERN } from "@/lib/auth-config";
import { safeRedirectPath } from "@/lib/auth-routing";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  // This is only a fast redirect; pages and server actions verify the database session.
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token && SESSION_TOKEN_PATTERN.test(token)) return NextResponse.next();

  const login = new URL("/login", request.url);
  const next = safeRedirectPath(`${pathname}${search}`);
  if (next !== "/") login.searchParams.set("next", next);
  const response = NextResponse.redirect(login, request.method === "GET" || request.method === "HEAD" ? 307 : 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next/static|_next/image|favicon\\.ico$|icon\\.png$).*)"],
};
