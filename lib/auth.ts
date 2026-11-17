// Supabase Auth plus the account's company and role in public.profiles.
//   * Company members (admin | user) work with their own company's data only.
//   * The super admin manages accounts only and has no company (sees no business data).
//   * Everyone else is pending.
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type Role = "admin" | "user" | "pending";

export type User = {
  id: string;
  email: string;
  name: string;
  /** Role in their company; "pending" when the account has no company. */
  role: Role;
  companyId: string | null;
  superAdmin: boolean;
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "ผู้ดูแลบริษัท (Admin)",
  user: "ผู้ใช้งาน (User)",
  pending: "รออนุมัติ",
};

export const SUPER_ADMIN_LABEL = "ผู้ดูแลระบบ (จัดการผู้ใช้)";

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
    .select("email, full_name, role, company_id, is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  const email = profile?.email ?? String(data.claims.email ?? "");
  const companyId = (profile?.company_id as string | null | undefined) ?? null;
  const superAdmin = profile?.is_super_admin === true;
  return {
    id: userId,
    email,
    name: profile?.full_name || email,
    role: companyId ? ((profile?.role as Role | undefined) ?? "pending") : "pending",
    companyId,
    superAdmin,
  };
});

/** Where an account goes when it cannot use the company pages. */
function homeOf(user: User) {
  return user.superAdmin ? "/users" : "/pending";
}

/** A member of a company (admin or user). The super admin goes to the users page, others wait. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.companyId || user.role === "pending") redirect(homeOf(user));
  return user;
}

/** Admin of their company. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

/** The super admin, who manages accounts and companies (never business data). */
export async function requireSuperAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.superAdmin) redirect(user.companyId && user.role !== "pending" ? "/" : "/pending");
  return user;
}
