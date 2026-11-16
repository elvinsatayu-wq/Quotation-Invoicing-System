import type { ReactNode } from "react";
import type { Totals } from "@/lib/calc";
import { formatMoney, STATUS_LABEL } from "@/lib/format";
import type { DocStatus } from "@/lib/types";

const STATUS_STYLE: Record<DocStatus, string> = {
  draft: "bg-slate-100 text-muted",
  sent: "bg-accent-soft text-accent",
  approved: "bg-warn-soft text-warn",
  paid: "bg-good-soft text-good",
  cancelled: "bg-paper text-muted line-through",
};

export function StatusBadge({ status, overdue }: { status: DocStatus; overdue?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
        {STATUS_LABEL[status]}
      </span>
      {overdue && (
        <span className="rounded-full bg-bad-soft px-2.5 py-0.5 text-xs font-medium text-bad">
          เกินกำหนด
        </span>
      )}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-accent">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function ErrorNote({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-bad/15 bg-bad-soft px-3 py-2 text-sm text-bad">
      {message}
    </p>
  );
}

/** Totals block shared by the live builder and the read-only document view. */
export function TotalsList({
  totals,
  vatRate,
  whtRate,
  whtControl,
}: {
  totals: Totals;
  vatRate: number;
  whtRate: number;
  whtControl?: ReactNode;
}) {
  const row = "flex items-center justify-between gap-4 py-1.5 text-sm";
  return (
    <dl>
      <div className={row}>
        <dt className="text-muted">รวมเป็นเงิน (Subtotal)</dt>
        <dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd>
      </div>
      <div className={row}>
        <dt className="text-muted">VAT {vatRate}%</dt>
        <dd className="tabular-nums">{formatMoney(totals.vatAmount)}</dd>
      </div>
      <div className={`${row} border-t border-line font-medium`}>
        <dt>ยอดรวมทั้งสิ้น</dt>
        <dd className="tabular-nums">{formatMoney(totals.grandTotal)}</dd>
      </div>
      <div className={row}>
        <dt className="text-muted">{whtControl ?? `หัก ณ ที่จ่าย ${whtRate}%`}</dt>
        <dd className="tabular-nums">
          {totals.whtAmount > 0 && "−"}
          {formatMoney(totals.whtAmount)}
        </dd>
      </div>
      <div className={`${row} border-t border-line text-base font-semibold`}>
        <dt>ยอดชำระสุทธิ</dt>
        <dd className="tabular-nums">{formatMoney(totals.netTotal)}</dd>
      </div>
    </dl>
  );
}

/** Billing note state: cancelled, fully paid (every invoice settled) or still collecting. */
export function BillingStatusBadge({ status, openCount }: { status: "issued" | "cancelled"; openCount: number }) {
  const [label, style] =
    status === "cancelled"
      ? ["ยกเลิก", "bg-paper text-muted line-through"]
      : openCount === 0
        ? ["ชำระครบแล้ว", "bg-good-soft text-good"]
        : ["วางบิลแล้ว", "bg-accent-soft text-accent"];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${style}`}>{label}</span>
  );
}

/** Receipt state. */
export function ReceiptStatusBadge({ status }: { status: "issued" | "cancelled" }) {
  return status === "cancelled" ? (
    <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-muted line-through">
      ยกเลิก
    </span>
  ) : (
    <span className="rounded-full bg-good-soft px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-good">
      ออกแล้ว
    </span>
  );
}
