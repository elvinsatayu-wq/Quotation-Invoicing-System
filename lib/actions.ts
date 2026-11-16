"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "./auth";
import { AppError } from "./errors";
import { createClient, dbError, must } from "./supabase/server";
import type { DeletableType } from "./document-rules";
import type {
  ActionState,
  BillingNoteInput,
  Customer,
  DocStatus,
  DocumentInput,
  DocumentItemInput,
  Product,
  ReceiptInput,
} from "./types";

function text(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

/** Business-rule errors are shown as is; anything else is logged and reported generically. */
function message(error: unknown) {
  if (error instanceof AppError) return error.message;
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

/** Calls a database function (supabase/schema.sql) and returns its result. */
async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw dbError(error);
  return data as T;
}

/** Runs a database function for a button (no redirect) and reports the result. */
async function run(fn: string, args: Record<string, unknown>): Promise<ActionState> {
  try {
    await rpc(fn, args);
  } catch (error) {
    return { error: message(error) };
  }
  refreshAll();
  return { error: null };
}

/** Runs a database function that creates or saves a record and returns its id. */
async function save(fn: string, args: Record<string, unknown>): Promise<ActionState & { id?: string }> {
  try {
    const id = await rpc<string>(fn, args);
    refreshAll();
    return { error: null, id };
  } catch (error) {
    return { error: message(error) };
  }
}

const TAX_ID_RE = /^\d{13}$/;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const LOGO_MAX_BYTES = 500 * 1024;

// ---------------------------------------------------------------- company (admin)

export async function saveCompany(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const fail = (error: unknown) => {
    form.delete("logo"); // a File cannot be sent back to the form
    return rejected(error, form);
  };

  const supabase = await createClient();
  const current = must(
    await supabase.from("companies").select("logo_url").order("created_at").order("id").limit(1).maybeSingle(),
  );
  let logoUrl = current?.logo_url ?? null;
  const logo = form.get("logo");
  if (form.get("remove_logo") === "on") logoUrl = null;
  if (logo instanceof File && logo.size > 0) {
    if (!LOGO_TYPES.includes(logo.type)) {
      return fail(new AppError("โลโก้ต้องเป็นไฟล์รูป PNG, JPG, WEBP, GIF หรือ SVG"));
    }
    if (logo.size > LOGO_MAX_BYTES) return fail(new AppError("ไฟล์โลโก้ต้องไม่เกิน 500 KB"));
    // Kept in the database as a data URL, so the app needs no file storage.
    logoUrl = `data:${logo.type};base64,${Buffer.from(await logo.arrayBuffer()).toString("base64")}`;
  }

  try {
    await rpc("save_company", {
      p: {
        name: text(form, "name"),
        address: text(form, "address"),
        tax_id: text(form, "tax_id"),
        branch: text(form, "branch"),
        phone: text(form, "phone"),
        email: text(form, "email"),
        logo_url: logoUrl ?? "",
        bank_name: text(form, "bank_name"),
        bank_account_name: text(form, "bank_account_name"),
        bank_account_no: text(form, "bank_account_no"),
        vat_registered: form.get("vat_registered") === "on",
      },
    });
  } catch (error) {
    return fail(error);
  }
  refreshAll();
  return { error: null, saved: true };
}

// ---------------------------------------------------------------- customers

function validateCustomer(values: Omit<Customer, "id">) {
  if (!values.name) throw new AppError("กรุณากรอกชื่อลูกค้า");
  if (values.tax_id && !TAX_ID_RE.test(values.tax_id)) throw new AppError("เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก");
  if (!Number.isInteger(values.credit_term_days) || values.credit_term_days < 0) {
    throw new AppError("เครดิตเทอมต้องเป็นจำนวนวันเต็ม ตั้งแต่ 0 ขึ้นไป");
  }
}

export async function saveCustomer(
  id: string | null,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireUser();
  const creditTerm = text(form, "credit_term_days");
  const values = {
    name: text(form, "name"),
    address: text(form, "address"),
    tax_id: text(form, "tax_id") || null,
    branch: text(form, "branch") || null,
    contact_name: text(form, "contact_name") || null,
    phone: text(form, "phone") || null,
    email: text(form, "email") || null,
    credit_term_days: creditTerm === "" ? NaN : Number(creditTerm),
  };
  try {
    validateCustomer(values);
    const supabase = await createClient();
    if (id) {
      const updated = must(await supabase.from("customers").update(values).eq("id", id).select("id"));
      if (!updated?.length) throw new AppError("ไม่พบลูกค้ารายนี้");
    } else {
      must(await supabase.from("customers").insert(values));
    }
  } catch (error) {
    return rejected(error, form);
  }
  refreshAll();
  redirect("/customers");
}

export async function deleteCustomer(id: string): Promise<ActionState> {
  await requireAdmin();
  try {
    const supabase = await createClient();
    for (const table of ["documents", "billing_notes", "receipts"] as const) {
      const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("customer_id", id);
      if (error) throw dbError(error);
      if (count) throw new AppError("ลบไม่ได้ เพราะลูกค้ารายนี้มีเอกสารอยู่แล้ว");
    }
    must(await supabase.from("customers").delete().eq("id", id));
  } catch (error) {
    return { error: message(error) };
  }
  refreshAll();
  return { error: null };
}

// ---------------------------------------------------------------- products

export async function saveProduct(
  id: string | null,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireUser();
  const price = text(form, "unit_price");
  const values: Omit<Product, "id"> = {
    code: text(form, "code"),
    name: text(form, "name"),
    unit: text(form, "unit"),
    unit_price: price === "" ? NaN : Math.round(Number(price) * 100) / 100,
    vat_applicable: form.get("vat_applicable") === "on",
  };
  try {
    if (!values.code || !values.name || !values.unit) throw new AppError("กรุณากรอกรหัส ชื่อ และหน่วยนับ");
    if (!Number.isFinite(values.unit_price) || values.unit_price < 0) throw new AppError("ราคาต้องไม่ติดลบ");
    const supabase = await createClient();
    const duplicate = must(
      await supabase.from("products").select("id").eq("code", values.code).neq("id", id ?? "00000000-0000-0000-0000-000000000000").limit(1),
    );
    if (duplicate?.length) throw new AppError("รหัสสินค้านี้มีอยู่แล้ว");
    if (id) {
      const updated = must(await supabase.from("products").update(values).eq("id", id).select("id"));
      if (!updated?.length) throw new AppError("ไม่พบสินค้ารายการนี้");
    } else {
      must(await supabase.from("products").insert(values));
    }
  } catch (error) {
    return rejected(error, form);
  }
  refreshAll();
  redirect("/products");
}

/** Items on existing documents keep their copied description and price. */
export async function deleteProduct(id: string): Promise<ActionState> {
  await requireAdmin();
  try {
    const supabase = await createClient();
    must(await supabase.from("products").delete().eq("id", id));
  } catch (error) {
    return { error: message(error) };
  }
  refreshAll();
  return { error: null };
}

// ---------------------------------------------------------------- quotations & invoices

export async function saveDocument(
  id: string | null,
  doc: DocumentInput,
  items: DocumentItemInput[],
): Promise<ActionState & { id?: string }> {
  await requireUser();
  return save("save_document", { p_id: id, p_doc: doc, p_items: items });
}

export async function setDocumentStatus(id: string, status: DocStatus): Promise<ActionState> {
  await requireUser();
  return run("set_document_status", { p_id: id, p_status: status });
}

export async function convertToInvoice(id: string): Promise<ActionState & { id?: string }> {
  await requireUser();
  return save("convert_quotation_to_invoice", { p_id: id });
}

// ---------------------------------------------------------------- billing notes, receipts, tax invoices

export async function saveBillingNote(
  id: string | null,
  input: BillingNoteInput,
): Promise<ActionState & { id?: string }> {
  await requireUser();
  return save("save_billing_note", { p_id: id, p: input });
}

export async function cancelBillingNote(id: string): Promise<ActionState> {
  await requireUser();
  return run("cancel_billing_note", { p_id: id });
}

export async function saveReceipt(
  id: string | null,
  input: ReceiptInput,
): Promise<ActionState & { id?: string }> {
  await requireUser();
  return save("save_receipt", { p_id: id, p: input });
}

export async function cancelReceipt(id: string): Promise<ActionState> {
  await requireUser();
  return run("cancel_receipt", { p_id: id });
}

export async function issueTaxInvoice(
  invoiceId: string,
  input: { tax_date: string; notes: string },
): Promise<ActionState & { id?: string }> {
  await requireUser();
  return save("issue_tax_invoice", { p_invoice: invoiceId, p_tax_date: input.tax_date, p_notes: input.notes });
}

export async function cancelTaxInvoice(id: string): Promise<ActionState> {
  await requireUser();
  return run("cancel_tax_invoice", { p_id: id });
}

// ---------------------------------------------------------------- admin

export async function deleteDocument(type: DeletableType, id: string): Promise<ActionState> {
  await requireAdmin();
  return run("delete_document", { p_type: type, p_id: id });
}

export async function setUserRole(userId: string, role: string): Promise<ActionState> {
  await requireAdmin();
  return run("set_user_role", { p_user: userId, p_role: role });
}
