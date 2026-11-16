import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceLines } from "@/components/invoice-lines";
import { TaxInvoiceForm } from "@/components/tax-invoice-form";
import { ErrorNote, PageHeader } from "@/components/ui";
import { getTaxInvoiceTarget } from "@/lib/data";
import { formatDate, todayTh } from "@/lib/format";

export default async function NewTaxInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string }>;
}) {
  const { invoice: invoiceId } = await searchParams;
  const target = invoiceId ? await getTaxInvoiceTarget(invoiceId) : null;
  if (!target) notFound();
  const { invoice, items, blocked } = target;

  return (
    <>
      <PageHeader
        title="ส่งมอบสินค้า / ออกใบกำกับภาษี"
        subtitle={
          <>
            ใบส่งของ/ใบกำกับภาษี สำหรับใบแจ้งหนี้{" "}
            <Link href={`/documents/${invoice.id}`} className="text-accent hover:underline">
              {invoice.doc_number}
            </Link>{" "}
            · {invoice.customer_name} · ลงวันที่ {formatDate(invoice.issue_date)}
          </>
        }
      />
      <div className="grid gap-3">
        {blocked ? (
          <div className="grid max-w-xl gap-3">
            <ErrorNote message={blocked} />
            <div>
              <Link href={`/documents/${invoice.id}`} className="btn">
                กลับไปที่ใบแจ้งหนี้
              </Link>
            </div>
          </div>
        ) : (
          <TaxInvoiceForm invoiceId={invoice.id} invoiceIssueDate={invoice.issue_date} today={todayTh()} />
        )}
        <InvoiceLines invoice={invoice} items={items} />
      </div>
    </>
  );
}
