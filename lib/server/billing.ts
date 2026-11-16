// Billing notes (ใบวางบิล): a list of a customer's issued, unpaid invoices handed over
// for collection. Rules:
//   - only invoices that are sent or approved (issued and not yet paid) can be added
//   - an invoice can be on one active (not cancelled) billing note at a time
//   - all invoices belong to the note's customer
//   - amounts come live from the invoices; a cancelled note can no longer be edited

import { randomUUID } from "node:crypto";
import { todayTh } from "../format.ts";
import type { BillableInvoice, BillingNoteInput, BillingNoteSummary } from "../types.ts";
import { AppError, getCompany, getCustomer, nextDocNumber } from "./store.ts";
import { transaction, type Db } from "./tx.ts";

type Row = Record<string, unknown>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function money(value: unknown) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

const SUMMARY_SELECT = `
  select b.id, b.customer_id, c.name as customer_name, b.doc_number, b.issue_date, b.due_date,
    b.status, b.notes,
    count(d.id) as invoice_count,
    coalesce(sum(d.status in ('sent', 'approved')), 0) as open_count,
    coalesce(sum(d.grand_total), 0) as grand_total,
    coalesce(sum(d.wht_amount), 0) as wht_amount,
    coalesce(sum(d.net_total), 0) as net_total
  from billing_notes b
  join customers c on c.id = b.customer_id
  left join billing_note_items i on i.billing_note_id = b.id
  left join documents d on d.id = i.invoice_id`;

function toSummary(row: Row): BillingNoteSummary {
  return {
    ...row,
    grand_total: money(row.grand_total),
    wht_amount: money(row.wht_amount),
    net_total: money(row.net_total),
  } as BillingNoteSummary;
}

const INVOICE_COLUMNS = `d.id, d.customer_id, d.doc_number, d.issue_date, d.due_date, d.status,
  d.grand_total, d.wht_amount, d.net_total,
  (d.status in ('sent', 'approved') and d.due_date < :today) as is_overdue`;

function toInvoice(row: Row): BillableInvoice {
  return { ...row, is_overdue: row.is_overdue === 1 } as BillableInvoice;
}

export function listBillingNotes(db: Db): BillingNoteSummary[] {
  return db
    .prepare(`${SUMMARY_SELECT} group by b.id order by b.issue_date desc, b.doc_number desc`)
    .all()
    .map(toSummary);
}

export function getBillingNote(db: Db, id: string) {
  const row = db.prepare(`${SUMMARY_SELECT} where b.id = ? group by b.id`).get(id);
  if (!row) return null;
  const invoices = db
    .prepare(
      `select ${INVOICE_COLUMNS}
       from billing_note_items i join documents d on d.id = i.invoice_id
       where i.billing_note_id = :id order by i.position`,
    )
    .all({ id, today: todayTh() })
    .map(toInvoice);
  return { note: toSummary(row), invoices };
}

/**
 * Invoices that can go on a billing note: issued and unpaid, and not already on another
 * active note. When editing, the note's own invoices are offered too.
 */
export function listBillableInvoices(db: Db, noteId: string | null = null): BillableInvoice[] {
  return db
    .prepare(
      `select ${INVOICE_COLUMNS}
       from documents d
       where d.type = 'IV'
         and (
           (d.status in ('sent', 'approved') and not exists (
             select 1 from billing_note_items i join billing_notes b on b.id = i.billing_note_id
             where i.invoice_id = d.id and b.status <> 'cancelled' and b.id <> :note
           ))
           or d.id in (select invoice_id from billing_note_items where billing_note_id = :note)
         )
       order by d.issue_date, d.doc_number`,
    )
    .all({ note: noteId ?? "", today: todayTh() })
    .map(toInvoice);
}

/** The active billing note an invoice is on, if any. */
export function billingNoteForInvoice(db: Db, invoiceId: string) {
  const row = db
    .prepare(
      `select b.id, b.doc_number from billing_note_items i join billing_notes b on b.id = i.billing_note_id
       where i.invoice_id = ? and b.status <> 'cancelled'`,
    )
    .get(invoiceId) as { id: string; doc_number: string } | undefined;
  return row ? { ...row } : null;
}

export function saveBillingNote(db: Db, id: string | null, input: BillingNoteInput): string {
  if (!input.customer_id || !getCustomer(db, input.customer_id)) throw new AppError("กรุณาเลือกลูกค้า");
  if (!DATE_RE.test(input.issue_date) || !DATE_RE.test(input.due_date)) {
    throw new AppError("รูปแบบวันที่ไม่ถูกต้อง");
  }
  if (input.due_date < input.issue_date) throw new AppError("วันนัดชำระต้องไม่ก่อนวันที่วางบิล");
  const invoiceIds = [...new Set(input.invoice_ids ?? [])];
  if (invoiceIds.length === 0) throw new AppError("กรุณาเลือกใบแจ้งหนี้อย่างน้อย 1 ใบ");
  const notes = input.notes?.trim() || null;

  return transaction(db, () => {
    if (id) {
      const current = db.prepare("select status from billing_notes where id = ?").get(id) as
        | { status: string }
        | undefined;
      if (!current) throw new AppError("ไม่พบใบวางบิล");
      if (current.status === "cancelled") throw new AppError("ใบวางบิลที่ยกเลิกแล้วแก้ไขไม่ได้");
    }

    const billable = new Map(listBillableInvoices(db, id).map((inv) => [inv.id, inv]));
    for (const invoiceId of invoiceIds) {
      const invoice = billable.get(invoiceId);
      if (!invoice) {
        throw new AppError("มีใบแจ้งหนี้ที่วางบิลไม่ได้ (ยังไม่ส่ง ชำระแล้ว หรืออยู่ในใบวางบิลอื่น)");
      }
      if (invoice.customer_id !== input.customer_id) {
        throw new AppError(`ใบแจ้งหนี้ ${invoice.doc_number} เป็นของลูกค้ารายอื่น`);
      }
    }

    let noteId = id;
    if (noteId) {
      db.prepare(
        "update billing_notes set customer_id = ?, issue_date = ?, due_date = ?, notes = ? where id = ?",
      ).run(input.customer_id, input.issue_date, input.due_date, notes, noteId);
      db.prepare("delete from billing_note_items where billing_note_id = ?").run(noteId);
    } else {
      const company = getCompany(db);
      if (!company) throw new AppError("ยังไม่มีข้อมูลบริษัทผู้ออกเอกสาร");
      noteId = randomUUID();
      db.prepare(
        `insert into billing_notes (id, company_id, customer_id, doc_number, issue_date, due_date, notes)
         values (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        noteId,
        company.id,
        input.customer_id,
        nextDocNumber(db, "BL", input.issue_date),
        input.issue_date,
        input.due_date,
        notes,
      );
    }

    const insert = db.prepare(
      "insert into billing_note_items (billing_note_id, invoice_id, position) values (?, ?, ?)",
    );
    invoiceIds.forEach((invoiceId, index) => insert.run(noteId, invoiceId, index + 1));
    return noteId;
  });
}

/** Cancelling frees its invoices for another billing note. It cannot be undone. */
export function cancelBillingNote(db: Db, id: string) {
  const { changes } = db
    .prepare("update billing_notes set status = 'cancelled' where id = ? and status <> 'cancelled'")
    .run(id);
  if (changes === 0) throw new AppError("ไม่พบใบวางบิล หรือถูกยกเลิกไปแล้ว");
}
