import Link from "next/link";
import { BillingStatusBadge, PageHeader, ReceiptStatusBadge, StatusBadge } from "@/components/ui";
import { DeleteButton } from "@/components/delete-button";
import { deleteDocument } from "@/lib/actions";
import { listAllDocuments } from "@/lib/data";
import { canDeleteDocument, editBlockReason } from "@/lib/document-rules";
import { DOC_TYPE_LABEL, formatDate, formatMoney, STATUS_LABEL } from "@/lib/format";
import type { DocumentListRow } from "@/lib/server/document-list";
import type { DocStatus } from "@/lib/types";

const PAGE_SIZE = 50;

const TYPE_LABEL = { ...DOC_TYPE_LABEL, BL: "ใบวางบิล", RC: "ใบเสร็จรับเงิน", TX: "ใบกำกับภาษี" } as const;

const TYPE_FILTERS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "ทุกประเภท" },
  { value: "QT", label: TYPE_LABEL.QT },
  { value: "IV", label: TYPE_LABEL.IV },
  { value: "BL", label: TYPE_LABEL.BL },
  { value: "RC", label: TYPE_LABEL.RC },
  { value: "TX", label: TYPE_LABEL.TX },
];

const STATUS_VALUES = Object.keys(STATUS_LABEL) as DocStatus[];

const DOCUMENT_STATUS_FILTERS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "ทุกสถานะ" },
  ...STATUS_VALUES.map((value) => ({ value, label: STATUS_LABEL[value] })),
  { value: "unpaid", label: "รอเก็บเงิน" },
  { value: "overdue", label: "เกินกำหนด" },
];

const BILLING_STATUS_FILTERS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "ทุกสถานะ" },
  { value: "issued", label: "วางบิลแล้ว" },
  { value: "paid", label: "ชำระครบแล้ว" },
  { value: "cancelled", label: "ยกเลิก" },
];

const RECEIPT_STATUS_FILTERS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "ทุกสถานะ" },
  { value: "issued", label: "ออกแล้ว" },
  { value: "cancelled", label: "ยกเลิก" },
];

type Filters = { type?: string; status?: string; page?: string };

function statusFiltersFor(type: string | undefined) {
  if (type === "BL") return BILLING_STATUS_FILTERS;
  if (type === "RC" || type === "TX") return RECEIPT_STATUS_FILTERS;
  return DOCUMENT_STATUS_FILTERS;
}

