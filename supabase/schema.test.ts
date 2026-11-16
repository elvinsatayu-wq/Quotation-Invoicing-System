// Tests for supabase/schema.sql: roles and row level security, and the business rules in the
// Postgres functions. Runs against PGlite (real Postgres, in process), no Supabase needed.

import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { as, openTestDatabase, signUp } from "./test-helpers.ts";

let db: PGlite;
let admin: string;
let staff: string;
let pending: string;
let customerA: string;
let customerB: string;

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
const period = today.slice(0, 4) + today.slice(5, 7);
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

type Row = Record<string, unknown>;

/** Runs SQL as a user and returns the rows. */
async function q<T = Row>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return as(db, user, async () => (await db.query<T>(sql, params)).rows);
}

async function one<T = Row>(user: string | null, sql: string, params: unknown[] = []): Promise<T> {
  return (await q<T>(user, sql, params))[0];
}

/** Asserts that SQL fails with a message matching re. */
async function rejects(user: string | null, sql: string, params: unknown[], re: RegExp) {
  await assert.rejects(() => q(user, sql, params), (error: Error) => {
    assert.match(error.message, re);
    return true;
  });
}

const item = (quantity: number, unit_price: number, vat_applicable = true) => ({
  product_id: "",
  description: "ทดสอบ",
  unit: "ชิ้น",
  quantity,
  unit_price,
  vat_applicable,
});

async function newDoc(type: "QT" | "IV", items = [item(1, 100)], wht = 0, customer = customerA) {
  const doc = { type, customer_id: customer, issue_date: today, due_date: addDays(today, 30), vat_rate: 7, wht_rate: wht, notes: "" };
  const row = await one<{ id: string }>(staff, "select public.save_document(null, $1, $2) as id", [doc, items]);
  return row.id;
}

const getDoc = (id: string) => one(staff, "select * from document_summaries where id = $1", [id]);
const setStatus = (id: string, status: string) => q(staff, "select public.set_document_status($1, $2)", [id, status]);

before(async () => {
  db = await openTestDatabase();
  admin = await signUp(db, "owner@example.com");
  staff = await signUp(db, "staff@example.com");
  pending = await signUp(db, "new@example.com");
  await q(admin, "select public.set_user_role($1, 'user')", [staff]);
  await q(admin, "select public.save_company($1)", [
    { name: "บริษัท ทดสอบ จำกัด", address: "กรุงเทพฯ", tax_id: "0105500000001", branch: "", vat_registered: true },
  ]);
  customerA = (await one<{ id: string }>(staff, "insert into customers (name, tax_id, credit_term_days) values ('ลูกค้า A', '0105500000011', 15) returning id")).id;
  customerB = (await one<{ id: string }>(staff, "insert into customers (name) values ('ลูกค้า B') returning id")).id;
});

test("roles: first account is admin, later ones wait for approval", async () => {
  const roles = await q<{ email: string; role: string }>(admin, "select email, role from profiles order by created_at, email");
  assert.deepEqual(
    Object.fromEntries(roles.map((r) => [r.email, r.role])),
    { "owner@example.com": "admin", "staff@example.com": "user", "new@example.com": "pending" },
  );
  // a user sees only their own profile
  assert.equal((await q(staff, "select * from profiles")).length, 1);
  // only admins change roles, and the last admin cannot be demoted
  await rejects(staff, "select public.set_user_role($1, 'admin')", [staff], /เฉพาะผู้ดูแลระบบ/);
  await rejects(admin, "select public.set_user_role($1, 'user')", [admin], /อย่างน้อย 1 คน/);
  await rejects(admin, "select public.set_user_role($1, 'boss')", [staff], /ไม่ถูกต้อง/);
});

