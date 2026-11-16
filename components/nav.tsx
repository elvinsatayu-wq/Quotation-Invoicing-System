"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const icon = (d: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-[18px] shrink-0"
    aria-hidden="true"
  >
    {d}
  </svg>
);

const LINKS = [
  {
    href: "/",
    label: "ภาพรวม",
    icon: icon(
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </>,
    ),
  },
  // Billing notes, receipts and tax invoices live under the documents menu.
  {
    href: "/documents",
    label: "เอกสาร",
    also: ["/billing-notes", "/receipts", "/tax-invoices"],
    icon: icon(
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </>,
    ),
  },
  {
    href: "/customers",
    label: "ลูกค้า",
    icon: icon(
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5A6.5 6.5 0 0 1 21.5 20" />
      </>,
    ),
  },
  {
    href: "/products",
    label: "สินค้า/บริการ",
    icon: icon(
      <>
        <path d="m21 8-9-5-9 5 9 5z" />
        <path d="M3 8v8l9 5 9-5V8M12 13v8" />
      </>,
    ),
  },
  {
    href: "/company",
    label: "ข้อมูลบริษัท",
    icon: icon(
      <>
        <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20" />
        <path d="M8 7h4M8 11h4M8 15h4" />
      </>,
    ),
  },
  {
    href: "/users",
    label: "ผู้ใช้งาน",
    adminOnly: true,
    icon: icon(
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>,
    ),
  },
];

export function Nav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-0">
      {LINKS.filter((link) => isAdmin || !("adminOnly" in link)).map(({ href, label, icon, also = [] }) => {
        const active =
          href === "/" ? pathname === "/" : [href, ...also].some((prefix) => pathname.startsWith(prefix));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${
              active
                ? "bg-white font-medium text-accent shadow-sm"
                : "text-white/75 hover:bg-white/10 hover:text-white"
            }`}
          >
            {icon}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
