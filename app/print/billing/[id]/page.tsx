import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintBank, PrintHeader, PrintParties, PrintSheet, PrintSignatures } from "@/components/print-parts";
import { bahtText } from "@/lib/bahttext";
import { getBillingNoteDetail } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "พิมพ์ใบวางบิล" };

export default async function PrintBillingNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getBillingNoteDetail(id);
  if (!detail) notFound();
  const { note, invoices, company, customer } = detail;

  return (
    <PrintSheet
      backHref={`/billing-notes/${note.id}`}
      fileName={note.doc_number}
      stamp={note.status === "cancelled" ? "ยกเลิก" : undefined}
    >
      <PrintHeader company={company} title="ใบวางบิล" titleEn="Billing Note" />
      <PrintParties
        customer={customer}
        facts={[
          ["เลขที่", note.doc_number],
          ["วันที่วางบิล", formatDate(note.issue_date)],
          ["วันนัดชำระ", formatDate(note.due_date)],
          ["จำนวน", `${note.invoice_count} ใบ`],
        ]}
      />

      <table className="print-table mt-4 w-full border-collapse">
        <thead>
          <tr>
            <th className="w-12 text-center">ลำดับ</th>
            <th className="text-left">เลขที่ใบแจ้งหนี้</th>
            <th className="text-left">วันที่</th>
            <th className="text-left">ครบกำหนด</th>
            <th className="w-28 text-right">ยอดรวม</th>
            <th className="w-24 text-right">หัก ณ ที่จ่าย</th>
            <th className="w-28 text-right">ยอดสุทธิ</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice, index) => (
            <tr key={invoice.id}>
              <td className="text-center">{index + 1}</td>
              <td>{invoice.doc_number}</td>
              <td>{formatDate(invoice.issue_date)}</td>
              <td>{formatDate(invoice.due_date)}</td>
              <td className="text-right tabular-nums">{formatMoney(invoice.grand_total)}</td>
              <td className="text-right tabular-nums">{formatMoney(invoice.wht_amount)}</td>
              <td className="text-right tabular-nums">{formatMoney(invoice.net_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="keep-together mt-4 grid grid-cols-[1fr_17rem] gap-6">
        <div>
          <p className="print-shade rounded-md bg-paper px-3 py-2 text-center font-medium">
            ({bahtText(note.net_total)})
          </p>
          {note.notes && (
            <div className="mt-3">
              <p className="font-medium text-muted">หมายเหตุ</p>
              <p className="whitespace-pre-wrap">{note.notes}</p>
            </div>
          )}
          <PrintBank company={company} />
        </div>
        <dl className="grid grid-cols-[1fr_auto] content-start gap-y-1 [&>dd]:pl-4">
          <dt>ยอดรวม (รวม VAT)</dt>
          <dd className="text-right tabular-nums">{formatMoney(note.grand_total)}</dd>
          <dt>หัก ณ ที่จ่าย</dt>
          <dd className="text-right tabular-nums">
            {note.wht_amount > 0 && "−"}
            {formatMoney(note.wht_amount)}
          </dd>
          <dt className="border-t border-ink pt-1 font-semibold">ยอดวางบิลสุทธิ</dt>
          <dd className="border-t border-ink pt-1 text-right font-semibold tabular-nums">
            {formatMoney(note.net_total)}
          </dd>
        </dl>
      </section>

      <PrintSignatures roles={["ผู้วางบิล", "ผู้รับวางบิล"]} />
    </PrintSheet>
  );
}