test("access: pending and anonymous users see and change nothing", async () => {
  assert.equal((await q(pending, "select * from customers")).length, 0);
  assert.equal((await q(pending, "select * from document_list")).length, 0);
  await rejects(pending, "insert into customers (name) values ('x')", [], /row-level security/);
  await rejects(pending, "select public.save_document(null, '{}', '[]')", [], /ไม่มีสิทธิ์/);
  await rejects(null, "select * from customers", [], /permission denied/);
  await rejects(null, "select public.dashboard_summary()", [], /permission denied/);
});

test("access: users cannot bypass the functions or do admin work", async () => {
  const id = await newDoc("QT");
  await rejects(staff, "update documents set status = 'approved' where id = $1", [id], /permission denied|row-level security/);
  await rejects(staff, "insert into document_sequences values ('QT', '209901', 1)", [], /permission denied|row-level security/);
  await rejects(staff, "select public.save_company('{}')", [], /เฉพาะผู้ดูแลระบบ/);
  await rejects(staff, "select public.delete_document('QT', $1)", [id], /เฉพาะผู้ดูแลระบบ/);
  // a user's delete of a customer is silently filtered by RLS
  await q(staff, "delete from customers where id = $1", [customerB]);
  assert.ok(await one(staff, "select 1 as ok from customers where id = $1", [customerB]));
});

test("totals and numbering match lib/calc.ts", async () => {
  const id = await newDoc("QT", [item(2, 1.005), item(1.5, 100, false), item(3, 333.33)], 3);
  const doc = await getDoc(id);
  assert.match(String(doc.doc_number), new RegExp(`^QT${period}-\\d{3}$`));
  // lines: 2 x 1.01 = 2.02 (price rounded to satang), 150.00 non-VAT, 999.99
  assert.equal(Number(doc.subtotal), 1152.01);
  assert.equal(Number(doc.vat_amount), 70.14); // 7% of 1002.01
  assert.equal(Number(doc.grand_total), 1222.15);
  assert.equal(Number(doc.wht_amount), 34.56); // 3% of 1152.01
  assert.equal(Number(doc.net_total), 1187.59);

  const next = await getDoc(await newDoc("QT"));
  const n = (s: unknown) => Number(String(s).slice(-3));
  assert.equal(n(next.doc_number), n(doc.doc_number) + 1);
});

test("validation messages", async () => {
  const doc = { type: "QT", customer_id: customerA, issue_date: today, due_date: today, vat_rate: 7, wht_rate: 0, notes: "" };
  const save = (d: object, items: object[]) =>
    rejects.bind(null, staff, "select public.save_document(null, $1, $2)", [d, items]);
  await save(doc, [])(/อย่างน้อย 1 รายการ/);
  await save(doc, [{ ...item(1, 1), description: " " }])(/รายการที่ 1: กรุณากรอกรายละเอียด/);
  await save(doc, [item(1, 1), item(0, 1)])(/รายการที่ 2: จำนวนต้องมากกว่า 0/);
  await save(doc, [item(1, -1)])(/ราคาต้องไม่ติดลบ/);
  await save({ ...doc, customer_id: "nope" }, [item(1, 1)])(/กรุณาเลือกลูกค้า/);
  await save({ ...doc, issue_date: "2026-02-30" }, [item(1, 1)])(/รูปแบบวันที่/);
  await save({ ...doc, due_date: addDays(today, -1) }, [item(1, 1)])(/วันครบกำหนด/);
  await save({ ...doc, vat_rate: 101 }, [item(1, 1)])(/อัตรา VAT ต้องอยู่ระหว่าง 0 ถึง 100/);
  await save({ ...doc, type: "XX" }, [item(1, 1)])(/ประเภทเอกสาร/);
});

