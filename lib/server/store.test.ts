import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { addDays, todayTh } from "../format.ts";
import type { DocumentItemInput } from "../types.ts";
import { openDatabase, type Db } from "./db.ts";
import { DEMO_USER } from "./seed.ts";
import * as store from "./store.ts";
import { checkCredentials, createSession, deleteSession, getSessionUser } from "./users.ts";

let db: Db;
beforeEach(() => {
  db = openDatabase(":memory:");
});

const today = todayTh();
const period = today.slice(0, 4) + today.slice(5, 7);
const customerId = "00000000-0000-4000-8001-000000000001";

/** A record's values for a save function, which takes everything but the id. */
function withoutId<T extends { id: string }>(record: T): Omit<T, "id"> {
  const copy: Partial<T> = { ...record };
  delete copy.id;
  return copy as Omit<T, "id">;
}

const item = (quantity: number, unit_price: number, vat_applicable = true): DocumentItemInput => ({
  product_id: "",
  description: "ทดสอบ",
  unit: "ชิ้น",
  quantity,
  unit_price,
  vat_applicable,
});

function newDoc(type: "QT" | "IV", items = [item(1, 100)], wht = 0) {
  return store.saveDocument(
    db,
    null,
    { type, customer_id: customerId, issue_date: today, due_date: addDays(today, 30), vat_rate: 7, wht_rate: wht, notes: "" },
    items,
  );
}

test("seed: dashboard figures match the sample data", () => {
  const s = store.dashboardSummary(db);
  assert.equal(s.sales_this_month + 0, s.monthly_sales[5].sales);
  assert.equal(s.arrears_count, 4);
  assert.equal(s.arrears_amount, 208854);
  assert.equal(s.overdue_count, 2);
  assert.equal(s.overdue_amount, 122534);
  assert.equal(s.monthly_sales.length, 6);
  assert.equal(store.listDocuments(db, { limit: 50, offset: 0 }).total, 14);
});

test("totals: VAT only on vatable lines, WHT on subtotal, rounded to satang", () => {
  const id = newDoc("IV", [item(3, 33.33), item(1.5, 10, false)], 3);
  const doc = store.getDocument(db, id)!;
  assert.equal(doc.subtotal, 114.99);
  assert.equal(doc.vat_amount, 7);
  assert.equal(doc.grand_total, 121.99);
  assert.equal(doc.wht_amount, 3.45);
  assert.equal(doc.net_total, 118.54);
});

test("numbering: per type and month, padded to 3 digits", () => {
  const before = store.listDocuments(db, { type: "QT", limit: 999, offset: 0 }).rows
    .filter((d) => d.doc_number.startsWith(`QT${period}`)).length;
  const a = store.getDocument(db, newDoc("QT"))!;
  const b = store.getDocument(db, newDoc("QT"))!;
  const c = store.getDocument(db, newDoc("IV"))!;
  assert.equal(a.doc_number, `QT${period}-${String(before + 1).padStart(3, "0")}`);
  assert.equal(b.doc_number, `QT${period}-${String(before + 2).padStart(3, "0")}`);
  assert.match(c.doc_number, new RegExp(`^IV${period}-\\d{3}$`));
});

test("drafts, sent and approved are editable; paid, cancelled and converted QT are not", () => {
  const id = newDoc("QT");
  const input = { type: "QT" as const, customer_id: customerId, issue_date: today, due_date: today, vat_rate: 7, wht_rate: 0, notes: "แก้ไข" };
  const number = store.getDocument(db, id)!.doc_number;
  store.saveDocument(db, id, input, [item(2, 50), item(1, 1)]);
  assert.equal(store.getDocumentItems(db, id).length, 2);
  assert.equal(store.getDocument(db, id)!.subtotal, 101);

  store.setDocumentStatus(db, id, "sent");
  store.saveDocument(db, id, input, [item(3, 100)]);
  store.setDocumentStatus(db, id, "approved");
  store.saveDocument(db, id, input, [item(4, 100)]);
  const edited = store.getDocument(db, id)!;
  assert.equal(edited.status, "approved");
  assert.equal(edited.doc_number, number);
  assert.equal(edited.subtotal, 400);
  assert.throws(() => store.saveDocument(db, id, { ...input, type: "IV" }, [item(1, 1)]), /ประเภท/);

  const iv = store.convertQuotationToInvoice(db, id);
  assert.equal(store.getDocument(db, id)!.has_invoice, true);
  assert.throws(() => store.saveDocument(db, id, input, [item(1, 1)]), /แก้ไขที่ใบแจ้งหนี้/);

  const ivInput = { ...input, type: "IV" as const };
  store.setDocumentStatus(db, iv, "sent");
  store.saveDocument(db, iv, ivInput, [item(5, 100)]);
  store.setDocumentStatus(db, iv, "paid");
  assert.throws(() => store.saveDocument(db, iv, ivInput, [item(1, 1)]), /ชำระแล้ว/);

  const cancelled = newDoc("IV");
  store.setDocumentStatus(db, cancelled, "cancelled");
  assert.throws(() => store.saveDocument(db, cancelled, ivInput, [item(1, 1)]), /ยกเลิกแล้ว/);
});

