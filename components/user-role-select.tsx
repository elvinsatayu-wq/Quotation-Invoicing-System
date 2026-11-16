"use client";

import { useState, useTransition } from "react";
import { setUserRole } from "@/lib/actions";

const ROLES = [
  { value: "admin", label: "ผู้ดูแลระบบ (Admin)" },
  { value: "user", label: "ผู้ใช้งาน (User)" },
  { value: "pending", label: "รออนุมัติ / ระงับ" },
];

/** Changes a user's role as soon as another option is picked. */
export function UserRoleSelect({ userId, email, role }: { userId: string; email: string; role: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <select
        aria-label={`สิทธิ์ของ ${email}`}
        className="input w-auto py-1.5"
        defaultValue={role}
        disabled={pending}
        onChange={(event) => {
          const select = event.currentTarget;
          const next = select.value;
          startTransition(async () => {
            const result = await setUserRole(userId, next);
            setError(result.error);
            if (result.error) select.value = role;
          });
        }}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="max-w-60 text-xs whitespace-normal text-bad">
          {error}
        </span>
      )}
    </span>
  );
}
