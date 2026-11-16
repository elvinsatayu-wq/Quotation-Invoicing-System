"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { ActionState } from "./types";

function authMessage(message: string) {
  if (/invalid login credentials/i.test(message)) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  if (/email not confirmed/i.test(message)) return "กรุณายืนยันอีเมลจากลิงก์ที่ส่งไปก่อนเข้าสู่ระบบ";
  if (/already registered|already been registered/i.test(message)) return "อีเมลนี้สมัครไว้แล้ว";
  if (/password should be at least/i.test(message)) return "รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร";
  if (/signups? not allowed|signup is disabled/i.test(message)) return "ระบบปิดการสมัครสมาชิก กรุณาติดต่อผู้ดูแลระบบ";
  if (/rate limit/i.test(message)) return "ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
  return `เข้าสู่ระบบไม่สำเร็จ: ${message}`;
}

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: String(form.get("password") ?? ""),
  });
  if (error) return { error: authMessage(error.message), values: { email } };
  redirect("/");
}

export async function register(_prev: ActionState, form: FormData): Promise<ActionState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const values = { name, email };
  if (!name) return { error: "กรุณากรอกชื่อ", values };
  if (password.length < 6) return { error: "รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร", values };
  if (password !== String(form.get("confirm") ?? "")) return { error: "รหัสผ่านทั้งสองช่องไม่ตรงกัน", values };

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name }, emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: authMessage(error.message), values };
  // With "Confirm email" on, there is no session until the link in the email is opened.
  if (!data.session) return { error: null, saved: true, values };
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
