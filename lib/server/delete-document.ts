// Permanently deletes one document of any type shown in the combined document list.
//
// Only drafts and cancelled documents can be deleted (see canDeleteDocument). A quotation or
// invoice that another document still points to (an invoice made from it, a billing note, a
// receipt or a tax invoice, cancelled or not) cannot be deleted either: that document has to be
// deleted first, so nothing is left referring to a missing record.

import { canDeleteDocument, type DeletableType } from "../document-rules.ts";
import { AppError } from "./store.ts";
import { transaction, type Db } from "./tx.ts";

export type { DeletableType };

const TABLE: Record<DeletableType, string> = {
  QT: "documents",
  IV: "documents",
  BL: "billing_notes",
  RC: "receipts",
  TX: "tax_invoices",
};

function referencedBy(db: Db, documentId: string): string[] {
  const rows = db
    .prepare(
      `select doc_number from documents where source_document_id = :id
       union all
       select b.doc_number from billing_note_items i join billing_notes b on b.id = i.billing_note_id
        where i.invoice_id = :id
       union all
       select r.doc_number from receipt_items i join receipts r on r.id = i.receipt_id
        where i.invoice_id = :id
       union all
       select doc_number from tax_invoices where invoice_id = :id`,
    )
    .all({ id: documentId }) as { doc_number: string }[];
  return rows.map((r) => r.doc_number);
}

export function deleteDocument(db: Db, type: DeletableType, id: string) {
  const table = TABLE[type];
  if (!table) throw new AppError("ประเภทเอกสารไม่ถูกต้อง");
  transaction(db, () => {
    const isDoc = table === "documents";
    const row = db
      .prepare(`select status from ${table} where id = ?${isDoc ? " and type = ?" : ""}`)
      .get(...(isDoc ? [id, type] : [id])) as { status: string } | undefined;
    if (!row) throw new AppError("ไม่พบเอกสารนี้ หรือถูกลบไปแล้ว");
    if (!canDeleteDocument(type, row.status)) {
      throw new AppError("ลบได้เฉพาะเอกสารฉบับร่างหรือที่ยกเลิกแล้วเท่านั้น");
    }
    if (isDoc) {
      const refs = referencedBy(db, id);
      if (refs.length) {
        throw new AppError(`ลบไม่ได้ เพราะมีเอกสารอ้างอิงอยู่ (${refs.join(", ")}) กรุณาลบเอกสารนั้นก่อน`);
      }
    }
    db.prepare(`delete from ${table} where id = ?`).run(id);
  });
}
