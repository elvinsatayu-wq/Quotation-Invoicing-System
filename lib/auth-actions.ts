"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "./auth";
import { db } from "./server/db";
import { checkCredentials, createSession, deleteSession } from "./server/users";
import type { ActionState } from "./types";

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "");
  const user = checkCredentials(db(), email, String(form.get("password") ?? ""));
  if (!user) return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง", values: { email } };

  const { token, expires } = createSession(db(), user.id);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    expires,
  });
  redirect("/");
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(db(), token);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
