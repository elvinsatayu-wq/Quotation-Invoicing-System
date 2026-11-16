import Link from "next/link";
import { notFound } from "next/navigation";
import { ReceiptForm } from "@/components/receipt-form";
import { ErrorNote, PageHeader } from "@/components/ui";
import { getReceiptDetail, listCustomers } from "@/lib/data";
import { todayTh } from "@/lib/format";

export default async function EditReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getReceiptDetail(id);
  if (!detail) notFound();
  const { receipt, invoices } = detail;
  const header = (
    <PageHeader title={`แก้ไข ${receipt.doc_number}`} subtitle="ใบเสร็จรับเงิน · เลขที่เอกสารจะไม่เปลี่ยน" />
  );

  if (receipt.status === "cancelled") {
    return (
      <div className="grid max-w-xl gap-3">
        {header}
        <ErrorNote message="ใบเสร็จที่ยกเลิกแล้วแก้ไขไม่ได้" />
        <div>
          <Link href={`/receipts/${id}`} className="btn">
            กลับไปที่ใบเสร็จ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {header}
      <ReceiptForm
        key={id}
        today={todayTh()}
        customers={await listCustomers()}
        invoices={invoices}
        receipt={receipt}
        taxInvoice={receipt.is_tax_invoice}
      />
    </>
  );
}