test("edit rules, status moves and converting a quotation", async () => {
  const qt = await newDoc("QT", [item(2, 500)]);
  const edit = (id: string, type: string, items: object[]) =>
    q(staff, "select public.save_document($1, $2, $3)", [
      id,
      { type, customer_id: customerA, issue_date: today, due_date: addDays(today, 10), vat_rate: 7, wht_rate: 0, notes: "แก้" },
      items,
    ]);

  await edit(qt, "QT", [item(1, 100), item(1, 50)]);
  assert.equal(Number((await getDoc(qt)).subtotal), 150);
  assert.equal((await q(staff, "select * from document_items where document_id = $1", [qt])).length, 2);
  await assert.rejects(() => edit(qt, "IV", [item(1, 1)]), /เปลี่ยนประเภท/);

  await rejects(staff, "select public.convert_quotation_to_invoice($1)", [qt], /เฉพาะใบเสนอราคาที่อนุมัติ/);
  await assert.rejects(() => setStatus(qt, "approved"), /ไม่สามารถเปลี่ยนสถานะจาก draft เป็น approved/);
  await setStatus(qt, "sent");
  await setStatus(qt, "approved");
  await assert.rejects(() => setStatus(qt, "paid"), /ไม่สามารถเปลี่ยนสถานะ/); // QT is never paid

  const { id: iv } = await one<{ id: string }>(staff, "select public.convert_quotation_to_invoice($1) as id", [qt]);
  const invoice = await getDoc(iv);
  assert.equal(invoice.type, "IV");
  assert.equal(invoice.source_document_id, qt);
  assert.equal(Number(invoice.subtotal), 150);
  assert.equal(new Date(invoice.due_date as Date).toISOString().slice(0, 10), addDays(today, 15)); // credit term
  assert.equal((await getDoc(qt)).has_invoice, true);
  await rejects(staff, "select public.convert_quotation_to_invoice($1)", [qt], /ถูกแปลงเป็นใบแจ้งหนี้แล้ว/);
  await assert.rejects(() => edit(qt, "QT", [item(1, 1)]), /กรุณาแก้ไขที่ใบแจ้งหนี้แทน/);

  await setStatus(iv, "sent");
  await setStatus(iv, "paid");
  assert.equal(new Date((await getDoc(iv)).paid_at as Date).toISOString().slice(0, 10), today);
  await assert.rejects(() => edit(iv, "IV", [item(1, 1)]), /ชำระแล้วแก้ไขไม่ได้/);
  await assert.rejects(() => setStatus(iv, "cancelled"), /ไม่สามารถเปลี่ยนสถานะ/);
});

test("billing notes: unpaid invoices of one customer, one active note each", async () => {
  const ivA = await newDoc("IV");
  const ivB = await newDoc("IV", [item(2, 500)]);
  const draft = await newDoc("IV");
  const other = await newDoc("IV", [item(1, 1)], 0, customerB);
  for (const id of [ivA, ivB, other]) await setStatus(id, "sent");
  const input = { customer_id: customerA, issue_date: today, due_date: addDays(today, 7), notes: "", invoice_ids: [ivA, ivB] };
  const save = (id: string | null, p: object) => q<{ id: string }>(staff, "select public.save_billing_note($1, $2) as id", [id, p]);

  await assert.rejects(() => save(null, { ...input, invoice_ids: [] }), /อย่างน้อย 1/);
  await assert.rejects(() => save(null, { ...input, invoice_ids: [draft] }), /วางบิลไม่ได้/);
  await assert.rejects(() => save(null, { ...input, invoice_ids: [other] }), /ลูกค้ารายอื่น/);
  await assert.rejects(() => save(null, { ...input, due_date: addDays(today, -1) }), /นัดชำระ/);

  const [{ id }] = await save(null, { ...input, invoice_ids: [ivA, ivB, ivA] });
  const note = await one(staff, "select * from billing_note_summaries where id = $1", [id]);
  assert.match(String(note.doc_number), new RegExp(`^BL${period}-\\d{3}$`));
  assert.equal(note.invoice_count, 2);
  assert.equal(Number(note.net_total), 107 + 1070);
  await assert.rejects(() => save(null, { ...input, invoice_ids: [ivA] }), /วางบิลไม่ได้/);
  await save(id, { ...input, invoice_ids: [ivB] }); // editing frees ivA
  assert.equal((await q(staff, "select * from billable_invoices(null) where id = $1", [ivA])).length, 1);

  await q(staff, "select public.cancel_billing_note($1)", [id]);
  await rejects(staff, "select public.cancel_billing_note($1)", [id], /ถูกยกเลิกไปแล้ว/);
  await assert.rejects(() => save(id, input), /ยกเลิกแล้วแก้ไขไม่ได้/);
});