test("validation errors are AppErrors and nothing is written", () => {
  const count = () => store.listDocuments(db, { limit: 1, offset: 0 }).total;
  const before = count();
  assert.throws(() => newDoc("QT", []), store.AppError);
  assert.throws(() => newDoc("QT", [item(0, 10)]), /จำนวนต้องมากกว่า 0/);
  assert.throws(
    () => store.saveDocument(db, null, { type: "QT", customer_id: customerId, issue_date: today, due_date: addDays(today, -1), vat_rate: 7, wht_rate: 0, notes: "" }, [item(1, 1)]),
    /วันครบกำหนด/,
  );
  assert.equal(count(), before);
});

test("status transitions", () => {
  const qt = newDoc("QT");
  assert.throws(() => store.setDocumentStatus(db, qt, "approved"));
  store.setDocumentStatus(db, qt, "sent");
  assert.throws(() => store.setDocumentStatus(db, qt, "paid"), /ไม่สามารถเปลี่ยนสถานะ/);
  store.setDocumentStatus(db, qt, "approved");

  const iv = newDoc("IV");
  store.setDocumentStatus(db, iv, "sent");
  store.setDocumentStatus(db, iv, "paid");
  assert.equal(store.getDocument(db, iv)!.paid_at, today);
  assert.throws(() => store.setDocumentStatus(db, iv, "cancelled"));
});

test("convert: approved QT only, one live invoice, due date from credit term", () => {
  const qt = newDoc("QT", [item(2, 500)], 3);
  assert.throws(() => store.convertQuotationToInvoice(db, qt), /อนุมัติแล้ว/);
  store.setDocumentStatus(db, qt, "sent");
  store.setDocumentStatus(db, qt, "approved");

  const iv = store.convertQuotationToInvoice(db, qt);
  const invoice = store.getDocument(db, iv)!;
  assert.equal(invoice.type, "IV");
  assert.equal(invoice.status, "draft");
  assert.equal(invoice.source_document_id, qt);
  assert.equal(invoice.due_date, addDays(today, 30));
  assert.equal(invoice.net_total, store.getDocument(db, qt)!.net_total);
  assert.throws(() => store.convertQuotationToInvoice(db, qt), /ถูกแปลง/);

  store.setDocumentStatus(db, iv, "cancelled");
  assert.ok(store.convertQuotationToInvoice(db, qt));
});

test("customers and products", () => {
  assert.throws(() => store.deleteCustomer(db, customerId), /มีเอกสารอยู่แล้ว/);
  const values = { name: "ลูกค้าใหม่", address: "", tax_id: "123", branch: null, contact_name: null, phone: null, email: null, credit_term_days: 15 };
  assert.throws(() => store.saveCustomer(db, null, values), /13 หลัก/);
  const id = store.saveCustomer(db, null, { ...values, tax_id: null });
  store.deleteCustomer(db, id);
  assert.equal(store.getCustomer(db, id), null);

  const product = { code: "SV-WEB-01", name: "ซ้ำ", unit: "งาน", unit_price: 1, vat_applicable: true };
  assert.throws(() => store.saveProduct(db, null, product), /มีอยู่แล้ว/);
  const pid = store.saveProduct(db, null, { ...product, code: "NEW-01" });
  assert.equal(store.getProduct(db, pid)!.vat_applicable, true);
  store.deleteProduct(db, store.listProducts(db).find((p) => p.code === "SV-WEB-01")!.id);
  assert.ok(store.getDocumentItems(db, store.listDocuments(db, { limit: 50, offset: 0 }).rows.at(-1)!.id).length);
});

