// Building blocks of the printable A4 pages (app/print). Server components.
import Link from "next/link";
import type { ReactNode } from "react";
import { PrintToolbar } from "@/components/print-toolbar";
import type { Company, TaxParty } from "@/lib/types";

/**
 * Screen preview with toolbar; prints as bare A4 sheets. A stamp marks drafts or cancelled
 * copies. With `copies` (e.g. ต้นฉบับ, สำเนา) one sheet is printed per copy, each on its own page.
 */
export function PrintSheet({
  backHref,
  fileName,
  stamp,
  copies,
  toolbarExtra,
  children,
}: {
  backHref: string;
  fileName: string;
  stamp?: string;
  copies?: string[];
  toolbarExtra?: ReactNode;
  children: ReactNode | ((copy: string | undefined) => ReactNode);
}) {
  const labels = copies?.length ? copies : [undefined];
  return (
    <div className="print-root min-h-dvh bg-paper py-6 print:bg-white print:py-0">
      <PrintToolbar backHref={backHref} fileName={fileName} extra={toolbarExtra} />
      {labels.map((label, index) => (
        <article key={index} className="sheet relative mx-auto bg-white text-[13px] leading-relaxed text-ink">
          {stamp && (
            <p className="stamp pointer-events-none absolute top-[38%] left-1/2 -translate-x-1/2 -rotate-12 rounded-lg border-4 border-bad/30 px-8 py-2 text-6xl font-bold text-bad/25">
              {stamp}
            </p>
          )}
          {typeof children === "function" ? children(label) : children}
        </article>
      ))}
    </div>
  );
}

export function PrintHeader({
  company,
  title,
  titleEn,
  copyLabel,
}: {
  company: Company;
  title: string;
  titleEn: string;
  /** ต้นฉบับ / สำเนา */
  copyLabel?: string;
}) {
  return (
    <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
      <div className="flex min-w-0 gap-3">
        {company.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- printed as is from any URL
          <img src={company.logo_url} alt="" className="h-14 w-14 shrink-0 object-contain" />
        )}
        <div className="min-w-0">
          <p className="text-base font-semibold">{company.name}</p>
          <p className="text-muted">{company.address}</p>
          <p className="text-muted">
            เลขประจำตัวผู้เสียภาษี {company.tax_id} ({company.branch})
          </p>
          {(company.phone || company.email) && (
            <p className="text-muted">
              {[company.phone && `โทร ${company.phone}`, company.email].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {copyLabel && (
          <p className="mb-1 inline-block rounded border border-ink px-2 text-xs font-semibold">{copyLabel}</p>
        )}
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted">{titleEn}</p>
      </div>
    </header>
  );
}

type PartyDetails = TaxParty & { contact_name?: string | null; phone?: string | null };

/** Customer box beside a list of document facts (number, dates, ...). */
export function PrintParties({
  customer,
  facts,
  label = "ลูกค้า",
}: {
  customer: PartyDetails;
  facts: [string, ReactNode][];
  label?: string;
}) {
  return (
    <section className="mt-4 grid grid-cols-[1fr_auto] gap-6">
      <div className="rounded-md border border-line p-3">
        <p className="font-medium text-muted">{label}</p>
        <p className="font-semibold">{customer.name}</p>
        <p>{customer.address}</p>
        {customer.tax_id && (
          <p>
            เลขประจำตัวผู้เสียภาษี {customer.tax_id}
            {customer.branch && ` (${customer.branch})`}
          </p>
        )}
        {(customer.contact_name || customer.phone) && (
          <p>
            {[customer.contact_name, customer.phone && `โทร ${customer.phone}`].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <dl className="grid min-w-52 grid-cols-[auto_auto] content-start gap-x-4 gap-y-1 rounded-md border border-line p-3">
        {facts.map(([label, value], index) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className={`text-right ${index === 0 ? "font-semibold" : ""}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PrintBank({ company }: { company: Company }) {
  if (!company.bank_name) return null;
  return (
    <div className="mt-3">
      <p className="font-medium text-muted">ชำระเงินโดยโอนเข้าบัญชี</p>
      <p>{company.bank_name}</p>
      <p>
        ชื่อบัญชี {company.bank_account_name} เลขที่ {company.bank_account_no}
      </p>
    </div>
  );
}

export function PrintSignatures({ roles }: { roles: string[] }) {
  return (
    <footer className="keep-together mt-14 grid grid-cols-2 gap-10 text-center">
      {roles.map((role) => (
        <div key={role}>
          <div className="mx-auto mb-1 h-10 w-48 border-b border-dotted border-ink" />
          <p>{role}</p>
          <p className="text-muted">วันที่ ......../......../........</p>
        </div>
      ))}
    </footer>
  );
}

export const COPY_OPTIONS = [
  { value: "both", label: "ต้นฉบับ + สำเนา", copies: ["ต้นฉบับ", "สำเนา"] },
  { value: "original", label: "ต้นฉบับ", copies: ["ต้นฉบับ"] },
  { value: "copy", label: "สำเนา", copies: ["สำเนา"] },
];

export function copyOption(value: string | undefined) {
  return COPY_OPTIONS.find((o) => o.value === value) ?? COPY_OPTIONS[0];
}

/** Toolbar links that choose which copies of a tax invoice to print. */
export function CopySelector({ href, current }: { href: string; current: string | undefined }) {
  const selected = copyOption(current);
  return (
    <nav className="flex gap-1.5" aria-label="จำนวนฉบับ">
      {COPY_OPTIONS.map((o) => (
        <Link
          key={o.value}
          href={`${href}?copy=${o.value}`}
          aria-current={o === selected ? "true" : undefined}
          className={`rounded-full border px-3 py-1 text-sm whitespace-nowrap ${
            o === selected ? "border-accent bg-accent-soft font-medium text-accent" : "border-line bg-surface text-muted"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