test("receipts: pay invoices, tax invoice snapshot, cancel restores", async () => {
  const ivA = await newDoc("IV", [item(1, 1000)], 3);
  const ivB = await newDoc("IV", [item(2, 500)]);
  await setStatus(ivA, "sent");
  await setStatus(ivB, "sent");
  await setStatus(ivB, "approved");
  const input = { customer_id: customerA, receipt_date: today, payment_method: "transfer", payment_ref: "TRX-1", notes: "", invoice_ids: [ivA, ivB] };
  const save = (id: string | null, p: object) => q<{ id: string }>(staff, "select public.save_receipt($1, $2) as id", [id, p]);

  await assert.rejects(() => save(null, { ...input, receipt_date: addDays(today, 1) }), /อนาคต/);
  await assert.rejects(() => save(null, { ...input, payment_method: "gold" }), /วิธีชำระ/);
  await assert.rejects(() => save(null, { ...input, customer_id: customerB }), /ลูกค้ารายอื่น/);

  const [{ id }] = await save(null, input);
  const receipt = await one(staff, "select * from receipt_summaries where id = $1", [id]);
  assert.match(String(receipt.doc_number), new RegExp(`^RC${period}-\\d{3}$`));
  assert.equal(Number(receipt.net_total), 1070 - 30 + 1070);
  assert.equal(receipt.is_tax_invoice, true);
  assert.equal((receipt.buyer_snapshot as Row).name, "ลูกค้า A");
  assert.equal((await getDoc(ivA)).status, "paid");
  await assert.rejects(() => save(null, { ...input, invoice_ids: [ivA] }), /ออกใบเสร็จไม่ได้/);

  await save(id, { ...input, payment_method: "cheque" });
  await assert.rejects(() => save(id, { ...input, receipt_date: addDays(today, -1) }), /วันที่ของใบกำกับภาษีแก้ไขไม่ได้/);

  await q(staff, "select public.cancel_receipt($1)", [id]);
  assert.equal((await getDoc(ivA)).status, "sent");
  assert.equal((await getDoc(ivB)).status, "approved");
  assert.equal((await getDoc(ivB)).paid_at, null);
  await rejects(staff, "select public.cancel_receipt($1)", [id], /ถูกยกเลิกไปแล้ว/);
});

test("tax invoices on delivery: block reasons, lock the invoice, plain receipt after", async () => {
  const iv = await newDoc("IV");
  const reason = async () => (await one<{ r: string | null }>(staff, "select public.tax_invoice_block_reason($1) as r", [iv])).r;
  assert.match(String(await reason()), /ต้องส่งใบแจ้งหนี้ก่อน/);
  await setStatus(iv, "sent");
  assert.equal(await reason(), null);

  await rejects(staff, "select public.issue_tax_invoice($1, $2, '')", [iv, addDays(today, 1)], /อนาคต/);
  const { id } = await one<{ id: string }>(staff, "select public.issue_tax_invoice($1, $2, ' ส่งครบ ') as id", [iv, today]);
  const tx = await one(staff, "select * from tax_invoice_summaries where id = $1", [id]);
  assert.match(String(tx.doc_number), new RegExp(`^TX${period}-\\d{3}$`));
  assert.equal(tx.notes, "ส่งครบ");
  assert.match(String(await reason()), /ออกใบกำกับภาษีแล้ว/);
  assert.equal((await getDoc(iv)).has_tax_invoice, true);
  await assert.rejects(() => setStatus(iv, "cancelled"), /ยกเลิกใบกำกับภาษีก่อน/);

  // a receipt for an invoice with a delivery tax invoice is a plain receipt, and cannot mix
  const plain = await newDoc("IV");
  await setStatus(plain, "sent");
  const input = { customer_id: customerA, receipt_date: today, payment_method: "cash", payment_ref: "", notes: "" };
  await rejects(staff, "select public.save_receipt(null, $1)", [{ ...input, invoice_ids: [iv, plain] }], /ต้องออกใบเสร็จแยกกัน/);
  const { id: rc } = await one<{ id: string }>(staff, "select public.save_receipt(null, $1) as id", [{ ...input, invoice_ids: [iv] }]);
  assert.equal((await one(staff, "select is_tax_invoice from receipts where id = $1", [rc])).is_tax_invoice, false);

  await q(staff, "select public.cancel_tax_invoice($1)", [id]);
  assert.equal((await getDoc(iv)).has_tax_invoice, false);
});