test("mock auth: credentials and sessions", () => {
  assert.equal(checkCredentials(db, DEMO_USER.email, "wrong"), null);
  const user = checkCredentials(db, DEMO_USER.email.toUpperCase(), DEMO_USER.password)!;
  assert.equal(user.name, DEMO_USER.name);
  const { token } = createSession(db, user.id);
  assert.equal(getSessionUser(db, token)?.id, user.id);
  assert.equal(getSessionUser(db, "forged"), null);
  deleteSession(db, token);
  assert.equal(getSessionUser(db, token), null);
});

test("company: validated, single issuer used by every document", () => {
  const company = store.getCompany(db)!;
  const values = { ...company, name: "บริษัท ใหม่ จำกัด" } as Partial<typeof company>;
  delete values.id;
  const input = values as store.CompanyInput;
  assert.throws(() => store.saveCompany(db, { ...input, tax_id: "12" }), /13 หลัก/);
  assert.throws(() => store.saveCompany(db, { ...input, name: " " }), /ชื่อบริษัท/);

  const id = store.saveCompany(db, { ...input, branch: "" });
  assert.equal(id, company.id);
  assert.equal(store.getCompany(db)!.name, "บริษัท ใหม่ จำกัด");
  assert.equal(store.getCompany(db)!.branch, "สำนักงานใหญ่");
  const { n } = db.prepare("select count(*) as n from documents where company_id <> ?").get(id) as { n: number };
  assert.equal(n, 0);
});

test("billing notes: issued unpaid invoices of one customer, one active note per invoice", async () => {
  const billing = await import("./billing.ts");
  // seed: one note for customer 3's overdue invoice
  const [seeded] = billing.listBillingNotes(db);
  assert.match(seeded.doc_number, /^BL\d{6}-001$/);
  assert.equal(seeded.invoice_count, 1);
  assert.equal(seeded.net_total, 62400);

  const ivA = newDoc("IV", [item(1, 1000)], 3);
  const ivB = newDoc("IV", [item(2, 500)]);
  const draft = newDoc("IV");
  store.setDocumentStatus(db, ivA, "sent");
  store.setDocumentStatus(db, ivB, "sent");
  store.setDocumentStatus(db, ivB, "approved");
  const input = { customer_id: customerId, issue_date: today, due_date: addDays(today, 7), notes: "", invoice_ids: [ivA, ivB] };

  assert.throws(() => billing.saveBillingNote(db, null, { ...input, invoice_ids: [] }), /อย่างน้อย 1/);
  assert.throws(() => billing.saveBillingNote(db, null, { ...input, invoice_ids: [draft] }), /วางบิลไม่ได้/);
  assert.throws(
    () => billing.saveBillingNote(db, null, { ...input, customer_id: "00000000-0000-4000-8001-000000000002" }),
    /ลูกค้ารายอื่น/,
  );
  assert.throws(() => billing.saveBillingNote(db, null, { ...input, due_date: addDays(today, -1) }), /นัดชำระ/);

  const id = billing.saveBillingNote(db, null, input);
  const { note, invoices } = billing.getBillingNote(db, id)!;
  assert.match(note.doc_number, new RegExp(`^BL${period}-[0-9]{3}$`));
  assert.deepEqual(invoices.map((i) => i.id), [ivA, ivB]);
  assert.equal(note.grand_total, 1070 + 1070);
  assert.equal(note.wht_amount, 30);
  assert.equal(note.net_total, 2110);
  assert.equal(billing.billingNoteForInvoice(db, ivA)?.id, id);

  // an invoice is on one active note only; the note itself can still be edited
  assert.throws(() => billing.saveBillingNote(db, null, { ...input, invoice_ids: [ivA] }), /วางบิลไม่ได้/);
  billing.saveBillingNote(db, id, { ...input, invoice_ids: [ivB] });
  assert.equal(billing.getBillingNote(db, id)!.note.invoice_count, 1);
  const other = billing.saveBillingNote(db, null, { ...input, invoice_ids: [ivA] });

  // amounts follow the invoice; paid invoices stay on the note
  store.setDocumentStatus(db, ivB, "paid");
  assert.equal(billing.getBillingNote(db, id)!.note.open_count, 0);
  billing.saveBillingNote(db, id, { ...input, notes: "แก้หมายเหตุ", invoice_ids: [ivB] });

  // cancelling frees the invoice and locks the note
  billing.cancelBillingNote(db, other);
  assert.equal(billing.billingNoteForInvoice(db, ivA), null);
  assert.throws(() => billing.saveBillingNote(db, other, input), /ยกเลิกแล้ว/);
  assert.ok(billing.saveBillingNote(db, null, { ...input, invoice_ids: [ivA] }));

  assert.throws(() => store.deleteCustomer(db, "00000000-0000-4000-8001-000000000003"), /มีเอกสาร/);
});

