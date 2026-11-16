// Data access and business rules. Every write goes through these functions,
// so the document rules (numbering, editable drafts, status moves) live in one place.

import { randomUUID } from "node:crypto";
import { calcTotals, lineAmount } from "../calc.ts";
import { editBlockReason } from "../document-rules.ts";
import { addDays, todayTh } from "../format.ts";
import type {
  Company,
  Customer,
  DashboardSummary,
  DocStatus,
  DocType,
  DocumentInput,
  DocumentItem,
  DocumentItemInput,
  DocumentSummary,
  Product,
} from "../types.ts";
import { transaction, type Db } from "./tx.ts";

/** An error whose message is safe and meant to be shown to the user. */
export class AppError extends Error {}

type Row = Record<string, unknown>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TAX_ID_RE = /^\d{13}$/;

function isDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value) && !Number.isNaN(Date.parse(value));
}

/** Rounds sums of REAL money columns back to satang. */
function money(value: unknown) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

// ---------------------------------------------------------------- companies

function toCompany(row: Row): Company {
  return { ...row, vat_registered: row.vat_registered === 1 } as Company;
}

export function getCompany(db: Db): Company | null {
  const row = db.prepare("select * from companies order by created_at, id limit 1").get();
  return row ? toCompany(row) : null;
}

export function getCompanyById(db: Db, id: string): Company {
  return toCompany(db.prepare("select * from companies where id = ?").get(id) as Row);
}

export type CompanyInput = Omit<Company, "id">;

/**
 * Saves the one issuing company (creating it if the database has none) and points every
 * document at it, so all quotations and invoices print with the same, current details.
 */
