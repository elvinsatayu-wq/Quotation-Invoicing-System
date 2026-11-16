import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  CopySelector,
  copyOption,
  PrintHeader,
  PrintParties,
  PrintSheet,
  PrintSignatures,
} from "@/components/print-parts";
import { bahtText } from "@/lib/bahttext";
import { getReceiptDetail } from "@/lib/data";
import { formatDate, formatMoney, PAYMENT_METHOD_LABEL } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";

export const metadata: Metadata = { title: "พิมพ์ใบเสร็จรับเงิน" };


const qty = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 3 });

export default async function PrintReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ copy?: string }>;
}) {
  const [{ id }, { copy }] = await Promise.all([params, searchParams]);
  const detail = await getReceiptDetail(id);
  if (!detail) notFound();
  const { receipt, invoices, lines, tax, company, customer, taxInvoiceNumbers } = detail;
  const option = copyOption(copy);

  // A tax invoice prints the seller and buyer as they were when it was issued.
  const seller = receipt.seller
    ? {
        ...company,
        ...receipt.seller,
        tax_id: receipt.seller.tax_id ?? company.tax_id,
        branch: receipt.seller.branch ?? company.branch,
      }
    : company;
  const buyer = receipt.buyer ? { ...customer, ...receipt.buyer } : customer;
  const title = receipt.is_tax_invoice
    ? { th: "ใบเสร็จรับเงิน/ใบกำกับภาษี", en: "Receipt/Tax Invoice" }
    : { th: "ใบเสร็จรับเงิน", en: "Receipt" };
  const severalInvoices = invoices.length > 1;
  const vatBase = Math.round((tax.subtotal - tax.nonVatAmount) * 100) / 100;


  return (
    <PrintSheet
      backHref={`/receipts/${receipt.id}`}
      fileName={receipt.doc_number}
      stamp={receipt.status === "cancelled" ? "ยกเลิก" : undefined}
      copies={option.copies}
      toolbarExtra={<CopySelector href={`/print/receipt/${id}`} current={copy} />}
    >
      {(copyLabel) => (
        <>
          <PrintHeader company={seller} title={title.th} titleEn={title.en} copyLabel={copyLabel} />
          <PrintParties
            customer={buyer}
            label={receipt.is_tax_invoice ? "ผู้ซื้อ / ผู้รับบริการ" : "ลูกค้า"}
            facts={[
              ["เลขที่", receipt.doc_number],
              ["วันที่", formatDate(receipt.receipt_date)],
              ["อ้างอิง", invoices.map((i) => i.doc_number).join(", ")],
              ...(taxInvoiceNumbers.length
                ? ([["ใบกำกับภาษี", taxInvoiceNumbers.join(", ")]] as [string, string][])
                : []),
            ]}
          />

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
              {lines.map((line, index) => (
                <tr key={line.id}>
                  <td className="text-center">{index + 1}</td>
                  <td>
                    {line.description}
                    {!line.vat_applicable && <span className="text-muted"> (ไม่มี VAT)</span>}
                    {severalInvoices && (
                      <span className="block text-xs text-muted">ตามใบแจ้งหนี้ {line.invoice_number}</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{qty.format(line.quantity)}</td>
                  <td>{line.unit}</td>
                  <td className="text-right tabular-nums">{formatMoney(line.unit_price)}</td>
                  <td className="text-right tabular-nums">{formatMoney(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="keep-together mt-4 grid grid-cols-[1fr_18rem] gap-6">
            <div>
              <p className="print-shade rounded-md bg-paper px-3 py-2 text-center font-medium">
                ({bahtText(receipt.grand_total)})
              </p>
              <div className="mt-3">
                <p className="font-medium text-muted">ชำระโดย</p>
                <p className="flex flex-wrap gap-x-4">
                  {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((method) => (
                    <span key={method}>
                      {method === receipt.payment_method ? "☑" : "☐"} {PAYMENT_METHOD_LABEL[method]}
                    </span>
                  ))}
                </p>
                {receipt.payment_ref && <p>รายละเอียด: {receipt.payment_ref}</p>}
              </div>
              {receipt.notes && (
                <div className="mt-3">
                  <p className="font-medium text-muted">หมายเหตุ</p>
                  <p className="whitespace-pre-wrap">{receipt.notes}</p>
                </div>
              )}
            </div>
            <dl className="grid grid-cols-[1fr_auto] content-start gap-y-1 [&>dd]:pl-4">
              {tax.nonVatAmount > 0 ? (
                <>
                  <dt>มูลค่าสินค้า/บริการที่มีภาษี</dt>
                  <dd className="text-right tabular-nums">{formatMoney(vatBase)}</dd>
                  <dt>มูลค่าที่ไม่มีภาษีมูลค่าเพิ่ม</dt>
                  <dd className="text-right tabular-nums">{formatMoney(tax.nonVatAmount)}</dd>
                </>
              ) : (
                <>
                  <dt>มูลค่าสินค้า/บริการ</dt>
                  <dd className="text-right tabular-nums">{formatMoney(tax.subtotal)}</dd>
                </>
              )}
              <dt>ภาษีมูลค่าเพิ่ม{tax.vatRate !== null && ` ${tax.vatRate}%`}</dt>
              <dd className="text-right tabular-nums">{formatMoney(tax.vatAmount)}</dd>
              <dt className="border-t border-ink pt-1 font-semibold">จำนวนเงินรวมทั้งสิ้น</dt>
              <dd className="border-t border-ink pt-1 text-right font-semibold tabular-nums">
                {formatMoney(receipt.grand_total)}
              </dd>
              {receipt.wht_amount > 0 && (
                <>
                  <dt className="text-muted">หัก ภาษี ณ ที่จ่าย</dt>
                  <dd className="text-right text-muted tabular-nums">−{formatMoney(receipt.wht_amount)}</dd>
                  <dt className="font-semibold">รับชำระสุทธิ</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatMoney(receipt.net_total)}</dd>
                </>
              )}
            </dl>
          </section>

          {receipt.payment_method === "cheque" && (
            <p className="mt-4 text-muted">การชำระด้วยเช็คจะสมบูรณ์เมื่อเรียกเก็บเงินตามเช็คได้แล้ว</p>
          )}

          <PrintSignatures roles={["ผู้จ่ายเงิน", "ผู้รับเงิน"]} />
        </>
      )}
    </PrintSheet>
  );
}