test("combined document list includes billing notes", async () => {
  const { listAllDocuments } = await import("./document-list.ts");
  const all = (filter: { type?: string; status?: string }) => listAllDocuments(db, { ...filter, limit: 100, offset: 0 });
  assert.equal(all({}).total, 20); // 14 QT/IV + 1 billing note + 4 receipts + 1 tax invoice
  assert.equal(all({ type: "QT" }).total, 5);
  assert.equal(all({ type: "IV" }).total, 9);
  const bl = all({ type: "BL" });
  assert.equal(bl.total, 1);
  assert.equal(bl.rows[0].status, "issued");
  assert.equal(bl.rows[0].net_total, 62400);
  assert.equal(all({ type: "BL", status: "paid" }).total, 0);
  assert.equal(all({ type: "QT", status: "issued" }).total, 0);
  assert.equal(all({ status: "overdue" }).total, 2);
  assert.equal(all({ status: "cancelled" }).total, 1);
  assert.equal(all({ status: "issued" }).total, 6);
  assert.equal(all({ type: "TX" }).total, 1);
  const rc = all({ type: "RC" });
  assert.equal(rc.total, 4);
  assert.ok(rc.rows.every((r) => r.type === "RC" && r.status === "issued"));
  assert.equal(all({ type: "RC", status: "paid" }).total, 0);
  const page2 = listAllDocuments(db, { limit: 10, offset: 10 });
  assert.equal(page2.rows.length, 10);
});

test("receipts: pay invoices, one active receipt each, cancel restores", async () => {
  const receipts = await import("./receipts.ts");
  // seed: every paid invoice has a receipt
  const { n } = db.prepare("select count(*) as n from receipts").get() as { n: number };
  assert.equal(n, 4);
  assert.equal(store.dashboardSummary(db).arrears_amount, 208854);

  const ivA = newDoc("IV", [item(1, 1000)], 3);
  const ivB = newDoc("IV", [item(2, 500)]);
  const draft = newDoc("IV");
  store.setDocumentStatus(db, ivA, "sent");
  store.setDocumentStatus(db, ivB, "sent");
  store.setDocumentStatus(db, ivB, "approved");
  const input = { customer_id: customerId, receipt_date: today, payment_method: "transfer" as const, payment_ref: "TRX-1", notes: "", invoice_ids: [ivA, ivB] };

  assert.throws(() => receipts.saveReceipt(db, null, { ...input, invoice_ids: [draft] }), /ออกใบเสร็จไม่ได้/);
  assert.throws(() => receipts.saveReceipt(db, null, { ...input, receipt_date: addDays(today, 1) }), /อนาคต/);
  assert.throws(() => receipts.saveReceipt(db, null, { ...input, customer_id: "00000000-0000-4000-8001-000000000002" }), /ลูกค้ารายอื่น/);
  assert.throws(() => receipts.saveReceipt(db, null, { ...input, payment_method: "gold" as never }), /วิธีชำระ/);

  const id = receipts.saveReceipt(db, null, input);
  const { receipt, invoices } = receipts.getReceipt(db, id)!;
  assert.match(receipt.doc_number, new RegExp(`^RC${period}-[0-9]{3}$`));
  assert.equal(receipt.net_total, 1070 - 30 + 1070);
  assert.ok(invoices.every((i) => i.status === "paid"));
  assert.equal(store.getDocument(db, ivB)!.paid_at, today);
  assert.equal(receipts.receiptForInvoice(db, ivA)?.id, id);
  assert.throws(() => receipts.saveReceipt(db, null, { ...input, invoice_ids: [ivA] }), /ออกใบเสร็จไม่ได้/);

  // payment details can be edited (the date of a tax invoice cannot; see the tax invoice test)
  receipts.saveReceipt(db, id, { ...input, payment_method: "cheque" });
  assert.equal(receipts.getReceipt(db, id)!.receipt.payment_method, "cheque");

  // cancel restores the previous status, and the invoices can be receipted again
  receipts.cancelReceipt(db, id);
  assert.equal(store.getDocument(db, ivA)!.status, "sent");
  assert.equal(store.getDocument(db, ivB)!.status, "approved");
  assert.equal(store.getDocument(db, ivB)!.paid_at, null);
  assert.throws(() => receipts.saveReceipt(db, id, input), /ยกเลิกแล้ว/);

  // an invoice marked paid without a receipt can get one later, and keeps "paid" if that receipt is cancelled
  store.setDocumentStatus(db, ivA, "paid");
  const late = receipts.saveReceipt(db, null, { ...input, invoice_ids: [ivA] });
  receipts.cancelReceipt(db, late);
  assert.equal(store.getDocument(db, ivA)!.status, "paid");
  assert.equal(store.getDocument(db, ivA)!.paid_at, today);
});