export function saveCompany(db: Db, values: CompanyInput): string {
  if (!values.name.trim()) throw new AppError("กรุณากรอกชื่อบริษัท");
  if (!values.address.trim()) throw new AppError("กรุณากรอกที่อยู่บริษัท");
  if (!TAX_ID_RE.test(values.tax_id)) throw new AppError("เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก");
  const branch = values.branch.trim() || "สำนักงานใหญ่";
  const params = [
    values.name,
    values.address,
    values.tax_id,
    branch,
    values.phone,
    values.email,
    values.logo_url,
    values.bank_name,
    values.bank_account_name,
    values.bank_account_no,
    values.vat_registered ? 1 : 0,
  ];

  return transaction(db, () => {
    const current = getCompany(db);
    let id = current?.id;
    if (id) {
      db.prepare(
        `update companies set name = ?, address = ?, tax_id = ?, branch = ?, phone = ?, email = ?,
           logo_url = ?, bank_name = ?, bank_account_name = ?, bank_account_no = ?, vat_registered = ?
         where id = ?`,
      ).run(...params, id);
    } else {
      id = randomUUID();
      db.prepare(
        `insert into companies (name, address, tax_id, branch, phone, email, logo_url,
           bank_name, bank_account_name, bank_account_no, vat_registered, id)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(...params, id);
    }
    db.prepare("update documents set company_id = ? where company_id <> ?").run(id, id);
    return id;
  });
}

// ---------------------------------------------------------------- customers

export type CustomerInput = Omit<Customer, "id">;

export function listCustomers(db: Db): Customer[] {
  return db.prepare("select * from customers order by name").all().map((r) => ({ ...r }) as Customer);
}

export function getCustomer(db: Db, id: string): Customer | null {
  const row = db.prepare("select * from customers where id = ?").get(id);
  return row ? ({ ...row } as Customer) : null;
}

function validateCustomer(values: CustomerInput) {
  if (!values.name.trim()) throw new AppError("กรุณากรอกชื่อลูกค้า");
  if (values.tax_id && !TAX_ID_RE.test(values.tax_id)) {
    throw new AppError("เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก");
  }
  if (!Number.isInteger(values.credit_term_days) || values.credit_term_days < 0) {
    throw new AppError("เครดิตเทอมต้องเป็นจำนวนวันเต็ม ตั้งแต่ 0 ขึ้นไป");
  }
}

export function saveCustomer(db: Db, id: string | null, values: CustomerInput): string {
  validateCustomer(values);
  const params = [
    values.name,
    values.address,
    values.tax_id,
    values.branch,
    values.contact_name,
    values.phone,
    values.email,
    values.credit_term_days,
  ];
  if (id) {
    const { changes } = db
      .prepare(
        `update customers set name = ?, address = ?, tax_id = ?, branch = ?, contact_name = ?,
           phone = ?, email = ?, credit_term_days = ? where id = ?`,
      )
      .run(...params, id);
    if (changes === 0) throw new AppError("ไม่พบลูกค้ารายนี้");
    return id;
  }
  const newId = randomUUID();
  db.prepare(
    `insert into customers
       (id, name, address, tax_id, branch, contact_name, phone, email, credit_term_days)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(newId, ...params);
  return newId;
}

export function deleteCustomer(db: Db, id: string) {
  const used =
    db.prepare("select 1 from documents where customer_id = ? limit 1").get(id) ??
    db.prepare("select 1 from billing_notes where customer_id = ? limit 1").get(id) ??
    db.prepare("select 1 from receipts where customer_id = ? limit 1").get(id);
  if (used) throw new AppError("ลบไม่ได้ เพราะลูกค้ารายนี้มีเอกสารอยู่แล้ว");
  db.prepare("delete from customers where id = ?").run(id);
}

// ---------------------------------------------------------------- products

export type ProductInput = Omit<Product, "id">;

function toProduct(row: Row): Product {
  return { ...row, vat_applicable: row.vat_applicable === 1 } as Product;
}

export function listProducts(db: Db): Product[] {
  return db.prepare("select * from products order by code").all().map(toProduct);
}

export function getProduct(db: Db, id: string): Product | null {
  const row = db.prepare("select * from products where id = ?").get(id);
  return row ? toProduct(row) : null;
}

export function saveProduct(db: Db, id: string | null, values: ProductInput): string {
  if (!values.code.trim() || !values.name.trim() || !values.unit.trim()) {
    throw new AppError("กรุณากรอกรหัส ชื่อ และหน่วยนับ");
  }
  if (!Number.isFinite(values.unit_price) || values.unit_price < 0) {
    throw new AppError("ราคาต้องไม่ติดลบ");
  }
  const duplicate = db
    .prepare("select 1 from products where code = ? and id <> ?")
    .get(values.code, id ?? "");
  if (duplicate) throw new AppError("รหัสสินค้านี้มีอยู่แล้ว");

  const params = [
    values.code,
    values.name,
    values.unit,
    money(values.unit_price),
    values.vat_applicable ? 1 : 0,
  ];
  if (id) {
    const { changes } = db
      .prepare("update products set code = ?, name = ?, unit = ?, unit_price = ?, vat_applicable = ? where id = ?")
      .run(...params, id);
    if (changes === 0) throw new AppError("ไม่พบสินค้ารายการนี้");
    return id;
  }
  const newId = randomUUID();
  db.prepare(
    "insert into products (id, code, name, unit, unit_price, vat_applicable) values (?, ?, ?, ?, ?, ?)",
  ).run(newId, ...params);
  return newId;
}

/** Items on existing documents keep their copied description and price. */
export function deleteProduct(db: Db, id: string) {
  db.prepare("delete from products where id = ?").run(id);
}

// ---------------------------------------------------------------- documents: reads

const SUMMARY_SELECT = `
  select d.*, c.name as customer_name,
    (d.type = 'IV' and d.status in ('sent', 'approved') and d.due_date < :today) as is_overdue,
    exists (select 1 from documents i where i.source_document_id = d.id and i.status <> 'cancelled') as has_invoice,
    exists (select 1 from tax_invoices t where t.invoice_id = d.id and t.status <> 'cancelled') as has_tax_invoice
  from documents d
  join customers c on c.id = d.customer_id`;

function toSummary(row: Row): DocumentSummary {
  return {
    ...row,
    is_overdue: row.is_overdue === 1,
    has_invoice: row.has_invoice === 1,
    has_tax_invoice: row.has_tax_invoice === 1,
  } as DocumentSummary;
}

export type DocumentFilter = {
  type?: string;
  /** A real status, or the virtual "unpaid" / "overdue". */
  status?: string;
  limit: number;
  offset: number;
};

const STATUSES: DocStatus[] = ["draft", "sent", "approved", "paid", "cancelled"];

export function listDocuments(db: Db, filter: DocumentFilter) {
  const where: string[] = [];
  const params: Record<string, string | number> = { today: todayTh() };

  if (filter.type === "QT" || filter.type === "IV") {
    where.push("d.type = :type");
    params.type = filter.type;
  }
  if (filter.status === "overdue") {
    where.push("d.type = 'IV' and d.status in ('sent', 'approved') and d.due_date < :today");
  } else if (filter.status === "unpaid") {
    where.push("d.type = 'IV' and d.status in ('sent', 'approved')");
  } else if (STATUSES.includes(filter.status as DocStatus)) {
    where.push("d.status = :status");
    params.status = filter.status!;
  }
  const clause = where.length ? ` where ${where.join(" and ")}` : "";

  const countStmt = db.prepare(`select count(*) as total from documents d${clause}`);
  countStmt.setAllowUnknownNamedParameters(true); // :today is only used by the overdue filter
  const { total } = countStmt.get(params) as { total: number };
  const rows = db
    .prepare(
      `${SUMMARY_SELECT}${clause} order by d.issue_date desc, d.doc_number desc limit :limit offset :offset`,
    )
    .all({ ...params, limit: filter.limit, offset: filter.offset })
    .map(toSummary);
  return { rows, total };
}

export function listOverdue(db: Db, limit: number): DocumentSummary[] {
  return db
    .prepare(
      `${SUMMARY_SELECT}
       where d.type = 'IV' and d.status in ('sent', 'approved') and d.due_date < :today
       order by d.due_date limit :limit`,
    )
    .all({ today: todayTh(), limit })
    .map(toSummary);
}

export function getDocument(db: Db, id: string): DocumentSummary | null {
  const row = db.prepare(`${SUMMARY_SELECT} where d.id = :id`).get({ today: todayTh(), id });
  return row ? toSummary(row) : null;
}

export function getDocumentItems(db: Db, documentId: string): DocumentItem[] {
  return db
    .prepare("select * from document_items where document_id = ? order by position")
    .all(documentId)
    .map((row) => ({ ...row, vat_applicable: row.vat_applicable === 1 }) as DocumentItem);
}

type Related = { id: string; doc_number: string };

/** The quotation an invoice came from, and the live invoice made from a quotation. */
export function getRelatedDocuments(db: Db, doc: DocumentSummary) {
  const source = doc.source_document_id
    ? (db.prepare("select id, doc_number from documents where id = ?").get(doc.source_document_id) as
        | Related
        | undefined)
    : undefined;
  const invoice = db
    .prepare("select id, doc_number from documents where source_document_id = ? and status <> 'cancelled'")
    .get(doc.id) as Related | undefined;
  return {
    source: source ? { ...source } : null,
    invoice: invoice ? { ...invoice } : null,
  };
}

/**
 * sales   = pre-VAT value of issued invoices (sent, approved, paid), by issue month
 * arrears = net receivable (after WHT) on invoices still unpaid; overdue is a subset
 */
export function dashboardSummary(db: Db, today = todayTh()): DashboardSummary {
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 10));
  }

  const salesRows = db
    .prepare(
      `select substr(issue_date, 1, 7) || '-01' as month, sum(subtotal) as sales
       from documents
       where type = 'IV' and status in ('sent', 'approved', 'paid') and issue_date >= ?
       group by 1`,
    )
    .all(months[0]) as { month: string; sales: number }[];
  const salesByMonth = new Map(salesRows.map((r) => [r.month, money(r.sales)]));
  const monthly_sales = months.map((month) => ({ month, sales: salesByMonth.get(month) ?? 0 }));

  const receivable = db
    .prepare(
      `select
         count(*) as arrears_count,
         coalesce(sum(net_total), 0) as arrears_amount,
         coalesce(sum(due_date < :today), 0) as overdue_count,
         coalesce(sum(case when due_date < :today then net_total end), 0) as overdue_amount
       from documents
       where type = 'IV' and status in ('sent', 'approved')`,
    )
    .get({ today }) as Record<string, number>;

  return {
    sales_this_month: monthly_sales[5].sales,
    sales_last_month: monthly_sales[4].sales,
    arrears_amount: money(receivable.arrears_amount),
    arrears_count: receivable.arrears_count,
    overdue_amount: money(receivable.overdue_amount),
    overdue_count: receivable.overdue_count,
    monthly_sales,
  };
}

// ---------------------------------------------------------------- documents: writes

/** Next running number for the type and month of issueDate, e.g. IV202611-007. */
export function nextDocNumber(db: Db, type: DocType | "BL" | "RC" | "TX", issueDate: string) {
  const period = issueDate.slice(0, 4) + issueDate.slice(5, 7);
  const { last_no } = db
    .prepare(
      `insert into document_sequences (type, period, last_no) values (?, ?, 1)
       on conflict (type, period) do update set last_no = last_no + 1
       returning last_no`,
    )
    .get(type, period) as { last_no: number };
  return `${type}${period}-${String(last_no).padStart(3, "0")}`;
}

function validateItems(items: DocumentItemInput[]) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("เอกสารต้องมีรายการอย่างน้อย 1 รายการ");
  }
  items.forEach((item, index) => {
    const n = index + 1;
    if (!item.description?.trim()) throw new AppError(`รายการที่ ${n}: กรุณากรอกรายละเอียด`);
    if (!item.unit?.trim()) throw new AppError(`รายการที่ ${n}: กรุณากรอกหน่วย`);
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new AppError(`รายการที่ ${n}: จำนวนต้องมากกว่า 0`);
    }
    if (!Number.isFinite(item.unit_price) || item.unit_price < 0) {
      throw new AppError(`รายการที่ ${n}: ราคาต้องไม่ติดลบ`);
    }
  });
}

