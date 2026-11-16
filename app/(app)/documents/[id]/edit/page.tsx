import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentBuilder } from "@/components/document-builder";
import { ErrorNote, PageHeader, StatusBadge } from "@/components/ui";
import { getDocumentDetail, listCustomers, listProducts } from "@/lib/data";
import { editBlockReason } from "@/lib/document-rules";
import { DOC_TYPE_LABEL, todayTh } from "@/lib/format";

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getDocumentDetail(id);
  if (!detail) notFound();
  const { doc, items, company } = detail;
  const backHref = `/documents/${doc.id}`;
  const blocked = editBlockReason(doc);

  const header = (
    <PageHeader
      title={
        <span className="flex flex-wrap items-center gap-2">
          แก้ไข {doc.doc_number}
          <StatusBadge status={doc.status} overdue={doc.is_overdue} />
        </span>
      }
      subtitle={`${DOC_TYPE_LABEL[doc.type]} · เลขที่และสถานะเอกสารจะไม่เปลี่ยน`}
    />
  );

  if (blocked) {
    return (
      <div className="grid max-w-xl gap-3">
        {header}
        <ErrorNote message={blocked} />
        <div>
          <Link href={backHref} className="btn">
            กลับไปที่เอกสาร
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {header}
      {doc.status !== "draft" && (
        <p className="mb-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          เอกสารนี้{doc.status === "sent" ? "ส่งให้ลูกค้า" : "อนุมัติ"}แล้ว หลังแก้ไขควรพิมพ์และส่งฉบับใหม่ให้ลูกค้า
        </p>
      )}
      <DocumentBuilder
        key={doc.id}
        type={doc.type}
        today={todayTh()}
        company={company}
        customers={await listCustomers()}
        products={await listProducts()}
        document={doc}
        items={items}
        returnHref={backHref}
      />
    </>
  );
}
