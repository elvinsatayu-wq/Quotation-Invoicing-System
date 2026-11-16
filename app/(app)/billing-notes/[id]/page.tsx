import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelButton } from "@/components/cancel-button";
import { BillingStatusBadge, PageHeader, StatusBadge } from "@/components/ui";
import { cancelBillingNote } from "@/lib/actions";
import { getBillingNoteDetail } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";

export default async function BillingNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getBillingNoteDetail(id);
  if (!detail) notFound();
  const { note, invoices, customer } = detail;
  const active = note.status !== "cancelled";
  // Open invoices on the note can be paid in one receipt.
  const openInvoices = invoices.filter((i) => i.status === "sent" || i.status === "approved");
  const receiptHref =
    `/receipts/new?customer=${note.customer_id}&` + openInvoices.map((i) => `invoice=${i.id}`).join("&");

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {note.doc_number}
            <BillingStatusBadge status={note.status} openCount={note.open_count} />
          </span>
        }
        subtitle="ใบวางบิล"
        actions={
          <>
            {active && (
              <Link href={`/billing-notes/${id}/edit`} className="btn">
                แก้ไข
              </Link>
            )}
            <Link href={`/print/billing/${id}`} target="_blank" className="btn">
              พิมพ์ / PDF
            </Link>
            {active && openInvoices.length > 0 && (
              <Link href={receiptHref} className="btn btn-primary">
                รับชำระ / ออกใบเสร็จ
              </Link>
            )}
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
            <dt className="text-muted">วันที่วางบิล</dt>
            <dd>{formatDate(note.issue_date)}</dd>
          </div>
          <div>
            <dt className="text-muted">วันนัดชำระ</dt>
            <dd>{formatDate(note.due_date)}</dd>
          </div>
          {note.notes && (
            <div className="col-span-2">
              <dt className="text-muted">หมายเหตุ</dt>
              <dd className="whitespace-pre-wrap">{note.notes}</dd>
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
              <th>ครบกำหนด</th>
              <th>สถานะ</th>
              <th className="num">ยอดรวม</th>
              <th className="num">หัก ณ ที่จ่าย</th>
              <th className="num">ยอดสุทธิ</th>
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
                <td className="whitespace-nowrap">{formatDate(invoice.due_date)}</td>
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
              <td colSpan={5} className="px-3 py-2.5">
                รวม {note.invoice_count} ใบ
              </td>
              <td className="num px-3 py-2.5">{formatMoney(note.grand_total)}</td>
              <td className="num px-3 py-2.5">{formatMoney(note.wht_amount)}</td>
              <td className="num px-3 py-2.5">{formatMoney(note.net_total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {active && (
        <div className="mt-4">
          <CancelButton
            action={cancelBillingNote.bind(null, id)}
            label="ยกเลิกใบวางบิล"
            confirmMessage="ยกเลิกใบวางบิลนี้ใช่หรือไม่? ใบแจ้งหนี้ในใบนี้จะนำไปวางบิลใหม่ได้ และย้อนกลับไม่ได้"
          />
        </div>
      )}
    </>
  );
}
