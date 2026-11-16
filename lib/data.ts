// Reads used by pages. Each one checks the session first (Data Access Layer).
import { requireUser } from "./auth";
import { db } from "./server/db";
import * as billing from "./server/billing";
import * as documentList from "./server/document-list";
import * as receipts from "./server/receipts";
import * as taxInvoices from "./server/tax-invoices";
import * as store from "./server/store";

async function read<T>(fn: (database: ReturnType<typeof db>) => T): Promise<T> {
  await requireUser();
  return fn(db());
}

export const getCompany = () => read(store.getCompany);
export const listCustomers = () => read(store.listCustomers);
export const getCustomer = (id: string) => read((d) => store.getCustomer(d, id));
export const listProducts = () => read(store.listProducts);
export const getProduct = (id: string) => read((d) => store.getProduct(d, id));
export const listDocuments = (filter: store.DocumentFilter) => read((d) => store.listDocuments(d, filter));
export const listOverdue = (limit: number) => read((d) => store.listOverdue(d, limit));
export const getDashboardSummary = () => read((d) => store.dashboardSummary(d));

export async function getDocumentDetail(id: string) {
  return read((d) => {
    const doc = store.getDocument(d, id);
    if (!doc) return null;
    return {
      doc,
      items: store.getDocumentItems(d, id),
      // Every document is issued by the one company in Settings.
      company: store.getCompany(d)!,
      customer: store.getCustomer(d, doc.customer_id)!,
      ...store.getRelatedDocuments(d, doc),
      billingNote: doc.type === "IV" ? billing.billingNoteForInvoice(d, id) : null,
      receipt: doc.type === "IV" ? receipts.receiptForInvoice(d, id) : null,
      taxInvoice: doc.type === "IV" ? taxInvoices.taxInvoiceForInvoice(d, id) : null,
      taxInvoiceBlocked: doc.type === "IV" ? taxInvoices.taxInvoiceBlockReason(d, id) : null,
    };
  });
}

export const listBillingNotes = () => read(billing.listBillingNotes);
export const listAllDocuments = (filter: documentList.ListFilter) =>
  read((d) => documentList.listAllDocuments(d, filter));
export const listBillableInvoices = (noteId: string | null = null) =>
  read((d) => billing.listBillableInvoices(d, noteId));

export async function getBillingNoteDetail(id: string) {
  return read((d) => {
    const found = billing.getBillingNote(d, id);
    if (!found) return null;
    return {
      ...found,
      company: store.getCompany(d)!,
      customer: store.getCustomer(d, found.note.customer_id)!,
    };
  });
}

export const listReceivableInvoices = () => read(receipts.listReceivableInvoices);

export async function getReceiptDetail(id: string) {
  return read((d) => {
    const found = receipts.getReceipt(d, id);
    if (!found) return null;
    const documents = found.invoices.map((invoice) => store.getDocument(d, invoice.id)!);
    // Every line of every invoice paid, as a tax invoice must list the goods and services.
    const lines = documents.flatMap((doc) =>
      store.getDocumentItems(d, doc.id).map((item) => ({ ...item, invoice_number: doc.doc_number })),
    );
    const money = (values: number[]) => Math.round(values.reduce((a, b) => a + Math.round(b * 100), 0)) / 100;
    const rates = [...new Set(documents.map((doc) => doc.vat_rate))];
    return {
      ...found,
      // Delivery tax invoices of the paid invoices (then this receipt is a plain receipt).
      taxInvoiceNumbers: documents
        .map((doc) => taxInvoices.taxInvoiceForInvoice(d, doc.id)?.doc_number)
        .filter((n): n is string => Boolean(n)),
      lines,
      tax: {
        subtotal: money(documents.map((doc) => doc.subtotal)),
        nonVatAmount: money(lines.filter((l) => !l.vat_applicable).map((l) => l.amount)),
        vatAmount: money(documents.map((doc) => doc.vat_amount)),
        vatRate: rates.length === 1 ? rates[0] : null,
      },
      company: store.getCompany(d)!,
      customer: store.getCustomer(d, found.receipt.customer_id)!,
    };
  });
}

export async function getTaxInvoiceDetail(id: string) {
  return read((d) => {
    const taxInvoice = taxInvoices.getTaxInvoice(d, id);
    if (!taxInvoice) return null;
    return {
      taxInvoice,
      invoice: store.getDocument(d, taxInvoice.invoice_id)!,
      items: store.getDocumentItems(d, taxInvoice.invoice_id),
      company: store.getCompany(d)!,
      customer: store.getCustomer(d, taxInvoice.customer_id)!,
    };
  });
}

/** The invoice a new delivery tax invoice is for, and why it cannot be issued (if so). */
export async function getTaxInvoiceTarget(invoiceId: string) {
  return read((d) => {
    const invoice = store.getDocument(d, invoiceId);
    if (!invoice || invoice.type !== "IV") return null;
    return {
      invoice,
      items: store.getDocumentItems(d, invoiceId),
      blocked: taxInvoices.taxInvoiceBlockReason(d, invoiceId),
    };
  });
}
