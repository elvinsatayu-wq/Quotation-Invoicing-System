// Receipts (ใบเสร็จรับเงิน): proof of payment for one or more invoices of one customer.
// Rules:
//   - an invoice can be paid by one active (not cancelled) receipt
//   - invoices must be issued: sent or approved, or already marked paid without a receipt
//     (so receipts can be issued after the fact)
//   - issuing marks every invoice paid on the receipt date
//   - the invoices on a receipt are fixed; the date, payment details and notes can be edited
//   - cancelling restores each invoice's previous status and paid date
//   - if the company is VAT registered the receipt is also a full tax invoice
//     (ใบเสร็จรับเงิน/ใบกำกับภาษี, Revenue Code s.86/4): seller and buyer details are
//     fixed at issue and its date cannot change (cancel and reissue instead) - unless its
//     invoices already have tax invoices issued on delivery, then it is a plain receipt
//     (invoices with and without one cannot share a receipt)

import { randomUUID } from "node:crypto";
import { todayTh } from "../format.ts";
import type {
  BillableInvoice,
  Company,
  Customer,
  PaymentMethod,
  ReceiptInput,
  ReceiptSummary,
  TaxParty,
} from "../types.ts";
import { AppError, getCompany, getCustomer, nextDocNumber } from "./store.ts";
import { transaction, type Db } from "./tx.ts";

type Row = Record<string, unknown>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const METHODS: PaymentMethod[] = ["cash", "transfer", "cheque", "other"];

function money(value: unknown) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

const SUMMARY_SELECT = `
  select r.id, r.customer_id, c.name as customer_name, r.doc_number, r.receipt_date,
    r.payment_method, r.payment_ref, r.notes, r.status,
    r.is_tax_invoice, r.seller_snapshot, r.buyer_snapshot,
    count(d.id) as invoice_count,
    coalesce(sum(d.grand_total), 0) as grand_total,
    coalesce(sum(d.wht_amount), 0) as wht_amount,
    coalesce(sum(d.net_total), 0) as net_total
  from receipts r
  join customers c on c.id = r.customer_id
  left join receipt_items i on i.receipt_id = r.id
  left join documents d on d.id = i.invoice_id`;

function party(json: unknown): TaxParty | null {
  return typeof json === "string" ? (JSON.parse(json) as TaxParty) : null;
}

function toSummary(row: Row): ReceiptSummary {
  const { seller_snapshot, buyer_snapshot, ...rest } = row;
  return {
    ...rest,
    is_tax_invoice: row.is_tax_invoice === 1,
    seller: party(seller_snapshot),
    buyer: party(buyer_snapshot),
    grand_total: money(row.grand_total),
    wht_amount: money(row.wht_amount),
    net_total: money(row.net_total),
  } as ReceiptSummary;
}

const INVOICE_COLUMNS = `d.id, d.customer_id, d.doc_number, d.issue_date, d.due_date, d.status,
  d.grand_total, d.wht_amount, d.net_total,
  (d.status in ('sent', 'approved') and d.due_date < :today) as is_overdue,
  exists (select 1 from tax_invoices t where t.invoice_id = d.id and t.status <> 'cancelled') as has_tax_invoice`;

function toInvoice(row: Row): BillableInvoice {
  return { ...row, is_overdue: row.is_overdue === 1, has_tax_invoice: row.has_tax_invoice === 1 } as BillableInvoice;
}

const ON_ACTIVE_RECEIPT = `exists (
  select 1 from receipt_items i join receipts r on r.id = i.receipt_id
  where i.invoice_id = d.id and r.status <> 'cancelled')`;

export function getReceipt(db: Db, id: string) {
  const row = db.prepare(`${SUMMARY_SELECT} where r.id = ? group by r.id`).get(id);
  if (!row) return null;
  const invoices = db
    .prepare(
      `select ${INVOICE_COLUMNS}
       from receipt_items i join documents d on d.id = i.invoice_id
       where i.receipt_id = :id order by i.position`,
    )
    .all({ id, today: todayTh() })
    .map(toInvoice);
  return { receipt: toSummary(row), invoices };
}

/** Invoices a new receipt can pay: issued, and not already on an active receipt. */
export function listReceivableInvoices(db: Db): BillableInvoice[] {
  return db
    .prepare(
      `select ${INVOICE_COLUMNS} from documents d
       where d.type = 'IV' and d.status in ('sent', 'approved', 'paid') and not ${ON_ACTIVE_RECEIPT}
       order by d.issue_date, d.doc_number`,
    )
    .all({ today: todayTh() })
    .map(toInvoice);
}

/** The active receipt that paid an invoice, if any. */
export function receiptForInvoice(db: Db, invoiceId: string) {
  const row = db
    .prepare(
      `select r.id, r.doc_number from receipt_items i join receipts r on r.id = i.receipt_id
       where i.invoice_id = ? and r.status <> 'cancelled'`,
    )
    .get(invoiceId) as { id: string; doc_number: string } | undefined;
  return row ? { ...row } : null;
}

function validateHeader(db: Db, input: ReceiptInput) {
  if (!input.customer_id || !getCustomer(db, input.customer_id)) throw new AppError("กรุณาเลือกลูกค้า");
  if (!DATE_RE.test(input.receipt_date)) throw new AppError("รูปแบบวันที่ไม่ถูกต้อง");
  if (input.receipt_date > todayTh()) throw new AppError("วันที่รับเงินต้องไม่เป็นวันในอนาคต");
  if (!METHODS.includes(input.payment_method)) throw new AppError("กรุณาเลือกวิธีชำระเงิน");
}

