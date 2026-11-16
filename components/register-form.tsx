"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ErrorNote } from "@/components/ui";
import { register } from "@/lib/auth-actions";
import type { ActionState } from "@/lib/types";

export function RegisterForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(register, { error: null });

  if (state.saved) {
    return (
      <div role="status" className="rounded-xl border border-accent/15 bg-accent-soft px-4 py-4 text-sm text-accent">
        <p className="font-medium">สมัครสำเร็จ กรุณายืนยันอีเมล</p>
        <p className="mt-1 text-accent/80">
          ระบบส่งลิงก์ยืนยันไปที่ {state.values?.email} แล้ว เปิดลิงก์นั้นก่อน แล้วจึง
          <Link href="/login" className="font-medium underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <ErrorNote message={state.error} />
      <label className="grid gap-1">
        <span className="field-label">ชื่อ-นามสกุล</span>
        <input name="name" required autoComplete="name" defaultValue={state.values?.name} className="input" />
      </label>
      <label className="grid gap-1">
        <span className="field-label">อีเมล</span>
        <input name="email" type="email" required autoComplete="username" defaultValue={state.values?.email} className="input" />
      </label>
      <label className="grid gap-1">
        <span className="field-label">รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)</span>
        <input name="password" type="password" required minLength={6} autoComplete="new-password" className="input" />
      </label>
      <label className="grid gap-1">
        <span className="field-label">ยืนยันรหัสผ่าน</span>
        <input name="confirm" type="password" required minLength={6} autoComplete="new-password" className="input" />
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary mt-2 min-h-11 justify-center">
        {pending ? "กำลังสมัคร…" : "สมัครใช้งาน"}
      </button>
    </form>
  );
}
