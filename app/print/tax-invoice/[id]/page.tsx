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
import { getTaxInvoiceDetail } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "พิมพ์ใบส่งของ/ใบกำกับภาษี" };

const qty = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 3 });

export default async function PrintTaxInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ copy?: string }>;
}) {
  const [{ id }, { copy }] = await Promise.all([params, searchParams]);
  const detail = await getTaxInvoiceDetail(id);
  if (!detail) notFound();
  const { taxInvoice, invoice, items, company, customer } = detail;

  // Seller and buyer as they were when the tax invoice was issued.
  const seller = {
    ...company,
    ...taxInvoice.seller,
    tax_id: taxInvoice.seller.tax_id ?? company.tax_id,
    branch: taxInvoice.seller.branch ?? company.branch,
  };
  const buyer = { ...customer, ...taxInvoice.buyer };
  const nonVat = Math.round(items.filter((i) => !i.vat_applicable).reduce((a, i) => a + i.amount * 100, 0)) / 100;

  return (
    <PrintSheet
      backHref={`/tax-invoices/${id}`}
      fileName={taxInvoice.doc_number}
      stamp={taxInvoice.status === "cancelled" ? "ยกเลิก" : undefined}
      copies={copyOption(copy).copies}
      toolbarExtra={<CopySelector href={`/print/tax-invoice/${id}`} current={copy} />}
    >
      {(copyLabel) => (
        <>
          <PrintHeader
            company={seller}
            title="ใบส่งของ/ใบกำกับภาษี"
            titleEn="Delivery Note/Tax Invoice"
            copyLabel={copyLabel}
          />
          <PrintParties
            customer={buyer}
            label="ผู้ซื้อ"
            facts={[
              ["เลขที่", taxInvoice.doc_number],
              ["วันที่", formatDate(taxInvoice.tax_date)],
              ["อ้างอิงใบแจ้งหนี้", invoice.doc_number],
              ["ครบกำหนดชำระ", formatDate(invoice.due_date)],
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

          <section className="keep-together mt-4 grid grid-cols-[1fr_18rem] gap-6">
            <div>
              <p className="print-shade rounded-md bg-paper px-3 py-2 text-center font-medium">
                ({bahtText(invoice.grand_total)})
              </p>
              {taxInvoice.notes && (
                <div className="mt-3">
                  <p className="font-medium text-muted">หมายเหตุ</p>
                  <p className="whitespace-pre-wrap">{taxInvoice.notes}</p>
                </div>
              )}
            </div>
            <dl className="grid grid-cols-[1fr_auto] content-start gap-y-1 [&>dd]:pl-4">
              {nonVat > 0 ? (
                <>
                  <dt>มูลค่าสินค้า/บริการที่มีภาษี</dt>
                  <dd className="text-right tabular-nums">
                    {formatMoney(Math.round((invoice.subtotal - nonVat) * 100) / 100)}
                  </dd>
                  <dt>มูลค่าที่ไม่มีภาษีมูลค่าเพิ่ม</dt>
                  <dd className="text-right tabular-nums">{formatMoney(nonVat)}</dd>
                </>
              ) : (
                <>
                  <dt>มูลค่าสินค้า/บริการ</dt>
                  <dd className="text-right tabular-nums">{formatMoney(invoice.subtotal)}</dd>
                </>
              )}
              <dt>ภาษีมูลค่าเพิ่ม {invoice.vat_rate}%</dt>
              <dd className="text-right tabular-nums">{formatMoney(invoice.vat_amount)}</dd>
              <dt className="border-t border-ink pt-1 font-semibold">จำนวนเงินรวมทั้งสิ้น</dt>
              <dd className="border-t border-ink pt-1 text-right font-semibold tabular-nums">
                {formatMoney(invoice.grand_total)}
              </dd>
            </dl>
          </section>

          <p className="keep-together mt-10 text-center">ได้รับสินค้าตามรายการข้างต้นไว้ถูกต้องและอยู่ในสภาพเรียบร้อยแล้ว</p>
          <PrintSignatures roles={["ผู้ส่งสินค้า", "ผู้รับสินค้า"]} />
        </>
      )}
    </PrintSheet>
  );
}
