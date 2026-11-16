// The combined document list: quotations, invoices, billing notes, receipts and
// tax invoices issued on delivery, in one table.

import { todayTh } from "../format.ts";
import type { Db } from "./tx.ts";

export type ListType = "QT" | "IV" | "BL" | "RC" | "TX";

/**
 * One row of the combined list. Billing notes use the state issued / paid / cancelled,
 * receipts issued / cancelled. A receipt has no due date (due_date repeats its date).
 */
export type DocumentListRow = {
  id: string;
  type: ListType;
  status: string;
  doc_number: string;
  customer_name: string;
  issue_date: string;
  due_date: string;
  grand_total: number;
  net_total: number;
  is_overdue: boolean;
  has_invoice: boolean;
  has_tax_invoice: boolean;
};

export type ListFilter = {
  type?: string;
  /**
   * QT/IV: a document status or the virtual "unpaid" / "overdue".
   * Billing notes: "issued" (still collecting), "paid" (every invoice paid) or "cancelled".
   */
  status?: string;
  limit: number;
  offset: number;
};

const DOC_STATUSES = ["draft", "sent", "approved", "paid", "cancelled"];
export const BILLING_STATES = ["issued", "paid", "cancelled"];
export const RECEIPT_STATES = ["issued", "cancelled"];

const TAX_INVOICE_ROWS = `
  select t.id, 'TX' as type, t.status, t.doc_number, c.name as customer_name,
    t.tax_date as issue_date, t.tax_date as due_date, d.grand_total, d.net_total,
    0 as is_overdue, 0 as has_invoice, 0 as has_tax_invoice
  from tax_invoices t join documents d on d.id = t.invoice_id join customers c on c.id = d.customer_id`;

const RECEIPT_ROWS = `
  select r.id, 'RC' as type, r.status, r.doc_number, c.name as customer_name,
    r.receipt_date as issue_date, r.receipt_date as due_date,
    (select coalesce(sum(d.grand_total), 0) from receipt_items i join documents d on d.id = i.invoice_id
      where i.receipt_id = r.id) as grand_total,
    (select coalesce(sum(d.net_total), 0) from receipt_items i join documents d on d.id = i.invoice_id
      where i.receipt_id = r.id) as net_total,
    0 as is_overdue, 0 as has_invoice, 0 as has_tax_invoice
  from receipts r join customers c on c.id = r.customer_id`;

const BILLING_ROWS = `
  select b.id, 'BL' as type,
    case
      when b.status = 'cancelled' then 'cancelled'
      when not exists (
        select 1 from billing_note_items i join documents d on d.id = i.invoice_id
        where i.billing_note_id = b.id and d.status in ('sent', 'approved')
      ) then 'paid'
      else 'issued'
    end as status,
    b.doc_number, c.name as customer_name, b.issue_date, b.due_date,
    (select coalesce(sum(d.grand_total), 0) from billing_note_items i join documents d on d.id = i.invoice_id
      where i.billing_note_id = b.id) as grand_total,
    (select coalesce(sum(d.net_total), 0) from billing_note_items i join documents d on d.id = i.invoice_id
      where i.billing_note_id = b.id) as net_total,
    0 as is_overdue, 0 as has_invoice, 0 as has_tax_invoice
  from billing_notes b join customers c on c.id = b.customer_id`;

const DOCUMENT_ROWS = `
  select d.id, d.type, d.status, d.doc_number, c.name as customer_name, d.issue_date, d.due_date,
    d.grand_total, d.net_total,
    (d.type = 'IV' and d.status in ('sent', 'approved') and d.due_date < :today) as is_overdue,
    exists (select 1 from documents i where i.source_document_id = d.id and i.status <> 'cancelled') as has_invoice,
    exists (select 1 from tax_invoices t where t.invoice_id = d.id and t.status <> 'cancelled') as has_tax_invoice
  from documents d join customers c on c.id = d.customer_id`;

/** SQL condition for the QT/IV part, or null when the filter excludes them all. */
function documentCondition(type: string | undefined, status: string | undefined) {
  if (type === "BL" || type === "RC" || type === "TX") return null;
  const where: string[] = [];
  if (type === "QT" || type === "IV") where.push(`d.type = '${type}'`);
  if (status === "overdue") {
    where.push("d.type = 'IV' and d.status in ('sent', 'approved') and d.due_date < :today");
  } else if (status === "unpaid") {
    where.push("d.type = 'IV' and d.status in ('sent', 'approved')");
  } else if (status && DOC_STATUSES.includes(status)) {
    where.push(`d.status = '${status}'`);
  } else if (status) {
    return null; // a billing-only state such as "issued"
  }
  return where.length ? where.join(" and ") : "1 = 1";
}

/** Billing notes match "paid" and "cancelled" too, so those filters work across types. */
function billingCondition(type: string | undefined, status: string | undefined) {
  if (type && type !== "BL") return null;
  if (!status) return "1 = 1";
  return BILLING_STATES.includes(status) ? `status = '${status}'` : null;
}

/** Receipts and tax invoices share the states issued / cancelled. */
function issuedCondition(own: string, type: string | undefined, status: string | undefined) {
  if (type && type !== own) return null;
  if (!status) return "1 = 1";
  return RECEIPT_STATES.includes(status) ? `status = '${status}'` : null;
}

export function listAllDocuments(db: Db, filter: ListFilter) {
  // Only fixed strings from the whitelists above reach the SQL text.
  const docWhere = documentCondition(filter.type, filter.status);
  const billWhere = billingCondition(filter.type, filter.status);
  const receiptWhere = issuedCondition("RC", filter.type, filter.status);
  const taxWhere = issuedCondition("TX", filter.type, filter.status);
  const parts: string[] = [];
  if (docWhere) parts.push(`select * from (${DOCUMENT_ROWS} where ${docWhere})`);
  if (billWhere) parts.push(`select * from (${BILLING_ROWS}) where ${billWhere}`);
  if (receiptWhere) parts.push(`select * from (${RECEIPT_ROWS}) where ${receiptWhere}`);
  if (taxWhere) parts.push(`select * from (${TAX_INVOICE_ROWS}) where ${taxWhere}`);
  if (parts.length === 0) return { rows: [] as DocumentListRow[], total: 0 };

  const union = parts.join(" union all ");
  const params = { today: todayTh() };

  const countStmt = db.prepare(`select count(*) as total from (${union})`);
  countStmt.setAllowUnknownNamedParameters(true);
  const { total } = countStmt.get(params) as { total: number };

  const rowsStmt = db.prepare(
    `select * from (${union}) order by issue_date desc, doc_number desc limit :limit offset :offset`,
  );
  rowsStmt.setAllowUnknownNamedParameters(true);
  const rows = rowsStmt.all({ ...params, limit: filter.limit, offset: filter.offset }).map(
    (row) =>
      ({
        ...row,
        grand_total: Math.round(Number(row.grand_total) * 100) / 100,
        net_total: Math.round(Number(row.net_total) * 100) / 100,
        is_overdue: row.is_overdue === 1,
        has_invoice: row.has_invoice === 1,
        has_tax_invoice: row.has_tax_invoice === 1,
      }) as DocumentListRow,
  );
  return { rows, total };
}
