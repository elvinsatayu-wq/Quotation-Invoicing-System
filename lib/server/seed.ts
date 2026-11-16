// Sample data, written once into a new database. All names, tax IDs and bank accounts are fictional.
// Dates are relative to today so the dashboard always shows current and overdue amounts.

import { addDays, todayTh } from "../format.ts";
import type { DocStatus, DocType } from "../types.ts";
import { saveBillingNote } from "./billing.ts";
import { saveReceipt } from "./receipts.ts";
import { issueTaxInvoice } from "./tax-invoices.ts";
import { insertDocument } from "./store.ts";
import type { Db } from "./tx.ts";
import { createUser } from "./users.ts";

export const DEMO_USER = { email: "demo@example.com", password: "demo1234", name: "ผู้ใช้ทดลอง" };

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const customerId = (n: number) => `00000000-0000-4000-8001-00000000000${n}`;

const CUSTOMERS: [string, string, string | null, string | null, string, string, string | null, number][] = [
  ["บริษัท ก้าวหน้าเทรดดิ้ง จำกัด", "12 ถนนสมมติ แขวงทดลอง เขตสาธิต กรุงเทพมหานคร 10100", "0105500000011", "สำนักงานใหญ่", "คุณสมชาย", "081-000-0001", "somchai@example.com", 30],
  ["ห้างหุ้นส่วนจำกัด รุ่งเรืองก่อสร้าง", "45/6 หมู่ 2 ตำบลทดสอบ อำเภอเมือง เชียงใหม่ 50000", "0503500000022", "สำนักงานใหญ่", "คุณวิภา", "081-000-0002", "wipa@example.com", 45],
  ["บริษัท ธรรมชาติฟู้ดส์ จำกัด", "88 ถนนจำลอง ตำบลตัวอย่าง อำเภอเมือง ชลบุรี 20000", "0205500000033", "สาขา 00001", "คุณนภา", "081-000-0003", "napa@example.com", 60],
  ["ร้านใบไม้คาเฟ่", "7 ซอยทดลอง ถนนสาธิต ขอนแก่น 40000", null, null, "คุณต้น", "081-000-0004", null, 0],
  ["บริษัท เอเชียโลจิสติกส์ จำกัด", "200 อาคารตัวอย่าง ชั้น 5 กรุงเทพมหานคร 10500", "0105500000055", "สำนักงานใหญ่", "คุณปรีชา", "081-000-0005", "preecha@example.com", 30],
];

const PRODUCTS: [string, string, string, number, boolean][] = [
  ["SV-WEB-01", "ออกแบบและพัฒนาเว็บไซต์", "งาน", 45000, true],
  ["SV-MA-01", "ดูแลระบบรายเดือน", "เดือน", 8500, true],
  ["SV-CON-01", "ที่ปรึกษาด้านไอที", "ชั่วโมง", 2500, true],
  ["SV-TRN-01", "อบรมการใช้งานระบบ", "วัน", 15000, true],
  ["HW-LAP-01", "โน้ตบุ๊กสำนักงาน", "เครื่อง", 24900, true],
  ["HW-MON-01", "จอภาพ 24 นิ้ว", "จอ", 4590, true],
  ["SW-LIC-01", "ไลเซนส์ซอฟต์แวร์รายปี", "ไลเซนส์", 3200, true],
  ["BK-01", "หนังสือคู่มือการใช้งาน", "เล่ม", 350, false],
];

type SeedDoc = {
  key: string;
  customer: number;
  type: DocType;
  status: DocStatus;
  issue: number;
  due: number;
  wht: number;
  paid?: number;
  source?: string;
  notes?: string;
  items: [code: string, quantity: number][];
};

// Oldest first, so running numbers read in date order.
const DOCUMENTS: SeedDoc[] = [
  { key: "qt-web", customer: 1, type: "QT", status: "approved", issue: -130, due: -100, wht: 3, notes: "ยืนราคา 30 วัน", items: [["SV-WEB-01", 1], ["SV-MA-01", 3]] },
  { key: "iv-web", customer: 1, type: "IV", status: "paid", issue: -125, due: -95, wht: 3, paid: -96, source: "qt-web", items: [["SV-WEB-01", 1], ["SV-MA-01", 3]] },
  { key: "iv-con", customer: 5, type: "IV", status: "paid", issue: -95, due: -65, wht: 3, paid: -70, items: [["SV-CON-01", 12]] },
  { key: "qt-hw", customer: 3, type: "QT", status: "cancelled", issue: -80, due: -50, wht: 0, notes: "ลูกค้าเลื่อนโครงการ", items: [["HW-LAP-01", 5], ["HW-MON-01", 5]] },
  { key: "iv-web2", customer: 3, type: "IV", status: "sent", issue: -75, due: -15, wht: 3, items: [["SV-WEB-01", 1], ["SV-TRN-01", 1]] },
  { key: "iv-trn", customer: 2, type: "IV", status: "paid", issue: -70, due: -25, wht: 3, paid: -30, items: [["SV-TRN-01", 2], ["BK-01", 20]] },
  { key: "iv-lap", customer: 5, type: "IV", status: "approved", issue: -35, due: -5, wht: 0, items: [["HW-LAP-01", 2], ["SW-LIC-01", 2]] },
  { key: "iv-ma", customer: 2, type: "IV", status: "sent", issue: -20, due: 25, wht: 3, items: [["SV-MA-01", 6]] },
  { key: "qt-ready", customer: 3, type: "QT", status: "approved", issue: -6, due: 24, wht: 3, notes: "พร้อมแปลงเป็นใบแจ้งหนี้", items: [["HW-LAP-01", 3], ["HW-MON-01", 3], ["SV-CON-01", 4]] },
  { key: "iv-ma2", customer: 1, type: "IV", status: "sent", issue: -3, due: 27, wht: 3, items: [["SV-MA-01", 2], ["SV-CON-01", 6]] },
  { key: "qt-lic", customer: 5, type: "QT", status: "sent", issue: -2, due: 28, wht: 0, items: [["SW-LIC-01", 10], ["SV-TRN-01", 1]] },
  { key: "iv-cash", customer: 4, type: "IV", status: "paid", issue: -1, due: -1, wht: 0, paid: -1, notes: "ชำระเงินสด", items: [["HW-MON-01", 1], ["BK-01", 2]] },
  { key: "qt-draft", customer: 2, type: "QT", status: "draft", issue: 0, due: 30, wht: 0, items: [["SV-WEB-01", 1]] },
  { key: "iv-draft", customer: 1, type: "IV", status: "draft", issue: 0, due: 30, wht: 3, items: [["SV-CON-01", 8]] },
];

