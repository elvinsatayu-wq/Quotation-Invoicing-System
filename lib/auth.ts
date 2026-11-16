// Supabase Auth plus the role in public.profiles (admin | user | pending).
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type Role = "admin" | "user" | "pending";

export type User = { id: string; email: string; name: string; role: Role };

export const ROLE_LABEL: Record<Role, string> = {
  admin: "ผู้ดูแลระบบ (Admin)",
  user: "ผู้ใช้งาน (User)",
  pending: "รออนุมัติ",
};

/** The signed-in user, or null. Reads the request cookies, so call it under <Suspense>. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  await connection();
  const supabase = await createClient();
  // getClaims verifies the session token, unlike getSession which trusts the cookie.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  const email = profile?.email ?? String(data.claims.email ?? "");
  return {
    id: userId,
    email,
    name: profile?.full_name || email,
    role: (profile?.role as Role | undefined) ?? "pending",
  };
});

/** An approved user (admin or user). Others go to the login or waiting page. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "pending") redirect("/pending");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