test("receipts are tax invoices for a VAT-registered company, with fixed parties and date", async () => {
  const receipts = await import("./receipts.ts");
  const iv = newDoc("IV", [item(1, 1000)]);
  store.setDocumentStatus(db, iv, "sent");
  const input = { customer_id: customerId, receipt_date: today, payment_method: "cash" as const, payment_ref: "", notes: "", invoice_ids: [iv] };
  const id = receipts.saveReceipt(db, null, input);
  const { receipt } = receipts.getReceipt(db, id)!;
  assert.equal(receipt.is_tax_invoice, true);
  assert.equal(receipt.seller?.tax_id, "0105500000001");
  assert.equal(receipt.buyer?.name, "บริษัท ก้าวหน้าเทรดดิ้ง จำกัด");
  assert.equal(receipt.buyer?.branch, "สำนักงานใหญ่");

  // later changes to the customer do not change the issued tax invoice
  const customer = store.getCustomer(db, customerId)!;
  store.saveCustomer(db, customerId, { ...withoutId(customer), name: "ชื่อใหม่" });
  assert.equal(receipts.getReceipt(db, id)!.receipt.buyer?.name, "บริษัท ก้าวหน้าเทรดดิ้ง จำกัด");

  assert.throws(() => receipts.saveReceipt(db, id, { ...input, receipt_date: addDays(today, -1) }), /วันที่ของใบกำกับภาษี/);
  receipts.saveReceipt(db, id, { ...input, payment_ref: "เงินสดหน้าร้าน" });

  // not VAT registered: plain receipt, date editable
  const company = store.getCompany(db)!;
  store.saveCompany(db, { ...withoutId(company), vat_registered: false });
  const iv2 = newDoc("IV", [item(1, 100)]);
  store.setDocumentStatus(db, iv2, "sent");
  const plain = receipts.saveReceipt(db, null, { ...input, invoice_ids: [iv2] });
  assert.equal(receipts.getReceipt(db, plain)!.receipt.is_tax_invoice, false);
  assert.equal(receipts.getReceipt(db, plain)!.receipt.buyer, null);
  // a plain receipt's date can change, and the invoice's paid date follows
  const iv2Issue = store.getDocument(db, iv2)!.issue_date;
  receipts.saveReceipt(db, plain, { ...input, invoice_ids: [iv2], receipt_date: iv2Issue });
  assert.equal(store.getDocument(db, iv2)!.paid_at, iv2Issue);
});

