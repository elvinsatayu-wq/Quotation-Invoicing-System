export type DocType = "QT" | "IV";
export type DocStatus = "draft" | "sent" | "approved" | "paid" | "cancelled";

export type Company = {
  id: string;
  name: string;
  address: string;
  tax_id: string;
  branch: string;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  /** VAT registered: receipts double as tax invoices. */
  vat_registered: boolean;
};

/** Seller or buyer details printed on a tax invoice, fixed when it is issued. */
export type TaxParty = {
  name: string;
  address: string;
  tax_id: string | null;
  branch: string | null;
};

export type Customer = {
  id: string;
  name: string;
  address: string;
  tax_id: string | null;
  branch: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  credit_term_days: number;
};

export type Product = {
  id: string;
  code: string;
  name: string;
  unit: string;
  unit_price: number;
  vat_applicable: boolean;
};

/** A row of the document_summaries view. */
export type DocumentSummary = {
  id: string;
  company_id: string;
  customer_id: string;
  source_document_id: string | null;
  type: DocType;
  status: DocStatus;
  doc_number: string;
  issue_date: string;
  due_date: string;
  vat_rate: number;
  wht_rate: number;
  notes: string | null;
  paid_at: string | null;
  customer_name: string;
  subtotal: number;
  vat_amount: number;
  grand_total: number;
  wht_amount: number;
  net_total: number;
  is_overdue: boolean;
  /** A quotation that already has a live (not cancelled) invoice. */
  has_invoice: boolean;
  /** An invoice with a live tax invoice issued on delivery. */
  has_tax_invoice: boolean;
};

export type BillingStatus = "issued" | "cancelled";

/** A billing note with totals summed from its invoices. */
export type BillingNoteSummary = {
  id: string;
  customer_id: string;
  customer_name: string;
  doc_number: string;
  issue_date: string;
  due_date: string;
  status: BillingStatus;
  notes: string | null;
  invoice_count: number;
  /** Invoices in the note that are not yet paid or cancelled. */
  open_count: number;
  grand_total: number;
  wht_amount: number;
  net_total: number;
};

/** An invoice as listed on a billing note or offered for one. */
export type BillableInvoice = Pick<
  DocumentSummary,
  "id" | "customer_id" | "doc_number" | "issue_date" | "due_date" | "status" | "grand_total" | "wht_amount" | "net_total" | "is_overdue"
> & { has_tax_invoice?: boolean };

/** A tax invoice issued on delivery of goods (ใบส่งของ/ใบกำกับภาษี). */
export type TaxInvoiceSummary = {
  id: string;
  invoice_id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  doc_number: string;
  tax_date: string;
  notes: string | null;
  status: "issued" | "cancelled";
  seller: TaxParty;
  buyer: TaxParty;
};

export type PaymentMethod = "cash" | "transfer" | "cheque" | "other";

/** A receipt with totals summed from the invoices it pays. */
export type ReceiptSummary = {
  id: string;
  customer_id: string;
  customer_name: string;
  doc_number: string;
  receipt_date: string;
  payment_method: PaymentMethod;
  payment_ref: string | null;
  notes: string | null;
  status: "issued" | "cancelled";
  is_tax_invoice: boolean;
  seller: TaxParty | null;
  buyer: TaxParty | null;
  invoice_count: number;
  grand_total: number;
  wht_amount: number;
  /** Amount actually received (after withholding tax). */
  net_total: number;
};

export type ReceiptInput = {
  customer_id: string;
  receipt_date: string;
  payment_method: PaymentMethod;
  payment_ref: string;
  notes: string;
  /** Only used when creating; a receipt's invoices are fixed once issued. */
  invoice_ids: string[];
};

export type BillingNoteInput = {
  customer_id: string;
  issue_date: string;
  due_date: string;
  notes: string;
  invoice_ids: string[];
};

export type DocumentItem = {
  id: string;
  product_id: string | null;
  position: number;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  vat_applicable: boolean;
  amount: number;
};

export type DashboardSummary = {
  sales_this_month: number;
  sales_last_month: number;
  arrears_amount: number;
  arrears_count: number;
  overdue_amount: number;
  overdue_count: number;
  monthly_sales: { month: string; sales: number }[];
};

export type ActionState = { error: string | null; values?: Record<string, string>; saved?: boolean };

export type DocumentInput = {
  type: DocType;
  customer_id: string;
  issue_date: string;
  due_date: string;
  vat_rate: number;
  wht_rate: number;
  notes: string;
};

export type DocumentItemInput = {
  product_id: string;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  vat_applicable: boolean;
};

/**
 * One row of the combined document list (the document_list view). Billing notes use the
 * state issued / paid / cancelled, receipts and tax invoices issued / cancelled.
 */
export type DocumentListRow = {
  id: string;
  type: "QT" | "IV" | "BL" | "RC" | "TX";
  status: string;
  doc_number: string;
  customer_name: string;
  issue_date: string;
  due_date: string;
  grand_total: number;
  net_total: number;
  is_overdue: boolean;
  has_invoice: boolean;
  has_tax_invoice: boolean;
};
