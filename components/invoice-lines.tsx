import { TotalsList } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { DocumentItem, DocumentSummary } from "@/lib/types";

/** Read-only items and totals of an invoice, for the tax invoice pages. */
export function InvoiceLines({ invoice, items }: { invoice: DocumentSummary; items: DocumentItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="card table-scroll">
        <table className="data-table min-w-[640px]">
          <thead>
            <tr>
              <th>#</th>
              <th>รายการ</th>
              <th className="num">จำนวน</th>
              <th>หน่วย</th>
              <th className="num">ราคา/หน่วย</th>
              <th>VAT</th>
              <th className="num">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td>{index + 1}</td>
                <td>{item.description}</td>
                <td className="num">{item.quantity.toLocaleString("th-TH")}</td>
                <td>{item.unit}</td>
                <td className="num">{formatMoney(item.unit_price)}</td>
                <td>{item.vat_applicable ? "คิด" : "ไม่คิด"}</td>
                <td className="num">{formatMoney(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card p-4 md:ml-auto md:w-96">
        <TotalsList
          totals={{
            subtotal: invoice.subtotal,
            vatAmount: invoice.vat_amount,
            grandTotal: invoice.grand_total,
            whtAmount: invoice.wht_amount,
            netTotal: invoice.net_total,
          }}
          vatRate={invoice.vat_rate}
          whtRate={invoice.wht_rate}
        />
      </section>
    </div>
  );
}