test("migration adds new columns to an older database", async () => {
  const { migrate } = await import("./db.ts");
  db.exec("alter table receipts drop column buyer_snapshot; alter table companies drop column vat_registered;");
  migrate(db);
  const cols = (t: string) => (db.prepare(`pragma table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  assert.ok(cols("receipts").includes("buyer_snapshot"));
  assert.ok(cols("companies").includes("vat_registered"));
  assert.equal(store.getCompany(db)!.vat_registered, true);
});

test("tax invoices on delivery: one per invoice, lock the invoice, plain receipt afterwards", async () => {
  const tax = await import("./tax-invoices.ts");
  const receipts = await import("./receipts.ts");
  const iv = newDoc("IV", [item(2, 24900)]);
  assert.match(tax.taxInvoiceBlockReason(db, iv)!, /ต้องส่ง/);
  store.setDocumentStatus(db, iv, "sent");
  assert.equal(tax.taxInvoiceBlockReason(db, iv), null);
  assert.throws(() => tax.issueTaxInvoice(db, iv, { tax_date: addDays(today, 1), notes: "" }), /อนาคต/);
  assert.throws(() => tax.issueTaxInvoice(db, iv, { tax_date: addDays(today, -1), notes: "" }), /ก่อนวันที่ของใบแจ้งหนี้/);

  const id = tax.issueTaxInvoice(db, iv, { tax_date: today, notes: "ส่งของครบ" });
  const ti = tax.getTaxInvoice(db, id)!;
  assert.match(ti.doc_number, new RegExp(`^TX${period}-[0-9]{3}$`));
  assert.equal(ti.buyer.tax_id, "0105500000011");
  assert.equal(store.getDocument(db, iv)!.has_tax_invoice, true);
  assert.throws(() => tax.issueTaxInvoice(db, iv, { tax_date: today, notes: "" }), /ออกใบกำกับภาษีแล้ว/);

  // the invoice is locked
  const input = { type: "IV" as const, customer_id: customerId, issue_date: today, due_date: today, vat_rate: 7, wht_rate: 0, notes: "" };
  assert.throws(() => store.saveDocument(db, iv, input, [item(1, 1)]), /ออกใบกำกับภาษีแล้ว/);
  assert.throws(() => store.setDocumentStatus(db, iv, "cancelled"), /ยกเลิกใบกำกับภาษีก่อน/);

  // its receipt is a plain receipt; it cannot be mixed with an invoice without one
  const other = newDoc("IV", [item(1, 100)]);
  store.setDocumentStatus(db, other, "sent");
  const rc = { customer_id: customerId, receipt_date: today, payment_method: "transfer" as const, payment_ref: "", notes: "", invoice_ids: [iv, other] };
  assert.throws(() => receipts.saveReceipt(db, null, rc), /ออกใบเสร็จแยกกัน/);
  const plain = receipts.saveReceipt(db, null, { ...rc, invoice_ids: [iv] });
  assert.equal(receipts.getReceipt(db, plain)!.receipt.is_tax_invoice, false);

  // an invoice covered by a tax-invoice receipt cannot get a delivery tax invoice
  const full = receipts.saveReceipt(db, null, { ...rc, invoice_ids: [other] });
  assert.equal(receipts.getReceipt(db, full)!.receipt.is_tax_invoice, true);
  assert.ok(tax.taxInvoiceBlockReason(db, other)!.includes("ใบเสร็จรับเงิน/ใบกำกับภาษีแล้ว"));

  // cancelling unlocks; it can then be reissued
  tax.cancelTaxInvoice(db, id);
  assert.equal(store.getDocument(db, iv)!.has_tax_invoice, false);
  assert.ok(tax.issueTaxInvoice(db, iv, { tax_date: today, notes: "" }));
});

test("delete document: drafts and cancelled only, never while referenced", async () => {
  const { deleteDocument } = await import("./delete-document.ts");
  const receipts = await import("./receipts.ts");
  const billing = await import("./billing.ts");

  const draft = newDoc("QT");
  deleteDocument(db, "QT", draft);
  assert.equal(store.getDocument(db, draft), null);
  assert.throws(() => deleteDocument(db, "QT", draft), /ไม่พบเอกสาร/);

  const iv = newDoc("IV");
  assert.throws(() => deleteDocument(db, "QT", iv), /ไม่พบเอกสาร/); // wrong type
  store.setDocumentStatus(db, iv, "sent");
  assert.throws(() => deleteDocument(db, "IV", iv), /ฉบับร่างหรือที่ยกเลิก/);

  const bl = billing.saveBillingNote(db, null, { customer_id: customerId, issue_date: today, due_date: addDays(today, 30), notes: "", invoice_ids: [iv] });
  const rc = receipts.saveReceipt(db, null, { customer_id: customerId, receipt_date: today, payment_method: "cash", payment_ref: "", notes: "", invoice_ids: [iv] });
  assert.throws(() => deleteDocument(db, "RC", rc), /ฉบับร่างหรือที่ยกเลิก/);
  assert.throws(() => deleteDocument(db, "BL", bl), /ฉบับร่างหรือที่ยกเลิก/);

  receipts.cancelReceipt(db, rc);
  billing.cancelBillingNote(db, bl);
  store.setDocumentStatus(db, iv, "cancelled");
  assert.throws(() => deleteDocument(db, "IV", iv), /เอกสารอ้างอิงอยู่/);
  deleteDocument(db, "RC", rc);
  deleteDocument(db, "BL", bl);
  deleteDocument(db, "IV", iv);
  assert.equal(store.getDocument(db, iv), null);
});
