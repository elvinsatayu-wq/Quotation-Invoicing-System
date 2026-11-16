"use client";

import { useActionState, useEffect, useState } from "react";
import { ErrorNote } from "@/components/ui";
import { saveCompany } from "@/lib/actions";
import type { Company } from "@/lib/types";

export function CompanyForm({ company }: { company: Company | null }) {
  const [state, formAction, pending] = useActionState(saveCompany, { error: null });
  const [preview, setPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const values = state.values;

  // After each save the form is reset, so drop the local logo choice too.
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    setPreview(null);
    setRemoveLogo(false);
  }

  // Release the object URL of the previous preview.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const field = (name: keyof Company) => values?.[name] ?? company?.[name] ?? "";
  const logo = preview ?? (removeLogo ? null : company?.logo_url);

  return (
    <form action={formAction} className="card grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
      <h2 className="font-medium sm:col-span-2">ข้อมูลผู้ออกเอกสาร</h2>
      <label className="sm:col-span-2">
        <span className="field-label">ชื่อบริษัท / ร้าน *</span>
        <input name="name" required className="input" defaultValue={field("name") as string} />
      </label>
      <label className="sm:col-span-2">
        <span className="field-label">ที่อยู่ *</span>
        <textarea name="address" required rows={3} className="input py-2" defaultValue={field("address") as string} />
      </label>
      <label>
        <span className="field-label">เลขประจำตัวผู้เสียภาษี (13 หลัก) *</span>
        <input
          name="tax_id"
          required
          inputMode="numeric"
          pattern="[0-9]{13}"
          maxLength={13}
          title="ตัวเลข 13 หลัก"
          className="input tabular-nums"
          defaultValue={field("tax_id") as string}
        />
      </label>
      <label>
        <span className="field-label">สาขา</span>
        <input
          name="branch"
          placeholder="สำนักงานใหญ่"
          className="input"
          defaultValue={field("branch") as string}
        />
      </label>
      <label>
        <span className="field-label">โทรศัพท์</span>
        <input name="phone" type="tel" className="input" defaultValue={field("phone") as string} />
      </label>
      <label>
        <span className="field-label">อีเมล</span>
        <input name="email" type="email" className="input" defaultValue={field("email") as string} />
      </label>

      <div className="sm:col-span-2">
        <span className="field-label">โลโก้ (แสดงบนเอกสารที่พิมพ์)</span>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-20 shrink-0 items-center justify-center rounded-md border border-line bg-paper">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL / local preview
              <img src={logo} alt="โลโก้บริษัท" className="max-h-18 max-w-18 object-contain" />
            ) : (
              <span className="text-xs text-muted">ไม่มีโลโก้</span>
            )}
          </div>
          <div className="grid gap-2 text-sm">
            <input
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
            <p className="text-xs text-muted">PNG, JPG, WEBP, GIF หรือ SVG ไม่เกิน 500 KB</p>
            {company?.logo_url && (
              <label className="flex items-center gap-2">
                <input
                  name="remove_logo"
                  type="checkbox"
                  className="size-4"
                  checked={removeLogo}
                  onChange={(event) => setRemoveLogo(event.target.checked)}
                />
                ลบโลโก้ปัจจุบัน
              </label>
            )}
          </div>
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input
          name="vat_registered"
          type="checkbox"
          className="mt-0.5 size-4"
          defaultChecked={values ? values.vat_registered === "on" : (company?.vat_registered ?? true)}
        />
        <span>
          <span className="font-medium">จดทะเบียนภาษีมูลค่าเพิ่ม</span>
          <span className="block text-muted">
            ใบเสร็จรับเงินที่ออกจะเป็น &quot;ใบเสร็จรับเงิน/ใบกำกับภาษี&quot; การเปลี่ยนค่านี้มีผลกับใบเสร็จที่ออกใหม่เท่านั้น
          </span>
        </span>
      </label>

      <h2 className="mt-2 font-medium sm:col-span-2">บัญชีรับชำระเงิน (แสดงบนใบแจ้งหนี้)</h2>
      <label className="sm:col-span-2">
        <span className="field-label">ธนาคาร / สาขา</span>
        <input name="bank_name" className="input" defaultValue={field("bank_name") as string} />
      </label>
      <label>
        <span className="field-label">ชื่อบัญชี</span>
        <input name="bank_account_name" className="input" defaultValue={field("bank_account_name") as string} />
      </label>
      <label>
        <span className="field-label">เลขที่บัญชี</span>
        <input
          name="bank_account_no"
          className="input tabular-nums"
          defaultValue={field("bank_account_no") as string}
        />
      </label>

      <div className="grid gap-3 sm:col-span-2">
        <ErrorNote message={state.error} />
        {state.saved && !pending && (
          <p role="status" className="rounded-md bg-good-soft px-3 py-2 text-sm text-good">
            บันทึกข้อมูลบริษัทแล้ว เอกสารทุกใบจะใช้ข้อมูลนี้
          </p>
        )}
        <div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </form>
  );
}
