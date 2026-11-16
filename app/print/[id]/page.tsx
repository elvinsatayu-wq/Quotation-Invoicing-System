import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintBank, PrintHeader, PrintParties, PrintSheet, PrintSignatures } from "@/components/print-parts";
import { bahtText } from "@/lib/bahttext";
import { getDocumentDetail } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import type { DocStatus, DocType } from "@/lib/types";

export const metadata: Metadata = { title: "พิมพ์เอกสาร" };

const TITLE: Record<DocType, { th: string; en: string }> = {
  QT: { th: "ใบเสนอราคา", en: "Quotation" },
  IV: { th: "ใบแจ้งหนี้", en: "Invoice" },
};

/** Statuses printed with a stamp so the copy is not mistaken for an issued document. */
const STAMP: Partial<Record<DocStatus, string>> = { draft: "ร่าง", cancelled: "ยกเลิก" };

const qty = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 3 });

export default async function PrintDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getDocumentDetail(id);
  if (!detail) notFound();
  const { doc, items, company, customer, source } = detail;

  const facts: [string, string][] = [
    ["เลขที่", doc.doc_number],
    ["วันที่", formatDate(doc.issue_date)],
    [doc.type === "QT" ? "ยืนราคาถึง" : "ครบกำหนดชำระ", formatDate(doc.due_date)],
  ];
  if (doc.type === "IV") facts.push(["เครดิต", `${customer.credit_term_days} วัน`]);
  if (source) facts.push(["อ้างอิง", source.doc_number]);

  return (
    <PrintSheet backHref={`/documents/${doc.id}`} fileName={doc.doc_number} stamp={STAMP[doc.status]}>
      <PrintHeader company={company} title={TITLE[doc.type].th} titleEn={TITLE[doc.type].en} />
      <PrintParties customer={customer} facts={facts} />

      <table className="print-table mt-4 w-full border-collapse">
        <thead>
          <tr>
            <th className="w-12 text-center">ลำดับ</th>
            <th className="text-left">รายการ</th>
            <th className="w-20 text-right">จำนวน</th>
            <th className="w-16 text-left">หน่วย</th>
            <th className="w-28 text-right">ราคา/หน่วย</th>
            <th className="w-28 text-right">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id}>
              <td className="text-center">{index + 1}</td>
              <td>
                {item.description}
                {!item.vat_applicable && <span className="text-muted"> (ไม่มี VAT)</span>}
              </td>
              <td className="text-right tabular-nums">{qty.format(item.quantity)}</td>
              <td>{item.unit}</td>
              <td className="text-right tabular-nums">{formatMoney(item.unit_price)}</td>
              <td className="text-right tabular-nums">{formatMoney(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="keep-together mt-4 grid grid-cols-[1fr_17rem] gap-6">
        <div>
          <p className="print-shade rounded-md bg-paper px-3 py-2 text-center font-medium">
            ({bahtText(doc.grand_total)})
          </p>
          {doc.notes && (
            <div className="mt-3">
              <p className="font-medium text-muted">หมายเหตุ</p>
              <p className="whitespace-pre-wrap">{doc.notes}</p>
            </div>
          )}
          {doc.type === "IV" && <PrintBank company={company} />}
        </div>
        <dl className="grid grid-cols-[1fr_auto] content-start gap-y-1 [&>dd]:pl-4">
          <dt>รวมเป็นเงิน</dt>
          <dd className="text-right tabular-nums">{formatMoney(doc.subtotal)}</dd>
          <dt>ภาษีมูลค่าเพิ่ม {doc.vat_rate}%</dt>
          <dd className="text-right tabular-nums">{formatMoney(doc.vat_amount)}</dd>
          <dt className="border-t border-ink pt-1 font-semibold">จำนวนเงินรวมทั้งสิ้น</dt>
          <dd className="border-t border-ink pt-1 text-right font-semibold tabular-nums">
            {formatMoney(doc.grand_total)}
          </dd>
          {doc.wht_amount > 0 && (
            <>
              <dt className="text-muted">หัก ณ ที่จ่าย {doc.wht_rate}%</dt>
              <dd className="text-right text-muted tabular-nums">−{formatMoney(doc.wht_amount)}</dd>
              <dt className="font-semibold">ยอดชำระสุทธิ</dt>
              <dd className="text-right font-semibold tabular-nums">{formatMoney(doc.net_total)}</dd>
            </>
          )}
        </dl>
      </section>

      <PrintSignatures
        roles={doc.type === "QT" ? ["ผู้เสนอราคา", "ผู้อนุมัติสั่งซื้อ"] : ["ผู้รับวางบิล", "ผู้มีอำนาจลงนาม"]}
      />
    </PrintSheet>
  );
}