/** Creates a receipt (id null) or edits its date, payment details and notes. */
export function saveReceipt(db: Db, id: string | null, input: ReceiptInput): string {
  validateHeader(db, input);
  const paymentRef = input.payment_ref?.trim() || null;
  const notes = input.notes?.trim() || null;

  return transaction(db, () => {
    if (id) {
      const current = db
        .prepare("select status, customer_id, receipt_date, is_tax_invoice from receipts where id = ?")
        .get(id) as { status: string; customer_id: string; receipt_date: string; is_tax_invoice: number } | undefined;
      if (!current) throw new AppError("ไม่พบใบเสร็จรับเงิน");
      if (current.status === "cancelled") throw new AppError("ใบเสร็จที่ยกเลิกแล้วแก้ไขไม่ได้");
      if (current.customer_id !== input.customer_id) {
        throw new AppError("เปลี่ยนลูกค้าของใบเสร็จไม่ได้ ให้ยกเลิกแล้วออกใบใหม่");
      }
      if (current.is_tax_invoice === 1 && current.receipt_date !== input.receipt_date) {
        throw new AppError("วันที่ของใบกำกับภาษีแก้ไขไม่ได้ ให้ยกเลิกแล้วออกใบใหม่");
      }
      db.prepare(
        "update receipts set receipt_date = ?, payment_method = ?, payment_ref = ?, notes = ? where id = ?",
      ).run(input.receipt_date, input.payment_method, paymentRef, notes, id);
      // The invoices were paid on the receipt date.
      db.prepare(
        `update documents set paid_at = ? where id in (select invoice_id from receipt_items where receipt_id = ?)`,
      ).run(input.receipt_date, id);
      return id;
    }

    const invoiceIds = [...new Set(input.invoice_ids ?? [])];
    if (invoiceIds.length === 0) throw new AppError("กรุณาเลือกใบแจ้งหนี้อย่างน้อย 1 ใบ");
    const receivable = new Map(listReceivableInvoices(db).map((inv) => [inv.id, inv]));
    for (const invoiceId of invoiceIds) {
      const invoice = receivable.get(invoiceId);
      if (!invoice) {
        throw new AppError("มีใบแจ้งหนี้ที่ออกใบเสร็จไม่ได้ (ยังไม่ส่ง ยกเลิกแล้ว หรือมีใบเสร็จอยู่แล้ว)");
      }
      if (invoice.customer_id !== input.customer_id) {
        throw new AppError(`ใบแจ้งหนี้ ${invoice.doc_number} เป็นของลูกค้ารายอื่น`);
      }
      if (invoice.issue_date > input.receipt_date) {
        throw new AppError(`วันที่รับเงินต้องไม่ก่อนวันที่ของใบแจ้งหนี้ ${invoice.doc_number}`);
      }
    }

    const withTaxInvoice = invoiceIds.filter((invoiceId) => receivable.get(invoiceId)!.has_tax_invoice);
    if (withTaxInvoice.length > 0 && withTaxInvoice.length < invoiceIds.length) {
      throw new AppError(
        "ใบแจ้งหนี้ที่ออกใบกำกับภาษีแล้วกับที่ยังไม่ได้ออก ต้องออกใบเสร็จแยกกัน",
      );
    }

    const company = getCompany(db);
    if (!company) throw new AppError("ยังไม่มีข้อมูลบริษัทผู้ออกเอกสาร");
    const receiptId = randomUUID();
    // VAT was already invoiced on delivery, so this receipt must not be a second tax invoice.
    const taxInvoice = company.vat_registered && withTaxInvoice.length === 0;
    db.prepare(
      `insert into receipts (id, company_id, customer_id, doc_number, receipt_date, payment_method, payment_ref,
         notes, is_tax_invoice, seller_snapshot, buyer_snapshot)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      receiptId,
      company.id,
      input.customer_id,
      nextDocNumber(db, "RC", input.receipt_date),
      input.receipt_date,
      input.payment_method,
      paymentRef,
      notes,
      taxInvoice ? 1 : 0,
      taxInvoice ? JSON.stringify(toParty(company)) : null,
      taxInvoice ? JSON.stringify(toParty(getCustomer(db, input.customer_id)!)) : null,
    );

    const previous = db.prepare("select status, paid_at from documents where id = ?");
    const insert = db.prepare(
      `insert into receipt_items (receipt_id, invoice_id, position, prev_status, prev_paid_at)
       values (?, ?, ?, ?, ?)`,
    );
    const markPaid = db.prepare("update documents set status = 'paid', paid_at = ? where id = ?");
    invoiceIds.forEach((invoiceId, index) => {
      const before = previous.get(invoiceId) as { status: string; paid_at: string | null };
      insert.run(receiptId, invoiceId, index + 1, before.status, before.paid_at);
      markPaid.run(input.receipt_date, invoiceId);
    });
    return receiptId;
  });
}

function toParty(who: Company | Customer): TaxParty {
  return { name: who.name, address: who.address, tax_id: who.tax_id ?? null, branch: who.branch ?? null };
}

/** Cancels a receipt and puts each invoice back the way it was before the receipt. */
export function cancelReceipt(db: Db, id: string) {
  transaction(db, () => {
    const { changes } = db
      .prepare("update receipts set status = 'cancelled' where id = ? and status <> 'cancelled'")
      .run(id);
    if (changes === 0) throw new AppError("ไม่พบใบเสร็จรับเงิน หรือถูกยกเลิกไปแล้ว");
    db.prepare(
      `update documents set
         status  = (select prev_status from receipt_items where receipt_id = :id and invoice_id = documents.id),
         paid_at = (select prev_paid_at from receipt_items where receipt_id = :id and invoice_id = documents.id)
       where id in (select invoice_id from receipt_items where receipt_id = :id) and status = 'paid'`,
    ).run({ id });
  });
}
