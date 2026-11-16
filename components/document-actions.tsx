"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ErrorNote } from "@/components/ui";
import { convertToInvoice, setDocumentStatus } from "@/lib/actions";
import type { ActionState, DocStatus, DocumentSummary } from "@/lib/types";

const CANCEL_CONFIRM = "ยกเลิกเอกสารนี้ใช่หรือไม่? เมื่อยกเลิกแล้วจะย้อนกลับไม่ได้";

/** Workflow buttons. Mirrors the transitions enforced by set_document_status(). */
export function DocumentActions({
  doc,
  invoice,
  receipt,
}: {
  doc: DocumentSummary;
  invoice: { id: string; doc_number: string } | null;
  receipt: { id: string; doc_number: string } | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionState>) {
    startTransition(async () => {
      setError((await action()).error);
    });
  }

  function changeStatus(status: DocStatus, confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    run(() => setDocumentStatus(doc.id, status));
  }

  function convert() {
    startTransition(async () => {
      const result = await convertToInvoice(doc.id);
      if (result.id) router.push(`/documents/${result.id}`);
      else setError(result.error);
    });
  }

  const isQuotation = doc.type === "QT";
  const canCancel = doc.status === "draft" || doc.status === "sent" || doc.status === "approved";
  // Payment is recorded by issuing a receipt (which marks the invoice paid).
  const canReceive = !isQuotation && (doc.status === "sent" || doc.status === "approved");
  const needsReceipt = !isQuotation && doc.status === "paid" && !receipt;
  const receiptHref = `/receipts/new?customer=${doc.customer_id}&invoice=${doc.id}`;
  const canConvert = isQuotation && doc.status === "approved" && !invoice;
  const awaitingApproval = isQuotation && (doc.status === "draft" || doc.status === "sent");

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {doc.status === "draft" && (
          <button type="button" className="btn" disabled={pending} onClick={() => changeStatus("sent")}>
            ทำเครื่องหมายว่าส่งแล้ว
          </button>
        )}
        {doc.status === "sent" && (
          <button type="button" className="btn" disabled={pending} onClick={() => changeStatus("approved")}>
            อนุมัติ
          </button>
        )}
        {canReceive && (
          <Link href={receiptHref} className="btn btn-primary">
            รับชำระ / ออกใบเสร็จ
          </Link>
        )}
        {needsReceipt && (
          <Link href={receiptHref} className="btn">
            ออกใบเสร็จรับเงิน
          </Link>
        )}
        {receipt && (
          <Link href={`/receipts/${receipt.id}`} className="btn">
            ดูใบเสร็จ {receipt.doc_number}
          </Link>
        )}
        {(canConvert || awaitingApproval) && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !canConvert}
            title={canConvert ? undefined : "ต้องอนุมัติใบเสนอราคาก่อน"}
            onClick={convert}
          >
            แปลงเป็นใบแจ้งหนี้
          </button>
        )}
        {invoice && (
          <Link href={`/documents/${invoice.id}`} className="btn">
            ดูใบแจ้งหนี้ {invoice.doc_number}
          </Link>
        )}
        {canCancel && (
          <button
            type="button"
            className="btn btn-danger"
            disabled={pending}
            onClick={() => changeStatus("cancelled", CANCEL_CONFIRM)}
          >
            ยกเลิกเอกสาร
          </button>
        )}
      </div>
      {awaitingApproval && (
        <p className="text-xs text-muted">อนุมัติใบเสนอราคาก่อน จึงจะแปลงเป็นใบแจ้งหนี้ได้</p>
      )}
      <ErrorNote message={error} />
    </div>
  );
}