function validateRate(rate: number, label: string) {
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new AppError(`${label}ต้องอยู่ระหว่าง 0 ถึง 100`);
  }
}

function writeItems(db: Db, documentId: string, items: DocumentItemInput[]) {
  const insert = db.prepare(
    `insert into document_items
       (id, document_id, product_id, position, description, unit, quantity, unit_price, vat_applicable, amount)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  items.forEach((item, index) => {
    const quantity = Math.round(item.quantity * 1000) / 1000;
    const unitPrice = money(item.unit_price);
    const amount = lineAmount({ quantity, unitPrice, vatApplicable: item.vat_applicable });
    const productId =
      item.product_id && db.prepare("select 1 from products where id = ?").get(item.product_id)
        ? item.product_id
        : null;
    insert.run(
      randomUUID(),
      documentId,
      productId,
      index + 1,
      item.description.trim(),
      item.unit.trim(),
      quantity,
      unitPrice,
      item.vat_applicable ? 1 : 0,
      amount,
    );
  });
}

/** Recomputes the stored totals from the items, using the same code as the builder. */
function refreshTotals(db: Db, documentId: string) {
  const { vat_rate, wht_rate } = db
    .prepare("select vat_rate, wht_rate from documents where id = ?")
    .get(documentId) as { vat_rate: number; wht_rate: number };
  const lines = getDocumentItems(db, documentId).map((item) => ({
    quantity: item.quantity,
    unitPrice: item.unit_price,
    vatApplicable: item.vat_applicable,
  }));
  const t = calcTotals(lines, vat_rate, wht_rate);
  db.prepare(
    `update documents set subtotal = ?, vat_amount = ?, grand_total = ?, wht_amount = ?, net_total = ?
     where id = ?`,
  ).run(t.subtotal, t.vatAmount, t.grandTotal, t.whtAmount, t.netTotal, documentId);
}

type NewDocument = {
  company_id: string;
  customer_id: string;
  source_document_id?: string | null;
  type: DocType;
  issue_date: string;
  due_date: string;
  vat_rate: number;
  wht_rate: number;
  notes: string | null;
};

/** Inserts a draft with a fresh running number. Callers must be inside a transaction. */
export function insertDocument(db: Db, doc: NewDocument, items: DocumentItemInput[]) {
  const id = randomUUID();
  db.prepare(
    `insert into documents
       (id, company_id, customer_id, source_document_id, type, doc_number,
        issue_date, due_date, vat_rate, wht_rate, notes)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    doc.company_id,
    doc.customer_id,
    doc.source_document_id ?? null,
    doc.type,
    nextDocNumber(db, doc.type, doc.issue_date),
    doc.issue_date,
    doc.due_date,
    doc.vat_rate,
    doc.wht_rate,
    doc.notes,
  );
  writeItems(db, id, items);
  refreshTotals(db, id);
  return id;
}

