"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ErrorNote } from "@/components/ui";
import { saveProduct } from "@/lib/actions";
import type { Product } from "@/lib/types";

export function ProductForm({ product }: { product?: Product }) {
  const [state, formAction, pending] = useActionState(saveProduct.bind(null, product?.id ?? null), {
    error: null,
  });

  const values = state.values;

  return (
    <form action={formAction} className="card grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
      <label>
        <span className="field-label">รหัสสินค้า *</span>
        <input name="code" required className="input" defaultValue={values?.code ?? product?.code} />
      </label>
      <label>
        <span className="field-label">หน่วยนับ *</span>
        <input name="unit" required className="input" defaultValue={values?.unit ?? product?.unit} />
      </label>
      <label className="sm:col-span-2">
        <span className="field-label">ชื่อสินค้า/บริการ *</span>
        <input name="name" required className="input" defaultValue={values?.name ?? product?.name} />
      </label>
      <label>
        <span className="field-label">ราคาต่อหน่วย (บาท, ก่อน VAT)</span>
        <input
          name="unit_price"
          type="number"
          min={0}
          step="0.01"
          required
          className="input tabular-nums"
          defaultValue={values?.unit_price ?? product?.unit_price ?? 0}
        />
      </label>
      <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
        <input
          name="vat_applicable"
          type="checkbox"
          className="size-4"
          defaultChecked={values ? values.vat_applicable === "on" : (product?.vat_applicable ?? true)}
        />
        คิด VAT
      </label>

      <div className="grid gap-3 sm:col-span-2">
        <ErrorNote message={state.error} />
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </button>
          <Link href="/products" className="btn">
            ยกเลิก
          </Link>
        </div>
      </div>
    </form>
  );
}
