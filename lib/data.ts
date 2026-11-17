// Reads used by pages. Each one checks the session first (Data Access Layer); the database
// then applies row level security to every query (see supabase/schema.sql).
import { requireSuperAdmin, requireUser } from "./auth";
import { createClient, must, type Supabase } from "./supabase/server";
import type {
  BillableInvoice,
  BillingNoteSummary,
  Company,
  Customer,
  DashboardSummary,
  DocumentItem,
  DocumentListRow,
  DocumentSummary,
  Product,
  ReceiptSummary,
  TaxInvoiceSummary,
  TaxParty,
} from "./types";

async function client(): Promise<Supabase> {
  await requireUser();
  return createClient();
}

type Row = Record<string, unknown>;

const num = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;

function toReceipt(row: Row): ReceiptSummary {
  const { seller_snapshot, buyer_snapshot, ...rest } = row;
  return {
    ...rest,
    seller: (seller_snapshot as TaxParty | null) ?? null,
    buyer: (buyer_snapshot as TaxParty | null) ?? null,
    grand_total: num(row.grand_total),
    wht_amount: num(row.wht_amount),
    net_total: num(row.net_total),
  } as ReceiptSummary;
}

function toTaxInvoice(row: Row): TaxInvoiceSummary {
  const { seller_snapshot, buyer_snapshot, ...rest } = row;
  return { ...rest, seller: seller_snapshot, buyer: buyer_snapshot } as TaxInvoiceSummary;
}

// ---------------------------------------------------------------- shared queries

async function companyOf(supabase: Supabase): Promise<Company | null> {
  return must(
    await supabase.from("companies").select("*").order("created_at").order("id").limit(1).maybeSingle(),
  ) as Company | null;
}

async function customerOf(supabase: Supabase, id: string): Promise<Customer | null> {
  return must(await supabase.from("customers").select("*").eq("id", id).maybeSingle()) as Customer | null;
}

async function documentOf(supabase: Supabase, id: string): Promise<DocumentSummary | null> {
  return must(
    await supabase.from("document_summaries").select("*").eq("id", id).maybeSingle(),
  ) as DocumentSummary | null;
}

async function itemsOf(supabase: Supabase, documentId: string): Promise<DocumentItem[]> {
  return must(
    await supabase.from("document_items").select("*").eq("document_id", documentId).order("position"),
  ) as DocumentItem[];
}

/** The live (not cancelled) record of a table that points at an invoice, if any. */
async function liveFor(supabase: Supabase, table: "tax_invoices", invoiceId: string) {
  return must(
    await supabase.from(table).select("id, doc_number").eq("invoice_id", invoiceId).neq("status", "cancelled").maybeSingle(),
  ) as { id: string; doc_number: string } | null;
}

/** The active billing note or receipt an invoice is on, if any. */
async function activeParent(supabase: Supabase, kind: "billing_note" | "receipt", invoiceId: string) {
  const parent = kind === "billing_note" ? "billing_notes" : "receipts";
  const rows = must(
    await supabase
      .from(`${kind}_items`)
      .select(`${parent}!inner(id, doc_number, status)`)
      .eq("invoice_id", invoiceId)
      .neq(`${parent}.status`, "cancelled"),
  ) as unknown as Record<string, { id: string; doc_number: string }>[];
  const found = rows[0]?.[parent];
  return found ? { id: found.id, doc_number: found.doc_number } : null;
}

