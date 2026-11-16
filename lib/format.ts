import type { DocStatus, DocType } from "./types";

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  QT: "ใบเสนอราคา",
  IV: "ใบแจ้งหนี้",
};

export const STATUS_LABEL: Record<DocStatus, string> = {
  draft: "ร่าง",
  sent: "ส่งแล้ว",
  approved: "อนุมัติแล้ว",
  paid: "ชำระแล้ว",
  cancelled: "ยกเลิก",
};

export const PAYMENT_METHOD_LABEL = {
  cash: "เงินสด",
  transfer: "โอนเงิน",
  cheque: "เช็ค",
  other: "อื่น ๆ",
} as const;

const money = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number) {
  return money.format(value);
}

const shortDate = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const shortMonth = new Intl.DateTimeFormat("th-TH", { month: "short", timeZone: "UTC" });

/** Formats a YYYY-MM-DD date, e.g. "7 พ.ย. 2569". */
export function formatDate(date: string) {
  return shortDate.format(new Date(`${date}T00:00:00Z`));
}

export function formatMonth(date: string) {
  return shortMonth.format(new Date(`${date}T00:00:00Z`));
}

export function todayTh() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
