"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ErrorNote } from "@/components/ui";
import { requestPasswordReset, updatePassword } from "@/lib/auth-actions";
import type { ActionState } from "@/lib/types";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestPasswordReset, { error: null });

  if (state.saved) {
    return (
      <div role="status" className="rounded-xl border border-accent/15 bg-accent-soft px-4 py-4 text-sm text-accent">
        <p className="font-medium">ส่งลิงก์เปลี่ยนรหัสผ่านแล้ว</p>
        <p className="mt-1 text-accent/80">
          ถ้า {state.values?.email} มีบัญชีอยู่ในระบบ จะได้รับอีเมลพร้อมลิงก์ตั้งรหัสผ่านใหม่ภายในไม่กี่นาที
          กรุณาเปิดลิงก์ด้วยเบราว์เซอร์นี้ (ตรวจในกล่องจดหมายขยะด้วย)
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <ErrorNote message={state.error} />
      <label className="grid gap-1">
        <span className="field-label">อีเมล</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          defaultValue={state.values?.email}
          className="input"
        />
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary mt-2 min-h-11 justify-center">
        {pending ? "กำลังส่ง…" : "ส่งลิงก์เปลี่ยนรหัสผ่าน"}
      </button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(updatePassword, { error: null });

  return (
    <form action={action} className="grid gap-4">
      <ErrorNote message={state.error} />
      {state.error?.startsWith("ลิงก์หมดอายุ") && (
        <Link href="/forgot-password" className="text-sm font-medium text-accent hover:underline">
          ขอลิงก์เปลี่ยนรหัสผ่านใหม่
        </Link>
      )}
      <label className="grid gap-1">
        <span className="field-label">รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)</span>
        <input name="password" type="password" required minLength={6} autoComplete="new-password" className="input" />
      </label>
      <label className="grid gap-1">
        <span className="field-label">ยืนยันรหัสผ่านใหม่</span>
        <input name="confirm" type="password" required minLength={6} autoComplete="new-password" className="input" />
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary mt-2 min-h-11 justify-center">
        {pending ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}
      </button>
    </form>
  );
}