function listHref({ type, status, page }: Filters) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  // Keep the status only if it still exists for the chosen type.
  if (status && statusFiltersFor(type).some((f) => f.value === status)) params.set("status", status);
  if (page && page !== "1") params.set("page", page);
  const query = params.toString();
  return query ? `/documents?${query}` : "/documents";
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-full border px-3 py-1 text-sm whitespace-nowrap ${
        active
          ? "border-accent bg-accent-soft font-medium text-accent"
          : "border-line bg-surface text-muted hover:bg-paper"
      }`}
    >
      {label}
    </Link>
  );
}

/** Where a row links to: billing notes have their own pages. */
function rowLinks(row: DocumentListRow) {
  if (row.type === "TX") {
    // A tax invoice is never edited, only cancelled and reissued.
    return { view: `/tax-invoices/${row.id}`, edit: null, print: `/print/tax-invoice/${row.id}` };
  }
  if (row.type === "RC") {
    return {
      view: `/receipts/${row.id}`,
      edit: row.status === "cancelled" ? null : `/receipts/${row.id}/edit`,
      print: `/print/receipt/${row.id}`,
    };
  }
  if (row.type === "BL") {
    return {
      view: `/billing-notes/${row.id}`,
      edit: row.status === "cancelled" ? null : `/billing-notes/${row.id}/edit`,
      print: `/print/billing/${row.id}`,
    };
  }
  const editable = !editBlockReason({
    type: row.type as "QT" | "IV",
    status: row.status as DocStatus,
    has_invoice: row.has_invoice,
    has_tax_invoice: row.has_tax_invoice,
  });
  return {
    view: `/documents/${row.id}`,
    edit: editable ? `/documents/${row.id}/edit` : null,
    print: `/print/${row.id}`,
  };
}

function RowStatus({ row }: { row: DocumentListRow }) {
  if (row.type === "RC" || row.type === "TX") {
    return <ReceiptStatusBadge status={row.status === "cancelled" ? "cancelled" : "issued"} />;
  }
  if (row.type === "BL") {
    return (
      <BillingStatusBadge
        status={row.status === "cancelled" ? "cancelled" : "issued"}
        openCount={row.status === "paid" ? 0 : 1}
      />
    );
  }
  return <StatusBadge status={row.status as DocStatus} overdue={row.is_overdue} />;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const { type, status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const { rows, total } = await listAllDocuments({ type, status, limit: PAGE_SIZE, offset: from });
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="เอกสาร"
        subtitle={`พบ ${total} รายการ`}
        actions={
          <>
            <Link href="/documents/new?type=QT" className="btn btn-primary">
              สร้างใบเสนอราคา
            </Link>
            <Link href="/documents/new?type=IV" className="btn btn-primary">
              สร้างใบแจ้งหนี้
            </Link>
            <Link href="/billing-notes/new" className="btn btn-primary">
              สร้างใบวางบิล
            </Link>
            <Link href="/receipts/new" className="btn btn-primary">
              ออกใบเสร็จรับเงิน
            </Link>
          </>
        }
      />

      <div className="mb-3 grid gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TYPE_FILTERS.map(({ value, label }) => (
            <FilterChip
              key={label}
              href={listHref({ type: value, status })}
              active={type === value}
              label={label}
            />
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {statusFiltersFor(type).map(({ value, label }) => (
            <FilterChip
              key={label}
              href={listHref({ type, status: value })}
              active={status === value}
              label={label}
            />
          ))}
        </div>
      </div>

      <div className="card table-scroll">
        <table className="data-table min-w-[920px]">
          <thead>
            <tr>
              <th>เลขที่</th>
              <th>ประเภท</th>
              <th>ลูกค้า</th>
              <th>วันที่</th>
              <th>ครบกำหนด</th>
              <th className="num">ยอดรวม</th>
              <th className="num">ยอดสุทธิ</th>
              <th>สถานะ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const links = rowLinks(row);
              return (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">
                    <Link href={links.view} className="font-medium text-accent hover:underline">
                      {row.doc_number}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{TYPE_LABEL[row.type]}</td>
                  <td className="min-w-52">{row.customer_name}</td>
                  <td className="whitespace-nowrap">{formatDate(row.issue_date)}</td>
                  <td className="whitespace-nowrap">{row.type === "RC" || row.type === "TX" ? "–" : formatDate(row.due_date)}</td>
                  <td className="num">{formatMoney(row.grand_total)}</td>
                  <td className="num">{formatMoney(row.net_total)}</td>
                  <td>
                    <RowStatus row={row} />
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {links.edit && (
                      <Link
                        href={links.edit}
                        className="mr-3 text-sm text-accent hover:underline"
                        aria-label={`แก้ไข ${row.doc_number}`}
                      >
                        แก้ไข
                      </Link>
                    )}
                    <Link
                      href={links.print}
                      target="_blank"
                      className="text-sm text-accent hover:underline"
                      aria-label={`พิมพ์ ${row.doc_number}`}
                    >
                      PDF
                    </Link>
                    {canDeleteDocument(row.type, row.status) && (
                      <span className="ml-3 align-top">
                        <DeleteButton
                          variant="link"
                          name={row.doc_number}
                          action={deleteDocument.bind(null, row.type, row.id)}
                        />
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted">
                  ไม่พบเอกสารตามตัวกรองนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {lastPage > 1 && (
        <nav className="mt-3 flex items-center justify-between text-sm text-muted">
          {page > 1 ? (
            <Link href={listHref({ type, status, page: String(page - 1) })} className="btn">
              ก่อนหน้า
            </Link>
          ) : (
            <span />
          )}
          <span>
            หน้า {page} จาก {lastPage}
          </span>
          {page < lastPage ? (
            <Link href={listHref({ type, status, page: String(page + 1) })} className="btn">
              ถัดไป
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
