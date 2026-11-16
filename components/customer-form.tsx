"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ErrorNote } from "@/components/ui";
import { saveCustomer } from "@/lib/actions";
import type { Customer } from "@/lib/types";

export function CustomerForm({ customer }: { customer?: Customer }) {
  const [state, formAction, pending] = useActionState(saveCustomer.bind(null, customer?.id ?? null), {
    error: null,
  });

  const values = state.values;

  return (
    <form action={formAction} className="card grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className="field-label">ชื่อลูกค้า *</span>
        <input name="name" required className="input" defaultValue={values?.name ?? customer?.name} />
      </label>
      <label className="sm:col-span-2">
        <span className="field-label">ที่อยู่</span>
        <textarea name="address" rows={3} className="input py-2" defaultValue={values?.address ?? customer?.address} />
      </label>
      <label>
        <span className="field-label">เลขประจำตัวผู้เสียภาษี (13 หลัก)</span>
        <input
          name="tax_id"
          inputMode="numeric"
          pattern="[0-9]{13}"
          maxLength={13}
          title="ตัวเลข 13 หลัก"
          className="input tabular-nums"
          defaultValue={values?.tax_id ?? customer?.tax_id ?? ""}
        />
      </label>
      <label>
        <span className="field-label">สาขา</span>
        <input
          name="branch"
          placeholder="สำนักงานใหญ่"
          className="input"
          defaultValue={values?.branch ?? customer?.branch ?? ""}
        />
      </label>
      <label>
        <span className="field-label">ผู้ติดต่อ</span>
        <input name="contact_name" className="input" defaultValue={values?.contact_name ?? customer?.contact_name ?? ""} />
      </label>
      <label>
        <span className="field-label">โทรศัพท์</span>
        <input name="phone" type="tel" className="input" defaultValue={values?.phone ?? customer?.phone ?? ""} />
      </label>
      <label>
        <span className="field-label">อีเมล</span>
        <input name="email" type="email" className="input" defaultValue={values?.email ?? customer?.email ?? ""} />
      </label>
      <label>
        <span className="field-label">เครดิตเทอม (วัน)</span>
        <input
          name="credit_term_days"
          type="number"
          min={0}
          step={1}
          required
          className="input"
          defaultValue={values?.credit_term_days ?? customer?.credit_term_days ?? 30}
        />
      </label>

      <div className="grid gap-3 sm:col-span-2">
        <ErrorNote message={state.error} />
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </button>
          <Link href="/customers" className="btn">
            ยกเลิก
          </Link>
        </div>
      </div>
    </form>
  );
}