/**
 * Creates (id null) or updates a document together with its items. Returns the document id.
 * An edit keeps the number and status; see editBlockReason() for what can be edited.
 */
export function saveDocument(
  db: Db,
  id: string | null,
  doc: DocumentInput,
  items: DocumentItemInput[],
): string {
  if (doc.type !== "QT" && doc.type !== "IV") throw new AppError("ประเภทเอกสารไม่ถูกต้อง");
  if (!doc.customer_id || !getCustomer(db, doc.customer_id)) throw new AppError("กรุณาเลือกลูกค้า");
  if (!isDate(doc.issue_date) || !isDate(doc.due_date)) throw new AppError("รูปแบบวันที่ไม่ถูกต้อง");
  if (doc.due_date < doc.issue_date) throw new AppError("วันครบกำหนดต้องไม่ก่อนวันที่เอกสาร");
  validateRate(doc.vat_rate, "อัตรา VAT ");
  validateRate(doc.wht_rate, "อัตราหัก ณ ที่จ่าย ");
  validateItems(items);
  const notes = doc.notes?.trim() || null;

  return transaction(db, () => {
    if (!id) {
      const company = getCompany(db);
      if (!company) throw new AppError("ยังไม่มีข้อมูลบริษัทผู้ออกเอกสาร");
      return insertDocument(db, { ...doc, company_id: company.id, notes }, items);
    }

    const current = getDocument(db, id);
    if (!current) throw new AppError("ไม่พบเอกสาร");
    if (current.type !== doc.type) throw new AppError("เปลี่ยนประเภทเอกสารไม่ได้");
    const blocked = editBlockReason(current);
    if (blocked) throw new AppError(blocked);

    db.prepare(
      `update documents set customer_id = ?, issue_date = ?, due_date = ?, vat_rate = ?, wht_rate = ?, notes = ?
       where id = ?`,
    ).run(doc.customer_id, doc.issue_date, doc.due_date, doc.vat_rate, doc.wht_rate, notes, id);
    db.prepare("delete from document_items where document_id = ?").run(id);
    writeItems(db, id, items);
    refreshTotals(db, id);
    return id;
  });
}

