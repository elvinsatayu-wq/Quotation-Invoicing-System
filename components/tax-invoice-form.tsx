"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ErrorNote } from "@/components/ui";
import { issueTaxInvoice } from "@/lib/actions";

/** Delivery date and notes for a tax invoice issued on delivery of goods. */
export function TaxInvoiceForm({
  invoiceId,
  invoiceIssueDate,
  today,
}: {
  invoiceId: string;
  invoiceIssueDate: string;
  today: string;
}) {
  const router = useRouter();
  const [taxDate, setTaxDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (taxDate > today) return setError("วันที่ส่งมอบต้องไม่เป็นวันในอนาคต");
    if (taxDate < invoiceIssueDate) return setError("วันที่ส่งมอบต้องไม่ก่อนวันที่ของใบแจ้งหนี้");
    startTransition(async () => {
      const result = await issueTaxInvoice(invoiceId, { tax_date: taxDate, notes });
      if (result.error || !result.id) return setError(result.error);
      router.push(`/tax-invoices/${result.id}`);
    });
  }

  return (
    <div className="grid gap-3">
      <section className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <label>
          <span className="field-label">วันที่ส่งมอบสินค้า (วันที่ใบกำกับภาษี)</span>
          <input
            type="date"
            className="input"
            min={invoiceIssueDate}
            max={today}
            value={taxDate}
            onChange={(event) => {
              setError(null);
              setTaxDate(event.target.value);
            }}
          />
        </label>
        <label className="sm:col-span-2">
          <span className="field-label">หมายเหตุ (เช่น สถานที่ส่งของ)</span>
          <input
            className="input"
            value={notes}
            onChange={(event) => {
              setError(null);
              setNotes(event.target.value);
            }}
          />
        </label>
      </section>
      <ErrorNote message={error} />
      <p className="text-sm text-muted">
        เมื่อออกแล้ว ใบแจ้งหนี้จะแก้ไขไม่ได้ และใบเสร็จที่ออกภายหลังจะเป็นใบเสร็จรับเงินธรรมดา
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>
          {pending ? "กำลังบันทึก…" : "ออกใบกำกับภาษี"}
        </button>
        <Link href={`/documents/${invoiceId}`} className="btn">
          ยกเลิก
        </Link>
      </div>
    </div>
  );
}
