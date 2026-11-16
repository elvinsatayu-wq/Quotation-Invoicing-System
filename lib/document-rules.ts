import type { DocumentSummary } from "./types";

type EditCheck = Pick<DocumentSummary, "type" | "status" | "has_invoice"> & { has_tax_invoice?: boolean };

/**
 * Why a document cannot be edited, or null when it can.
 * Drafts, sent and approved documents are editable and keep their number and status.
 * Paid and cancelled documents are closed, and a quotation already turned into an
 * invoice is edited on the invoice instead, so the two never disagree. An invoice with a
 * tax invoice issued on delivery is fixed until that tax invoice is cancelled.
 */
export function editBlockReason(doc: EditCheck): string | null {
  if (doc.status === "paid") return "เอกสารที่ชำระแล้วแก้ไขไม่ได้";
  if (doc.status === "cancelled") return "เอกสารที่ยกเลิกแล้วแก้ไขไม่ได้";
  if (doc.type === "IV" && doc.has_tax_invoice) {
    return "ใบแจ้งหนี้นี้ออกใบกำกับภาษีแล้ว แก้ไขไม่ได้ ถ้าต้องแก้ ให้ยกเลิกใบกำกับภาษีก่อน";
  }
  if (doc.type === "QT" && doc.has_invoice) {
    return "ใบเสนอราคานี้แปลงเป็นใบแจ้งหนี้แล้ว กรุณาแก้ไขที่ใบแจ้งหนี้แทน";
  }
  return null;
}

export type DeletableType = "QT" | "IV" | "BL" | "RC" | "TX";

/**
 * Only drafts and cancelled documents can be deleted. Billing notes, receipts and tax
 * invoices have no draft stage, so they must be cancelled first.
 */
export function canDeleteDocument(type: DeletableType, status: string): boolean {
  if (status === "cancelled") return true;
  return (type === "QT" || type === "IV") && status === "draft";
}
