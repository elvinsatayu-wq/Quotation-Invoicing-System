import { redirect } from "next/navigation";

// Receipts are listed with the other documents.
export default function ReceiptsPage() {
  redirect("/documents?type=RC");
}
