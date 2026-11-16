"use client";

import { useActionState } from "react";
import { ErrorNote } from "@/components/ui";
import { login } from "@/lib/auth-actions";
import type { ActionState } from "@/lib/types";

export function LoginForm({ defaultEmail }: { defaultEmail: string }) {
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
          defaultValue={state.values?.email ?? defaultEmail}
          className="input"
        />
      </label>
      <label className="grid gap-1">
        <span className="field-label">รหัสผ่าน</span>
        <input name="password" type="password" required autoComplete="current-password" className="input" />
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary mt-2 min-h-11 justify-center">
        {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
