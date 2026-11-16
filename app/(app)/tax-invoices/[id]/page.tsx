import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelButton } from "@/components/cancel-button";
import { InvoiceLines } from "@/components/invoice-lines";
import { PageHeader, ReceiptStatusBadge } from "@/components/ui";
import { cancelTaxInvoice } from "@/lib/actions";
import { getTaxInvoiceDetail } from "@/lib/data";
import { formatDate } from "@/lib/format";

export default async function TaxInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getTaxInvoiceDetail(id);
  if (!detail) notFound();
  const { taxInvoice, invoice, items } = detail;
  const buyer = taxInvoice.buyer;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {taxInvoice.doc_number}
            <ReceiptStatusBadge status={taxInvoice.status} />
          </span>
        }
        subtitle={
          <>
            ใบส่งของ/ใบกำกับภาษี · ใบแจ้งหนี้{" "}
            <Link href={`/documents/${invoice.id}`} className="text-accent hover:underline">
              {invoice.doc_number}
            </Link>
          </>
        }
        actions={
          <Link href={`/print/tax-invoice/${id}`} target="_blank" className="btn">
            พิมพ์ / PDF
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="card p-4 text-sm">
          <h2 className="mb-1 font-medium text-muted">ผู้ซื้อ (ณ วันที่ออก)</h2>
          <p className="font-medium">{buyer.name}</p>
          <p className="text-muted">{buyer.address}</p>
          {buyer.tax_id && (
            <p className="text-muted">
              เลขผู้เสียภาษี {buyer.tax_id}
              {buyer.branch && ` (${buyer.branch})`}
            </p>
          )}
        </section>
        <dl className="card grid grid-cols-2 content-start gap-3 p-4 text-sm">
          <div>
            <dt className="text-muted">วันที่ส่งมอบ / วันที่ใบกำกับภาษี</dt>
            <dd>{formatDate(taxInvoice.tax_date)}</dd>
          </div>
          <div>
            <dt className="text-muted">ครบกำหนดชำระ</dt>
            <dd>{formatDate(invoice.due_date)}</dd>
          </div>
          {taxInvoice.notes && (
            <div className="col-span-2">
              <dt className="text-muted">หมายเหตุ</dt>
              <dd>{taxInvoice.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="mt-3">
        <InvoiceLines invoice={invoice} items={items} />
      </div>

      {taxInvoice.status !== "cancelled" && (
        <div className="mt-4 grid gap-1">
          <CancelButton
            action={cancelTaxInvoice.bind(null, id)}
            label="ยกเลิกใบกำกับภาษี"
            confirmMessage="ยกเลิกใบกำกับภาษีนี้ใช่หรือไม่? ใบแจ้งหนี้จะกลับมาแก้ไขได้ และย้อนกลับไม่ได้"
          />
          <p className="text-xs text-muted">ใบกำกับภาษีแก้ไขไม่ได้ ถ้าข้อมูลผิดให้ยกเลิกแล้วออกใบใหม่</p>
        </div>
      )}
    </>
  );
}
