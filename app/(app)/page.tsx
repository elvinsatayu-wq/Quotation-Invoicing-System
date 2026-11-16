import Link from "next/link";
import { MonthlySalesChart } from "@/components/monthly-sales-chart";
import { PageHeader } from "@/components/ui";
import { getDashboardSummary, listOverdue } from "@/lib/data";
import { daysBetween, formatDate, formatMoney, todayTh } from "@/lib/format";

function salesChange(current: number, previous: number) {
  if (previous === 0) return "ไม่มียอดเดือนก่อนให้เทียบ";
  const percent = ((current - previous) / previous) * 100;
  return `${percent >= 0 ? "+" : "−"}${Math.abs(percent).toFixed(1)}% จากเดือนก่อน`;
}

function Stat({
  label,
  value,
  note,
  href,
  critical,
}: {
  label: string;
  value: number;
  note: string;
  href: string;
  critical?: boolean;
}) {
  const alert = critical && value > 0;
  return (
    <Link
      href={href}
      className={`card group relative block overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-lift ${
        alert ? "border-bad/30" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-1 ${alert ? "bg-bad" : "bg-accent"}`}
      />
      <p className={`text-sm ${alert ? "font-medium text-bad" : "text-muted"}`}>{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-accent tabular-nums">
        {formatMoney(value)} <span className="text-sm font-normal text-muted">บาท</span>
      </p>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </Link>
  );
}

export default async function DashboardPage() {
  const [summary, overdue] = await Promise.all([getDashboardSummary(), listOverdue(5)]);
  const today = todayTh();

  return (
    <>
      <PageHeader title="ภาพรวม" subtitle={`ข้อมูล ณ วันที่ ${formatDate(today)}`} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat
          label="ยอดขายเดือนนี้ (ก่อน VAT)"
          value={summary.sales_this_month}
          note={salesChange(summary.sales_this_month, summary.sales_last_month)}
          href="/documents?type=IV"
        />
        <Stat
          label="ยอดรอเก็บเงิน"
          value={summary.arrears_amount}
          note={`${summary.arrears_count} ใบแจ้งหนี้ที่ยังไม่ชำระ`}
          href="/documents?type=IV&status=unpaid"
        />
        <Stat
          label="ยอดเกินกำหนดชำระ"
          value={summary.overdue_amount}
          note={`${summary.overdue_count} ใบแจ้งหนี้ รวมอยู่ในยอดรอเก็บเงิน`}
          href="/documents?type=IV&status=overdue"
          critical
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-3">
          <h2 className="font-semibold text-accent">ยอดขาย 6 เดือนล่าสุด (ก่อน VAT)</h2>
          <MonthlySalesChart data={summary.monthly_sales} />
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="font-semibold text-accent">ใบแจ้งหนี้เกินกำหนด</h2>
          {overdue.length === 0 ? (
            <p className="mt-3 text-sm text-muted">ไม่มีใบแจ้งหนี้เกินกำหนด</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {overdue.map((doc) => (
                <li key={doc.id}>
                  <Link
                    href={`/documents/${doc.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:text-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{doc.customer_name}</span>
                      <span className="block text-xs text-muted">
                        {doc.doc_number} · เกิน {daysBetween(doc.due_date, today)} วัน
                      </span>
                    </span>
                    <span className="text-sm whitespace-nowrap tabular-nums">
                      {formatMoney(doc.net_total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
