// Tax invoices issued on delivery of goods (ใบส่งของ/ใบกำกับภาษี).
// For goods the VAT tax point is delivery, which often comes before payment. Rules:
//   - only for a VAT-registered company
//   - the invoice must be issued (sent, approved or paid) and the date not before it
//   - one live tax invoice per invoice, and none when a tax-invoice receipt already covers it
//   - seller and buyer are fixed at issue; a tax invoice is not edited, only cancelled and reissued
//   - while it is live the invoice cannot be edited or cancelled, and its receipt is a plain receipt

import { randomUUID } from "node:crypto";
import { todayTh } from "../format.ts";
import type { TaxInvoiceSummary, TaxParty } from "../types.ts";
import { AppError, getCompany, getCustomer, getDocument, nextDocNumber } from "./store.ts";
import { transaction, type Db } from "./tx.ts";

type Row = Record<string, unknown>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SELECT = `
  select t.id, t.invoice_id, d.doc_number as invoice_number, d.customer_id, c.name as customer_name,
    t.doc_number, t.tax_date, t.notes, t.status, t.seller_snapshot, t.buyer_snapshot
  from tax_invoices t
  join documents d on d.id = t.invoice_id
  join customers c on c.id = d.customer_id`;

function toSummary(row: Row): TaxInvoiceSummary {
  const { seller_snapshot, buyer_snapshot, ...rest } = row;
  return {
    ...rest,
    seller: JSON.parse(String(seller_snapshot)) as TaxParty,
    buyer: JSON.parse(String(buyer_snapshot)) as TaxParty,
  } as TaxInvoiceSummary;
}

export function getTaxInvoice(db: Db, id: string): TaxInvoiceSummary | null {
  const row = db.prepare(`${SELECT} where t.id = ?`).get(id);
  return row ? toSummary(row) : null;
}

/** The live tax invoice of an invoice, if any. */
export function taxInvoiceForInvoice(db: Db, invoiceId: string) {
  const row = db
    .prepare("select id, doc_number from tax_invoices where invoice_id = ? and status <> 'cancelled'")
    .get(invoiceId) as { id: string; doc_number: string } | undefined;
  return row ? { ...row } : null;
}

/** Why a tax invoice cannot be issued for this invoice now, or null when it can. */
export function taxInvoiceBlockReason(db: Db, invoiceId: string): string | null {
  const company = getCompany(db);
  if (!company?.vat_registered) return "บริษัทยังไม่ได้ตั้งค่าเป็นผู้จดทะเบียนภาษีมูลค่าเพิ่ม";
  const invoice = getDocument(db, invoiceId);
  if (!invoice || invoice.type !== "IV") return "ไม่พบใบแจ้งหนี้";
  if (invoice.status === "draft") return "ต้องส่งใบแจ้งหนี้ก่อนจึงจะออกใบกำกับภาษีได้";
  if (invoice.status === "cancelled") return "ใบแจ้งหนี้นี้ถูกยกเลิกแล้ว";
  if (invoice.has_tax_invoice) return "ใบแจ้งหนี้นี้ออกใบกำกับภาษีแล้ว";
  const coveredByReceipt = db
    .prepare(
      `select 1 from receipt_items i join receipts r on r.id = i.receipt_id
       where i.invoice_id = ? and r.status <> 'cancelled' and r.is_tax_invoice = 1`,
    )
    .get(invoiceId);
  if (coveredByReceipt) return "ใบแจ้งหนี้นี้มีใบเสร็จรับเงิน/ใบกำกับภาษีแล้ว";
  return null;
}

function party(who: { name: string; address: string; tax_id: string | null; branch: string | null }): TaxParty {
  return { name: who.name, address: who.address, tax_id: who.tax_id, branch: who.branch };
}

export function issueTaxInvoice(db: Db, invoiceId: string, input: { tax_date: string; notes: string }): string {
  return transaction(db, () => {
    const blocked = taxInvoiceBlockReason(db, invoiceId);
    if (blocked) throw new AppError(blocked);
    if (!DATE_RE.test(input.tax_date)) throw new AppError("รูปแบบวันที่ไม่ถูกต้อง");
    if (input.tax_date > todayTh()) throw new AppError("วันที่ส่งมอบต้องไม่เป็นวันในอนาคต");
    const invoice = getDocument(db, invoiceId)!;
    if (input.tax_date < invoice.issue_date) {
      throw new AppError("วันที่ส่งมอบต้องไม่ก่อนวันที่ของใบแจ้งหนี้");
    }

    const company = getCompany(db)!;
    const id = randomUUID();
    db.prepare(
      `insert into tax_invoices (id, company_id, invoice_id, doc_number, tax_date, notes, seller_snapshot, buyer_snapshot)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      company.id,
      invoiceId,
      nextDocNumber(db, "TX", input.tax_date),
      input.tax_date,
      input.notes?.trim() || null,
      JSON.stringify(party(company)),
      JSON.stringify(party(getCustomer(db, invoice.customer_id)!)),
    );
    return id;
  });
}

/** Cancelling unlocks the invoice; a new tax invoice can then be issued. */
export function cancelTaxInvoice(db: Db, id: string) {
  const { changes } = db
    .prepare("update tax_invoices set status = 'cancelled' where id = ? and status <> 'cancelled'")
    .run(id);
  if (changes === 0) throw new AppError("ไม่พบใบกำกับภาษี หรือถูกยกเลิกไปแล้ว");
}
