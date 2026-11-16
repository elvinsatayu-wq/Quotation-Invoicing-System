import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: no cookie means not signed in. The real session check is
// requireUser() in lib/auth.ts, which every page and server action goes through.
export function proxy(request: NextRequest) {
  if (request.cookies.has("qi_session")) return NextResponse.next();
  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
