import { ReceiptForm } from "@/components/receipt-form";
import { PageHeader } from "@/components/ui";
import { getCompany, listCustomers, listReceivableInvoices } from "@/lib/data";
import { todayTh } from "@/lib/format";

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; invoice?: string | string[] }>;
}) {
  const { customer, invoice } = await searchParams;
  const invoiceIds = invoice === undefined ? [] : Array.isArray(invoice) ? invoice : [invoice];
  const [customers, invoices, company] = await Promise.all([
    listCustomers(),
    listReceivableInvoices(),
    getCompany(),
  ]);

  return (
    <>
      <PageHeader title="ออกใบเสร็จรับเงิน" subtitle="เลขที่เอกสารจะออกให้เมื่อบันทึก" />
      <ReceiptForm
        key={`${customer ?? ""}:${invoiceIds.join(",")}`}
        today={todayTh()}
        customers={customers}
        invoices={invoices}
        taxInvoice={company?.vat_registered ?? false}
        initialCustomerId={customer}
        initialInvoiceIds={invoiceIds}
      />
    </>
  );
}
