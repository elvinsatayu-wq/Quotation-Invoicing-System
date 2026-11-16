import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "./lib/supabase/config";

const PUBLIC_PATHS = ["/login", "/register", "/auth/"];

/**
 * Keeps the Supabase session fresh (refreshes the auth cookies) and sends signed-out
 * visitors to the login page. This is only an optimistic check: every page and server
 * action checks the user again (lib/auth.ts), and the database enforces the roles.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseConfig();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([header, value]) => response.headers.set(header, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  if (!data?.claims && !PUBLIC_PATHS.some((p) => path === p || path.startsWith(p))) {
    const login = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((cookie) => login.cookies.set(cookie));
    return login;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