/** Fills an empty database. Called inside the transaction that opened it. */
export function seed(db: Db, today = todayTh()) {
  createUser(db, DEMO_USER.email, DEMO_USER.name, DEMO_USER.password);

  db.prepare(
    `insert into companies (id, name, address, tax_id, phone, email, bank_name, bank_account_name, bank_account_no)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    COMPANY_ID,
    "บริษัท ตัวอย่างดิจิทัล จำกัด",
    "99/9 ถนนตัวอย่าง แขวงทดสอบ เขตสาธิต กรุงเทพมหานคร 10000",
    "0105500000001",
    "02-000-0000",
    "billing@example.com",
    "ธนาคารตัวอย่าง สาขาสาธิต",
    "บริษัท ตัวอย่างดิจิทัล จำกัด",
    "000-0-00000-0",
  );

  const insertCustomer = db.prepare(
    `insert into customers (id, name, address, tax_id, branch, contact_name, phone, email, credit_term_days)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  CUSTOMERS.forEach((c, i) => insertCustomer.run(customerId(i + 1), ...c));

  const insertProduct = db.prepare(
    "insert into products (id, code, name, unit, unit_price, vat_applicable) values (?, ?, ?, ?, ?, ?)",
  );
  const products = new Map<string, { id: string; name: string; unit: string; price: number; vat: boolean }>();
  PRODUCTS.forEach(([code, name, unit, price, vat], i) => {
    const id = `00000000-0000-4000-8002-00000000000${i + 1}`;
    insertProduct.run(id, code, name, unit, price, vat ? 1 : 0);
    products.set(code, { id, name, unit, price, vat });
  });

  const ids = new Map<string, string>();
  for (const doc of DOCUMENTS) {
    const id = insertDocument(
      db,
      {
        company_id: COMPANY_ID,
        customer_id: customerId(doc.customer),
        source_document_id: doc.source ? ids.get(doc.source) : null,
        type: doc.type,
        issue_date: addDays(today, doc.issue),
        due_date: addDays(today, doc.due),
        vat_rate: 7,
        wht_rate: doc.wht,
        notes: doc.notes ?? null,
      },
      doc.items.map(([code, quantity]) => {
        const p = products.get(code)!;
        return {
          product_id: p.id,
          description: p.name,
          unit: p.unit,
          quantity,
          unit_price: p.price,
          vat_applicable: p.vat,
        };
      }),
    );
    // Paid invoices start as sent; their receipts below mark them paid.
    db.prepare("update documents set status = ? where id = ?").run(doc.status === "paid" ? "sent" : doc.status, id);
    ids.set(doc.key, id);
  }

  // One receipt per paid invoice, on its payment date (oldest first for running numbers).
  const paid = DOCUMENTS.filter((doc) => doc.paid !== undefined).sort((a, b) => a.paid! - b.paid!);
  for (const doc of paid) {
    saveReceipt(db, null, {
      customer_id: customerId(doc.customer),
      receipt_date: addDays(today, doc.paid!),
      payment_method: doc.notes === "ชำระเงินสด" ? "cash" : "transfer",
      payment_ref: "",
      notes: "",
      invoice_ids: [ids.get(doc.key)!],
    });
  }

  // The laptops were delivered on the invoice date: tax invoice issued on delivery.
  const laptops = DOCUMENTS.find((doc) => doc.key === "iv-lap")!;
  issueTaxInvoice(db, ids.get("iv-lap")!, { tax_date: addDays(today, laptops.issue), notes: "" });

  // One billing note for the overdue invoice of customer 3.
  saveBillingNote(db, null, {
    customer_id: customerId(3),
    issue_date: addDays(today, -70),
    due_date: addDays(today, -15),
    notes: "วางบิลพร้อมสำเนาใบแจ้งหนี้",
    invoice_ids: [ids.get("iv-web2")!],
  });
}
