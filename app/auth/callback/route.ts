// Landing page of the links in Supabase emails (confirm email, reset password):
// exchanges the one-time code for a session, then goes to `next`.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Same-site paths only, so the link cannot send anyone to another website. */
function safeNext(next: string | null) {
  return next && /^\/(?![/\\])/.test(next) ? next : "/";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  const failed = next === "/reset-password" ? "/forgot-password?expired=1" : "/login?confirm=failed";
  return NextResponse.redirect(new URL(failed, request.url));
}
