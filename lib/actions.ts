"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { db } from "./server/db";
import * as billing from "./server/billing";
import * as receipts from "./server/receipts";
import * as taxInvoices from "./server/tax-invoices";
import * as store from "./server/store";
import * as deletion from "./server/delete-document";
import type { DeletableType } from "./server/delete-document";
import type {
  ActionState,
  BillingNoteInput,
  DocStatus,
  DocumentInput,
  DocumentItemInput,
  ReceiptInput,
} from "./types";

function text(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

/** Business-rule errors are shown as is; anything else is logged and reported generically. */
function message(error: unknown) {
  if (error instanceof store.AppError) return error.message;
  console.error(error);
  return "บันทึกไม่สำเร็จ เกิดข้อผิดพลาดที่ไม่คาดคิด";
}

/** Failure result that hands the input back, because React resets the form after an action. */
function rejected(error: unknown, form: FormData): ActionState {
  return { error: message(error), values: Object.fromEntries(form) as Record<string, string> };
}

function refreshAll() {
  revalidatePath("/", "layout");
}

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const LOGO_MAX_BYTES = 500 * 1024;

export async function saveCompany(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const fail = (error: unknown) => {
    form.delete("logo"); // a File cannot be sent back to the form
    return rejected(error, form);
  };

  const current = store.getCompany(db());
  let logoUrl = current?.logo_url ?? null;
  const logo = form.get("logo");
  if (form.get("remove_logo") === "on") logoUrl = null;
  if (logo instanceof File && logo.size > 0) {
    if (!LOGO_TYPES.includes(logo.type)) {
      return fail(new store.AppError("โลโก้ต้องเป็นไฟล์รูป PNG, JPG, WEBP, GIF หรือ SVG"));
    }
    if (logo.size > LOGO_MAX_BYTES) return fail(new store.AppError("ไฟล์โลโก้ต้องไม่เกิน 500 KB"));
    // Kept in the database as a data URL, so the app needs no file storage.
    logoUrl = `data:${logo.type};base64,${Buffer.from(await logo.arrayBuffer()).toString("base64")}`;
  }

  try {
    store.saveCompany(db(), {
      name: text(form, "name"),
      address: text(form, "address"),
      tax_id: text(form, "tax_id"),
      branch: text(form, "branch"),
      phone: text(form, "phone") || null,
      email: text(form, "email") || null,
      logo_url: logoUrl,
      bank_name: text(form, "bank_name") || null,
      bank_account_name: text(form, "bank_account_name") || null,
      bank_account_no: text(form, "bank_account_no") || null,
      vat_registered: form.get("vat_registered") === "on",
    });
  } catch (error) {
    return fail(error);
  }
  refreshAll();
  return { error: null, saved: true };
}

export async function saveCustomer(
  id: string | null,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireUser();
  const creditTerm = text(form, "credit_term_days");
  try {
    store.saveCustomer(db(), id, {
      name: text(form, "name"),
      address: text(form, "address"),
      tax_id: text(form, "tax_id") || null,
      branch: text(form, "branch") || null,
      contact_name: text(form, "contact_name") || null,
      phone: text(form, "phone") || null,
      email: text(form, "email") || null,
      credit_term_days: creditTerm === "" ? NaN : Number(creditTerm),
    });
  } catch (error) {
    return rejected(error, form);
  }
  refreshAll();
  redirect("/customers");
}

export async function deleteCustomer(id: string): Promise<ActionState> {
  await requireUser();
  try {
    store.deleteCustomer(db(), id);
  } catch (error) {
    return { error: message(error) };
  }
  refreshAll();
  return { error: null };
}

export async function saveProduct(
  id: string | null,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireUser();
  const price = text(form, "unit_price");
  try {
    store.saveProduct(db(), id, {
      code: text(form, "code"),
      name: text(form, "name"),
      unit: text(form, "unit"),
      unit_price: price === "" ? NaN : Number(price),
      vat_applicable: form.get("vat_applicable") === "on",
    });
  } catch (error) {
    return rejected(error, form);
  }
  refreshAll();
  redirect("/products");
}

export async function deleteProduct(id: string): Promise<ActionState> {
  await requireUser();
  try {
    store.deleteProduct(db(), id);
  } catch (error) {
    return { error: message(error) };
  }
  refreshAll();
  return { error: null };
}

export async function saveDocument(
  id: string | null,
  doc: DocumentInput,
  items: DocumentItemInput[],
): Promise<ActionState & { id?: string }> {
  await requireUser();
  try {
    const savedId = store.saveDocument(db(), id, doc, items);
    refreshAll();
    return { error: null, id: savedId };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function setDocumentStatus(id: string, status: DocStatus): Promise<ActionState> {
  await requireUser();
  try {
    store.setDocumentStatus(db(), id, status);
  } catch (error) {
    return { error: message(error) };
  }
  refreshAll();
  return { error: null };
}

export async function convertToInvoice(id: string): Promise<ActionState & { id?: string }> {
  await requireUser();
  try {
    const invoiceId = store.convertQuotationToInvoice(db(), id);
    refreshAll();
    return { error: null, id: invoiceId };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function saveBillingNote(
  id: string | null,
  input: BillingNoteInput,
): Promise<ActionState & { id?: string }> {
  await requireUser();
  try {
    const savedId = billing.saveBillingNote(db(), id, input);
    refreshAll();
    return { error: null, id: savedId };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function cancelBillingNote(id: string): Promise<ActionState> {
  await requireUser();
  try {
    billing.cancelBillingNote(db(), id);
  } catch (error) {
    return { error: message(error) };
  }
  refreshAll();
  return { error: null };
}

export async function saveReceipt(
  id: string | null,
  input: ReceiptInput,
): Promise<ActionState & { id?: string }> {
  await requireUser();
  try {
    const savedId = receipts.saveReceipt(db(), id, input);
    refreshAll();
    return { error: null, id: savedId };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function cancelReceipt(id: string): Promise<ActionState> {
  await requireUser();
  try {
    receipts.cancelReceipt(db(), id);
  } catch (error) {
    return { error: message(error) };
  }
  refreshAll();
  return { error: null };
}

export async function issueTaxInvoice(
  invoiceId: string,
  input: { tax_date: string; notes: string },
): Promise<ActionState & { id?: string }> {
  await requireUser();
  try {
    const id = taxInvoices.issueTaxInvoice(db(), invoiceId, input);
    refreshAll();
    return { error: null, id };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function deleteDocument(type: DeletableType, id: string): Promise<ActionState> {
  await requireUser();
  try {
    deletion.deleteDocument(db(), type, id);
  } catch (error) {
    return { error: message(error) };
  }
  refreshAll();
  return { error: null };
}

export async function cancelTaxInvoice(id: string): Promise<ActionState> {
  await requireUser();
  try {
    taxInvoices.cancelTaxInvoice(db(), id);
  } catch (error) {
    return { error: message(error) };
  }
  refreshAll();
  return { error: null };
}
