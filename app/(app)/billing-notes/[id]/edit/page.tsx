import Link from "next/link";
import { notFound } from "next/navigation";
import { BillingNoteForm } from "@/components/billing-note-form";
import { ErrorNote, PageHeader } from "@/components/ui";
import { getBillingNoteDetail, listBillableInvoices, listCustomers } from "@/lib/data";
import { todayTh } from "@/lib/format";

export default async function EditBillingNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getBillingNoteDetail(id);
  if (!detail) notFound();
  const { note, invoices } = detail;
  const header = (
    <PageHeader title={`แก้ไข ${note.doc_number}`} subtitle="ใบวางบิล · เลขที่เอกสารจะไม่เปลี่ยน" />
  );

  if (note.status === "cancelled") {
    return (
      <div className="grid max-w-xl gap-3">
        {header}
        <ErrorNote message="ใบวางบิลที่ยกเลิกแล้วแก้ไขไม่ได้" />
        <div>
          <Link href={`/billing-notes/${id}`} className="btn">
            กลับไปที่ใบวางบิล
          </Link>
        </div>
      </div>
    );
  }

  const [customers, billable] = await Promise.all([listCustomers(), listBillableInvoices(id)]);
  return (
    <>
      {header}
      <BillingNoteForm
        key={id}
        today={todayTh()}
        customers={customers}
        invoices={billable}
        note={note}
        noteInvoiceIds={invoices.map((invoice) => invoice.id)}
      />
    </>
  );
}
