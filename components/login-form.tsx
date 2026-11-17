"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ErrorNote } from "@/components/ui";
import { login } from "@/lib/auth-actions";
import type { ActionState } from "@/lib/types";

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(login, { error: null });

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
      <div className="grid gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="login-password" className="field-label">
            รหัสผ่าน
          </label>
          <Link href="/forgot-password" className="text-sm font-medium text-accent hover:underline">
            ลืมรหัสผ่าน?
          </Link>
        </div>
        <input
          id="login-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary mt-2 min-h-11 justify-center">
        {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
