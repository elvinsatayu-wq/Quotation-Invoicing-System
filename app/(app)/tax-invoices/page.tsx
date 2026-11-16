import { redirect } from "next/navigation";

// Tax invoices are listed with the other documents.
export default function TaxInvoicesPage() {
  redirect("/documents?type=TX");
}
