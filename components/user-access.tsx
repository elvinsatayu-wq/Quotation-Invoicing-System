"use client";

import { useActionState, useState, useTransition } from "react";
import { ErrorNote } from "@/components/ui";
import { createCompany, setUserAccess } from "@/lib/actions";
import type { CompanyOption } from "@/lib/data";
import type { ActionState } from "@/lib/types";

const ROLES = [
  { value: "admin", label: "ผู้ดูแลบริษัท (Admin)" },
  { value: "user", label: "ผู้ใช้งาน (User)" },
  { value: "pending", label: "รออนุมัติ / ระงับ" },
];

/** Company and role of one account; saved as soon as either select changes. */
export function UserAccess({
  userId,
  email,
  role,
  companyId,
  companies,
}: {
  userId: string;
  email: string;
  role: string;
  companyId: string | null;
  companies: CompanyOption[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState({ role, companyId: companyId ?? "" });

  function change(next: { role: string; companyId: string }) {
    // Picking a company for a pending account gives it the User role by default.
    if (next.companyId && !current.companyId && next.role === "pending") next = { ...next, role: "user" };
    const previous = current;
    setCurrent(next);
    startTransition(async () => {
      const result = await setUserAccess(userId, next.role, next.companyId || null);
      setError(result.error);
      if (result.error) setCurrent(previous);
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="flex flex-wrap justify-end gap-2">
        <select
          aria-label={`บริษัทของ ${email}`}
          className="input w-auto py-1.5"
          value={current.companyId}
          disabled={pending}
          onChange={(event) => change({ role: current.role, companyId: event.currentTarget.value })}
        >
          <option value="">— ไม่มีบริษัท —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label={`สิทธิ์ของ ${email}`}
          className="input w-auto py-1.5"
          value={current.role}
          disabled={pending}
          onChange={(event) => change({ role: event.currentTarget.value, companyId: current.companyId })}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </span>
      {error && (
        <span role="alert" className="max-w-72 text-xs whitespace-normal text-bad">
          {error}
        </span>
      )}
    </span>
  );
}

export function NewCompanyForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCompany, { error: null });

  return (
    <form action={action} className="grid gap-2">
      <ErrorNote message={state.error} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-60 flex-1 gap-1">
          <span className="field-label">เพิ่มบริษัทใหม่</span>
          <input
            key={state.saved ? "saved" : "editing"}
            name="name"
            required
            placeholder="ชื่อบริษัท"
            defaultValue={state.saved ? "" : state.values?.name}
            className="input"
          />
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "กำลังเพิ่ม…" : "เพิ่มบริษัท"}
        </button>
      </div>
      <p className="text-xs text-muted">
        ใส่แค่ชื่อก็พอ แล้วกำหนดผู้ดูแลบริษัท (Admin) ให้ เขาจะกรอกที่อยู่และเลขผู้เสียภาษีเองที่เมนู “ข้อมูลบริษัท”
      </p>
    </form>
  );
}