test("delete (admin): drafts and cancelled only, never while referenced", async () => {
  const draft = await newDoc("QT");
  await q(admin, "select public.delete_document('QT', $1)", [draft]);
  assert.equal(await getDoc(draft), undefined);
  await rejects(admin, "select public.delete_document('QT', $1)", [draft], /ไม่พบเอกสาร/);

  const iv = await newDoc("IV");
  await rejects(admin, "select public.delete_document('QT', $1)", [iv], /ไม่พบเอกสาร/); // wrong type
  await setStatus(iv, "sent");
  await rejects(admin, "select public.delete_document('IV', $1)", [iv], /ฉบับร่างหรือที่ยกเลิก/);

  const { id: bl } = await one<{ id: string }>(staff, "select public.save_billing_note(null, $1) as id", [
    { customer_id: customerA, issue_date: today, due_date: today, notes: "", invoice_ids: [iv] },
  ]);
  const { id: rc } = await one<{ id: string }>(staff, "select public.save_receipt(null, $1) as id", [
    { customer_id: customerA, receipt_date: today, payment_method: "cash", payment_ref: "", notes: "", invoice_ids: [iv] },
  ]);
  await rejects(admin, "select public.delete_document('RC', $1)", [rc], /ฉบับร่างหรือที่ยกเลิก/);
  await q(staff, "select public.cancel_receipt($1)", [rc]);
  await q(staff, "select public.cancel_billing_note($1)", [bl]);
  await setStatus(iv, "cancelled");
  await rejects(admin, "select public.delete_document('IV', $1)", [iv], /เอกสารอ้างอิงอยู่/);
  await q(admin, "select public.delete_document('RC', $1)", [rc]);
  await q(admin, "select public.delete_document('BL', $1)", [bl]);
  await q(admin, "select public.delete_document('IV', $1)", [iv]);
  assert.equal(await getDoc(iv), undefined);
});

test("combined list and dashboard", async () => {
  const types = await q<{ type: string; n: number }>(staff, "select type, count(*)::int as n from document_list group by type");
  const n = Object.fromEntries(types.map((r) => [r.type, r.n]));
  for (const type of ["QT", "IV", "BL", "RC", "TX"]) assert.ok(n[type] > 0, `has ${type}`);

  const overdue = await newDoc("IV");
  // back-date as the database owner: nobody can write documents directly through the API
  await db.query("update documents set issue_date = $2, due_date = $2 where id = $1", [overdue, addDays(today, -40)]);
  await setStatus(overdue, "sent");
  assert.equal((await one(staff, "select is_overdue from document_list where id = $1", [overdue])).is_overdue, true);

  const { s } = await one<{ s: Row }>(staff, "select public.dashboard_summary() as s");
  assert.equal((s.monthly_sales as unknown[]).length, 6);
  assert.ok(Number(s.overdue_count) >= 1);
  assert.ok(Number(s.arrears_amount) >= Number(s.overdue_amount));
});