async function invoicesOf(supabase: Supabase, table: "billing_note_items" | "receipt_items", key: string, id: string) {
  const links = must(
    await supabase.from(table).select("invoice_id, position").eq(key, id).order("position"),
  ) as { invoice_id: string }[];
  if (links.length === 0) return [];
  const rows = must(
    await supabase.from("invoice_rows").select("*").in("id", links.map((l) => l.invoice_id)),
  ) as BillableInvoice[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return links.map((l) => byId.get(l.invoice_id)).filter((r): r is BillableInvoice => Boolean(r));
}

// ---------------------------------------------------------------- company, customers, products

export async function getCompany() {
  return companyOf(await client());
}

export async function listCustomers(): Promise<Customer[]> {
  const supabase = await client();
  return must(await supabase.from("customers").select("*").order("name")) as Customer[];
}

export async function getCustomer(id: string) {
  return customerOf(await client(), id);
}

export async function listProducts(): Promise<Product[]> {
  const supabase = await client();
  return must(await supabase.from("products").select("*").order("code")) as Product[];
}

export async function getProduct(id: string): Promise<Product | null> {
  const supabase = await client();
  return must(await supabase.from("products").select("*").eq("id", id).maybeSingle()) as Product | null;
}

// ---------------------------------------------------------------- dashboard

export async function listOverdue(limit: number): Promise<DocumentSummary[]> {
  const supabase = await client();
  return must(
    await supabase.from("document_summaries").select("*").eq("is_overdue", true).order("due_date").limit(limit),
  ) as DocumentSummary[];
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const supabase = await client();
  return must(await supabase.rpc("dashboard_summary")) as DashboardSummary;
}

// ---------------------------------------------------------------- combined list

export type ListFilter = {
  type?: string;
  /** Any status of any type, or the virtual "unpaid" / "overdue" (invoices). */
  status?: string;
  limit: number;
  offset: number;
};

const LIST_TYPES = ["QT", "IV", "BL", "RC", "TX"];
const LIST_STATUSES = ["draft", "sent", "approved", "paid", "cancelled", "issued"];

export async function listAllDocuments(filter: ListFilter) {
  const supabase = await client();
  let query = supabase.from("document_list").select("*", { count: "exact" });
  if (filter.type && LIST_TYPES.includes(filter.type)) query = query.eq("type", filter.type);
  if (filter.status === "overdue") query = query.eq("is_overdue", true);
  else if (filter.status === "unpaid") query = query.eq("type", "IV").in("status", ["sent", "approved"]);
  else if (filter.status && LIST_STATUSES.includes(filter.status)) query = query.eq("status", filter.status);

  const { data, count, error } = await query
    .order("issue_date", { ascending: false })
    .order("doc_number", { ascending: false })
    .range(filter.offset, filter.offset + filter.limit - 1);
  const rows = must({ data, error }) as Row[];
  return {
    rows: rows.map((r) => ({ ...r, grand_total: num(r.grand_total), net_total: num(r.net_total) }) as DocumentListRow),
    total: count ?? 0,
  };
}

// ---------------------------------------------------------------- quotations & invoices

export async function getDocumentDetail(id: string) {
  const supabase = await client();
  const doc = await documentOf(supabase, id);
  if (!doc) return null;
  const isInvoice = doc.type === "IV";
  const [items, company, customer, source, invoice, billingNote, receipt, taxInvoice, taxInvoiceBlocked] =
    await Promise.all([
      itemsOf(supabase, id),
      // Every document is issued by the one company in Settings.
      companyOf(supabase),
      customerOf(supabase, doc.customer_id),
      doc.source_document_id
        ? supabase.from("documents").select("id, doc_number").eq("id", doc.source_document_id).maybeSingle().then(must)
        : null,
      supabase
        .from("documents")
        .select("id, doc_number")
        .eq("source_document_id", id)
        .neq("status", "cancelled")
        .maybeSingle()
        .then(must),
      isInvoice ? activeParent(supabase, "billing_note", id) : null,
      isInvoice ? activeParent(supabase, "receipt", id) : null,
      isInvoice ? liveFor(supabase, "tax_invoices", id) : null,
      isInvoice ? supabase.rpc("tax_invoice_block_reason", { p_invoice: id }).then(must) : null,
    ]);
  return {
    doc,
    items,
    company: company!,
    customer: customer!,
    source: source as { id: string; doc_number: string } | null,
    invoice: invoice as { id: string; doc_number: string } | null,
    billingNote,
    receipt,
    taxInvoice,
    taxInvoiceBlocked: taxInvoiceBlocked as string | null,
  };
}

// ---------------------------------------------------------------- billing notes

export async function listBillableInvoices(noteId: string | null = null): Promise<BillableInvoice[]> {
  const supabase = await client();
  return must(await supabase.rpc("billable_invoices", { p_note: noteId })) as BillableInvoice[];
}

export async function getBillingNoteDetail(id: string) {
  const supabase = await client();
  const note = must(
    await supabase.from("billing_note_summaries").select("*").eq("id", id).maybeSingle(),
  ) as BillingNoteSummary | null;
  if (!note) return null;
  const [invoices, company, customer] = await Promise.all([
    invoicesOf(supabase, "billing_note_items", "billing_note_id", id),
    companyOf(supabase),
    customerOf(supabase, note.customer_id),
  ]);
  return {
    note: { ...note, grand_total: num(note.grand_total), wht_amount: num(note.wht_amount), net_total: num(note.net_total) },
    invoices,
    company: company!,
    customer: customer!,
  };
}

// ---------------------------------------------------------------- receipts

export async function listReceivableInvoices(): Promise<BillableInvoice[]> {
  const supabase = await client();
  return must(await supabase.rpc("receivable_invoices")) as BillableInvoice[];
}

export async function getReceiptDetail(id: string) {
  const supabase = await client();
  const row = must(await supabase.from("receipt_summaries").select("*").eq("id", id).maybeSingle()) as Row | null;
  if (!row) return null;
  const receipt = toReceipt(row);
  const invoices = await invoicesOf(supabase, "receipt_items", "receipt_id", id);
  const ids = invoices.map((i) => i.id);

  const [documents, allItems, taxInvoices, company, customer] = await Promise.all([
    supabase.from("document_summaries").select("*").in("id", ids).then(must) as Promise<DocumentSummary[]>,
    supabase.from("document_items").select("*").in("document_id", ids).order("position").then(must) as Promise<
      (DocumentItem & { document_id: string })[]
    >,
    supabase.from("tax_invoices").select("invoice_id, doc_number").in("invoice_id", ids).neq("status", "cancelled").then(must) as Promise<
      { invoice_id: string; doc_number: string }[]
    >,
    companyOf(supabase),
    customerOf(supabase, receipt.customer_id),
  ]);
  const docsInOrder = ids.map((docId) => documents.find((d) => d.id === docId)!).filter(Boolean);
  // Every line of every invoice paid, as a tax invoice must list the goods and services.
  const lines = docsInOrder.flatMap((doc) =>
    allItems.filter((item) => item.document_id === doc.id).map((item) => ({ ...item, invoice_number: doc.doc_number })),
  );
  const money = (values: number[]) => Math.round(values.reduce((a, b) => a + Math.round(Number(b) * 100), 0)) / 100;
  const rates = [...new Set(docsInOrder.map((doc) => Number(doc.vat_rate)))];
  return {
    receipt,
    invoices,
    // Delivery tax invoices of the paid invoices (then this receipt is a plain receipt).
    taxInvoiceNumbers: ids
      .map((docId) => taxInvoices.find((t) => t.invoice_id === docId)?.doc_number)
      .filter((n): n is string => Boolean(n)),
    lines,
    tax: {
      subtotal: money(docsInOrder.map((doc) => doc.subtotal)),
      nonVatAmount: money(lines.filter((l) => !l.vat_applicable).map((l) => l.amount)),
      vatAmount: money(docsInOrder.map((doc) => doc.vat_amount)),
      vatRate: rates.length === 1 ? rates[0] : null,
    },
    company: company!,
    customer: customer!,
  };
}

// ---------------------------------------------------------------- tax invoices on delivery

export async function getTaxInvoiceDetail(id: string) {
  const supabase = await client();
  const row = must(await supabase.from("tax_invoice_summaries").select("*").eq("id", id).maybeSingle()) as Row | null;
  if (!row) return null;
  const taxInvoice = toTaxInvoice(row);
  const [invoice, items, company, customer] = await Promise.all([
    documentOf(supabase, taxInvoice.invoice_id),
    itemsOf(supabase, taxInvoice.invoice_id),
    companyOf(supabase),
    customerOf(supabase, taxInvoice.customer_id),
  ]);
  return { taxInvoice, invoice: invoice!, items, company: company!, customer: customer! };
}

/** The invoice a new delivery tax invoice is for, and why it cannot be issued (if so). */
export async function getTaxInvoiceTarget(invoiceId: string) {
  const supabase = await client();
  const invoice = await documentOf(supabase, invoiceId);
  if (!invoice || invoice.type !== "IV") return null;
  const [items, blocked] = await Promise.all([
    itemsOf(supabase, invoiceId),
    supabase.rpc("tax_invoice_block_reason", { p_invoice: invoiceId }).then(must) as Promise<string | null>,
  ]);
  return { invoice, items, blocked };
}

// ---------------------------------------------------------------- accounts (super admin)
// Account and company names only: the super admin never reads any company's business data.

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "user" | "pending";
  company_id: string | null;
  is_super_admin: boolean;
  created_at: string;
};

export type CompanyOption = { id: string; name: string; member_count: number };

export async function listProfiles(): Promise<Profile[]> {
  await requireSuperAdmin();
  const supabase = await createClient();
  return must(await supabase.from("profiles").select("*").order("created_at")) as Profile[];
}

export async function listCompanies(): Promise<CompanyOption[]> {
  await requireSuperAdmin();
  const supabase = await createClient();
  return must(await supabase.rpc("list_companies")) as CompanyOption[];
}
