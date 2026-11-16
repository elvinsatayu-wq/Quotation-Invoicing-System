import { redirect } from "next/navigation";

// Billing notes are listed with the other documents.
export default function BillingNotesPage() {
  redirect("/documents?type=BL");
}
