import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelButton } from "@/components/cancel-button";
import { PageHeader, ReceiptStatusBadge, StatusBadge } from "@/components/ui";
import { cancelReceipt } from "@/lib/actions";
import { getReceiptDetail } from "@/lib/data";
import { formatDate, formatMoney, PAYMENT_METHOD_LABEL } from "@/lib/format";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getReceiptDetail(id);
  if (!detail) notFound();
  const { receipt, invoices, customer } = detail;
  const active = receipt.status !== "cancelled";

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {receipt.doc_number}
            <ReceiptStatusBadge status={receipt.status} />
          </span>
        }
        subtitle={receipt.is_tax_invoice ? "ใบเสร็จรับเงิน/ใบกำกับภาษี" : "ใบเสร็จรับเงิน"}
        actions={
          <>
            {active && (
              <Link href={`/receipts/${id}/edit`} className="btn">
                แก้ไข
              </Link>
            )}
            <Link href={`/print/receipt/${id}`} target="_blank" className="btn">
              พิมพ์ / PDF
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="card p-4 text-sm">
          <h2 className="mb-1 font-medium text-muted">ลูกค้า</h2>
          <p className="font-medium">{customer.name}</p>
          <p className="text-muted">{customer.address}</p>
          {customer.tax_id && (
            <p className="text-muted">
              เลขผู้เสียภาษี {customer.tax_id}
              {customer.branch && ` (${customer.branch})`}
            </p>
          )}
        </section>
        <dl className="card grid grid-cols-2 content-start gap-3 p-4 text-sm">
          <div>
            <dt className="text-muted">วันที่รับเงิน</dt>
            <dd>{formatDate(receipt.receipt_date)}</dd>
          </div>
          <div>
            <dt className="text-muted">วิธีชำระเงิน</dt>
            <dd>
              {PAYMENT_METHOD_LABEL[receipt.payment_method]}
              {receipt.payment_ref && <span className="text-muted"> · {receipt.payment_ref}</span>}
            </dd>
          </div>
          {receipt.notes && (
            <div className="col-span-2">
              <dt className="text-muted">หมายเหตุ</dt>
              <dd className="whitespace-pre-wrap">{receipt.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="card table-scroll mt-3">
        <table className="data-table min-w-[760px]">
          <thead>
            <tr>
              <th>#</th>
              <th>ใบแจ้งหนี้</th>
              <th>วันที่</th>
              <th>สถานะ</th>
              <th className="num">ยอดรวม</th>
              <th className="num">หัก ณ ที่จ่าย</th>
              <th className="num">รับชำระ</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice, index) => (
              <tr key={invoice.id}>
                <td>{index + 1}</td>
                <td className="whitespace-nowrap">
                  <Link href={`/documents/${invoice.id}`} className="font-medium text-accent hover:underline">
                    {invoice.doc_number}
                  </Link>
                </td>
                <td className="whitespace-nowrap">{formatDate(invoice.issue_date)}</td>
                <td>
                  <StatusBadge status={invoice.status} overdue={invoice.is_overdue} />
                </td>
                <td className="num">{formatMoney(invoice.grand_total)}</td>
                <td className="num">{formatMoney(invoice.wht_amount)}</td>
                <td className="num">{formatMoney(invoice.net_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={4} className="px-3 py-2.5">
                รวม {receipt.invoice_count} ใบ
              </td>
              <td className="num px-3 py-2.5">{formatMoney(receipt.grand_total)}</td>
              <td className="num px-3 py-2.5">{formatMoney(receipt.wht_amount)}</td>
              <td className="num px-3 py-2.5">{formatMoney(receipt.net_total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {active && (
        <div className="mt-4">
          <CancelButton
            action={cancelReceipt.bind(null, id)}
            label="ยกเลิกใบเสร็จ"
            confirmMessage="ยกเลิกใบเสร็จนี้ใช่หรือไม่? ใบแจ้งหนี้ในใบเสร็จจะกลับเป็นสถานะก่อนรับชำระ และย้อนกลับไม่ได้"
          />
        </div>
      )}
    </>
  );
}
