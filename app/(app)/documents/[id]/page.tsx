import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentActions } from "@/components/document-actions";
import { DocumentBuilder } from "@/components/document-builder";
import { PageHeader, StatusBadge, TotalsList } from "@/components/ui";
import { getDocumentDetail, listCustomers, listProducts } from "@/lib/data";
import { editBlockReason } from "@/lib/document-rules";
import { DOC_TYPE_LABEL, formatDate, formatMoney, todayTh } from "@/lib/format";
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getDocumentDetail(id);
  if (!detail) notFound();
  const { doc, items, company, customer, source, invoice, billingNote, receipt, taxInvoice, taxInvoiceBlocked } =
    detail;
  const canIssueTaxInvoice = doc.type === "IV" && doc.status !== "draft" && !taxInvoiceBlocked;
  const canBill = doc.type === "IV" && (doc.status === "sent" || doc.status === "approved") && !billingNote;

  const actions = <DocumentActions doc={doc} invoice={invoice} receipt={receipt} />;
  const header = (
    <PageHeader
      title={
        <span className="flex flex-wrap items-center gap-2">
          {doc.doc_number}
          <StatusBadge status={doc.status} overdue={doc.is_overdue} />
        </span>
      }
      subtitle={
        <>
          {DOC_TYPE_LABEL[doc.type]}
          {source && (
            <>
              {" · อ้างอิง "}
              <Link href={`/documents/${source.id}`} className="text-accent hover:underline">
                {source.doc_number}
              </Link>
            </>
          )}
          {taxInvoice && (
            <>
              {" · ใบกำกับภาษี "}
              <Link href={`/tax-invoices/${taxInvoice.id}`} className="text-accent hover:underline">
                {taxInvoice.doc_number}
              </Link>
            </>
          )}
          {receipt && (
            <>
              {" · ชำระโดยใบเสร็จ "}
              <Link href={`/receipts/${receipt.id}`} className="text-accent hover:underline">
                {receipt.doc_number}
              </Link>
            </>
          )}
          {billingNote && (
            <>
              {" · อยู่ในใบวางบิล "}
              <Link href={`/billing-notes/${billingNote.id}`} className="text-accent hover:underline">
                {billingNote.doc_number}
              </Link>
            </>
          )}
        </>
      }
      actions={
        <>
          {doc.status !== "draft" && !editBlockReason(doc) && (
            <Link href={`/documents/${doc.id}/edit`} className="btn">
              แก้ไข
            </Link>
          )}
          <Link href={`/print/${doc.id}`} target="_blank" className="btn">
            พิมพ์ / PDF
          </Link>
          {canIssueTaxInvoice && (
            <Link href={`/tax-invoices/new?invoice=${doc.id}`} className="btn">
              ส่งมอบสินค้า / ออกใบกำกับภาษี
            </Link>
          )}
          {canBill && (
            <Link href={`/billing-notes/new?customer=${doc.customer_id}&invoice=${doc.id}`} className="btn">
              สร้างใบวางบิล
            </Link>
          )}
        </>
      }
    />
  );

  if (doc.status === "draft") {
    return (
      <>
        {header}
        <DocumentBuilder
          key={doc.id}
          type={doc.type}
          today={todayTh()}
          company={company}
          customers={await listCustomers()}
          products={await listProducts()}
          document={doc}
          items={items}
          actions={actions}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="mb-4">{actions}</div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="card p-4 text-sm">
          <h2 className="mb-1 font-medium text-muted">ผู้ออกเอกสาร</h2>
          <p className="font-medium">{company.name}</p>
          <p className="text-muted">{company.address}</p>
          <p className="text-muted">
            เลขผู้เสียภาษี {company.tax_id} ({company.branch})
          </p>
        </section>
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
      </div>

      <dl className="card mt-3 grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">วันที่เอกสาร</dt>
          <dd>{formatDate(doc.issue_date)}</dd>
        </div>
        <div>
          <dt className="text-muted">{doc.type === "QT" ? "ยืนราคาถึง" : "ครบกำหนดชำระ"}</dt>
          <dd>{formatDate(doc.due_date)}</dd>
        </div>
        {doc.paid_at && (
          <div>
            <dt className="text-muted">วันที่ชำระ</dt>
            <dd>{formatDate(doc.paid_at)}</dd>
          </div>
        )}
      </dl>

      <div className="card table-scroll mt-3">
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

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="card p-4 text-sm">
          <h2 className="mb-1 font-medium text-muted">หมายเหตุ</h2>
          <p className="whitespace-pre-wrap">{doc.notes || "–"}</p>
          {company.bank_name && (
            <>
              <h2 className="mt-3 mb-1 font-medium text-muted">บัญชีรับชำระ</h2>
              <p>{company.bank_name}</p>
              <p className="text-muted">
                {company.bank_account_name} · {company.bank_account_no}
              </p>
            </>
          )}
        </section>
        <section className="card p-4">
          <TotalsList
            totals={{
              subtotal: doc.subtotal,
              vatAmount: doc.vat_amount,
              grandTotal: doc.grand_total,
              whtAmount: doc.wht_amount,
              netTotal: doc.net_total,
            }}
            vatRate={doc.vat_rate}
            whtRate={doc.wht_rate}
          />
        </section>
      </div>
    </>
  );
}
