import { DocumentBuilder } from "@/components/document-builder";
import { PageHeader } from "@/components/ui";
import { getCompany, listCustomers, listProducts } from "@/lib/data";
import { DOC_TYPE_LABEL, todayTh } from "@/lib/format";
import type { DocType } from "@/lib/types";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type: typeParam } = await searchParams;
  const type: DocType = typeParam === "IV" ? "IV" : "QT";

  const [company, customers, products] = await Promise.all([
    getCompany(),
    listCustomers(),
    listProducts(),
  ]);

  return (
    <>
      <PageHeader title={`สร้าง${DOC_TYPE_LABEL[type]}`} subtitle="เลขที่เอกสารจะออกให้เมื่อบันทึก" />
      <DocumentBuilder
        key={type}
        type={type}
        today={todayTh()}
        company={company}
        customers={customers}
        products={products}
      />
    </>
  );
}