/**
 * Allowed moves:
 *   draft    -> sent | cancelled
 *   sent     -> approved | paid (IV only) | cancelled
 *   approved -> paid (IV only) | cancelled
 * paid and cancelled are final.
 */
export function canChangeStatus(type: DocType, from: DocStatus, to: DocStatus) {
  if (from === "draft") return to === "sent" || to === "cancelled";
  if (from === "sent" || from === "approved") {
    if (to === "cancelled") return true;
    if (to === "paid") return type === "IV";
    return from === "sent" && to === "approved";
  }
  return false;
}

export function setDocumentStatus(db: Db, id: string, status: DocStatus) {
  transaction(db, () => {
    const doc = db.prepare("select type, status from documents where id = ?").get(id) as
      | { type: DocType; status: DocStatus }
      | undefined;
    if (!doc) throw new AppError("ไม่พบเอกสาร");
    if (!STATUSES.includes(status) || !canChangeStatus(doc.type, doc.status, status)) {
      throw new AppError(`ไม่สามารถเปลี่ยนสถานะจาก ${doc.status} เป็น ${status} ได้`);
    }
    const taxInvoice = db
      .prepare("select 1 from tax_invoices where invoice_id = ? and status <> 'cancelled'")
      .get(id);
    if (status === "cancelled" && taxInvoice) {
      throw new AppError("ใบแจ้งหนี้นี้ออกใบกำกับภาษีแล้ว กรุณายกเลิกใบกำกับภาษีก่อน");
    }
    db.prepare("update documents set status = ?, paid_at = ? where id = ?").run(
      status,
      status === "paid" ? todayTh() : null,
      id,
    );
  });
}

/** Copies an approved quotation into a new draft invoice and returns the invoice id. */
export function convertQuotationToInvoice(db: Db, id: string): string {
  return transaction(db, () => {
    const quotation = getDocument(db, id);
    if (!quotation) throw new AppError("ไม่พบเอกสาร");
    if (quotation.type !== "QT" || quotation.status !== "approved") {
      throw new AppError("แปลงเป็นใบแจ้งหนี้ได้เฉพาะใบเสนอราคาที่อนุมัติแล้ว");
    }
    if (getRelatedDocuments(db, quotation).invoice) {
      throw new AppError("ใบเสนอราคานี้ถูกแปลงเป็นใบแจ้งหนี้แล้ว");
    }

    const customer = getCustomer(db, quotation.customer_id)!;
    const today = todayTh();
    const items = getDocumentItems(db, id).map((item) => ({
      product_id: item.product_id ?? "",
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unit_price: item.unit_price,
      vat_applicable: item.vat_applicable,
    }));
    return insertDocument(
      db,
      {
        company_id: getCompanyById(db, quotation.company_id).id,
        customer_id: quotation.customer_id,
        source_document_id: quotation.id,
        type: "IV",
        issue_date: today,
        due_date: addDays(today, customer.credit_term_days),
        vat_rate: quotation.vat_rate,
        wht_rate: quotation.wht_rate,
        notes: quotation.notes,
      },
      items,
    );
  });
}
