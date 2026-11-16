import { BillingNoteForm } from "@/components/billing-note-form";
import { PageHeader } from "@/components/ui";
import { listBillableInvoices, listCustomers } from "@/lib/data";
import { todayTh } from "@/lib/format";

export default async function NewBillingNotePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; invoice?: string }>;
}) {
  const { customer, invoice } = await searchParams;
  const [customers, invoices] = await Promise.all([listCustomers(), listBillableInvoices()]);

  return (
    <>
      <PageHeader title="สร้างใบวางบิล" subtitle="เลขที่เอกสารจะออกให้เมื่อบันทึก" />
      <BillingNoteForm
        key={`${customer ?? ""}:${invoice ?? ""}`}
        today={todayTh()}
        customers={customers}
        invoices={invoices}
        initialCustomerId={customer}
        initialInvoiceIds={invoice ? [invoice] : []}
      />
    </>
  );
}
