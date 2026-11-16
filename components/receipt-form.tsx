"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ErrorNote } from "@/components/ui";
import { saveReceipt } from "@/lib/actions";
import { formatDate, formatMoney, PAYMENT_METHOD_LABEL } from "@/lib/format";
import type { BillableInvoice, Customer, PaymentMethod, ReceiptSummary } from "@/lib/types";

type Props = {
  today: string;
  customers: Customer[];
  /**
   * New receipt: receivable invoices of every customer (the chosen customer's are shown).
   * Editing: the receipt's own invoices, which are fixed.
   */
  invoices: BillableInvoice[];
  receipt?: ReceiptSummary;
  /** A new receipt will be a tax invoice (the company is VAT registered). */
  taxInvoice: boolean;
  initialCustomerId?: string;
  initialInvoiceIds?: string[];
};

const REF_LABEL: Record<PaymentMethod, string> = {
  cash: "เลขอ้างอิง (ถ้ามี)",
  transfer: "เลขอ้างอิงการโอน / ธนาคาร",
  cheque: "เลขที่เช็ค / ธนาคาร / วันที่เช็ค",
  other: "รายละเอียดการชำระ",
};

const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + Math.round(b * 100), 0)) / 100;

export function ReceiptForm(props: Props) {
  const { customers, invoices, receipt, today } = props;
  const editing = Boolean(receipt);
  const companyIssuesTaxInvoices = receipt ? receipt.is_tax_invoice : props.taxInvoice;
  const router = useRouter();
  const [customerId, setCustomerId] = useState(receipt?.customer_id ?? props.initialCustomerId ?? "");
  const [receiptDate, setReceiptDate] = useState(receipt?.receipt_date ?? today);
  const [method, setMethod] = useState<PaymentMethod>(receipt?.payment_method ?? "transfer");
  const [paymentRef, setPaymentRef] = useState(receipt?.payment_ref ?? "");
  const [notes, setNotes] = useState(receipt?.notes ?? "");
  const [selected, setSelected] = useState<string[]>(() => {
    if (receipt) return invoices.map((i) => i.id);
    const allowed = new Set(invoices.filter((i) => i.customer_id === customerId).map((i) => i.id));
    return (props.initialInvoiceIds ?? []).filter((id) => allowed.has(id));
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const customerInvoices = useMemo(
    () => (editing ? invoices : invoices.filter((invoice) => invoice.customer_id === customerId)),
    [editing, invoices, customerId],
  );
  const chosen = customerInvoices.filter((invoice) => selected.includes(invoice.id));
  // Invoices already taxed on delivery get a plain receipt; the two kinds cannot be mixed.
  const alreadyTaxed = chosen.filter((invoice) => invoice.has_tax_invoice).length;
  const mixed = alreadyTaxed > 0 && alreadyTaxed < chosen.length;
  const taxInvoice = receipt ? receipt.is_tax_invoice : companyIssuesTaxInvoices && alreadyTaxed === 0;
  const allChecked = customerInvoices.length > 0 && chosen.length === customerInvoices.length;

  function change<T>(setter: (value: T) => void) {
    return (value: T) => {
      setError(null);
      setter(value);
    };
  }

  function save() {
    if (!customerId) return setError("กรุณาเลือกลูกค้า");
    if (chosen.length === 0) return setError("กรุณาเลือกใบแจ้งหนี้อย่างน้อย 1 ใบ");
    if (receiptDate > today) return setError("วันที่รับเงินต้องไม่เป็นวันในอนาคต");
    if (mixed) return setError("ใบแจ้งหนี้ที่ออกใบกำกับภาษีแล้วกับที่ยังไม่ได้ออก ต้องออกใบเสร็จแยกกัน");

    startTransition(async () => {
      const result = await saveReceipt(receipt?.id ?? null, {
        customer_id: customerId,
        receipt_date: receiptDate,
        payment_method: method,
        payment_ref: paymentRef,
        notes,
        invoice_ids: chosen.map((invoice) => invoice.id),
      });
      if (result.error || !result.id) return setError(result.error);
      // Hidden routes keep their state, so clear the new-receipt form for next time.
      if (!receipt) {
        setCustomerId("");
        setSelected([]);
        setPaymentRef("");
        setNotes("");
      }
      router.push(`/receipts/${result.id}`);
    });
  }

  const selectedCustomer = customers.find((c) => c.id === customerId);

  return (
    <div className="grid grid-cols-1 gap-3">
      <section className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <label className="sm:col-span-3">
          <span className="field-label">ลูกค้า *</span>
          <select
            className="input"
            value={customerId}
            disabled={editing}
            onChange={(event) => {
              change(setCustomerId)(event.target.value);
              setSelected([]);
            }}
          >
            <option value="">— เลือกลูกค้า —</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          {selectedCustomer && (
            <span className="mt-1 block text-sm text-muted">{selectedCustomer.address}</span>
          )}
          {!editing && companyIssuesTaxInvoices && selectedCustomer?.tax_id && !selectedCustomer.branch && (
            <span className="mt-2 block rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
              ลูกค้ารายนี้มีเลขผู้เสียภาษีแต่ยังไม่ระบุสาขา ใบกำกับภาษีควรระบุ &quot;สำนักงานใหญ่&quot; หรือ
              &quot;สาขาที่ ...&quot;{" "}
              <Link href={`/customers/${selectedCustomer.id}`} className="font-medium underline">
                แก้ข้อมูลลูกค้า
              </Link>
            </span>
          )}
        </label>
        <label>
          <span className="field-label">วันที่รับเงิน</span>
          <input
            type="date"
            className="input"
            max={today}
            // A tax invoice's date is fixed once issued.
            disabled={editing && taxInvoice}
            title={editing && taxInvoice ? "วันที่ของใบกำกับภาษีแก้ไขไม่ได้" : undefined}
            value={receiptDate}
            onChange={(event) => change(setReceiptDate)(event.target.value)}
          />
        </label>
        <label>
          <span className="field-label">วิธีชำระเงิน</span>
          <select
            className="input"
            value={method}
            onChange={(event) => change(setMethod)(event.target.value as PaymentMethod)}
          >
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((value) => (
              <option key={value} value={value}>
                {PAYMENT_METHOD_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">{REF_LABEL[method]}</span>
          <input
            className="input"
            value={paymentRef}
            onChange={(event) => change(setPaymentRef)(event.target.value)}
          />
        </label>
      </section>

      <section className="card table-scroll">
        <table className="data-table min-w-[720px]">
          <thead>
            <tr>
              <th className="w-10">
                {!editing && (
                  <input
                    type="checkbox"
                    className="size-4"
                    aria-label="เลือกทั้งหมด"
                    checked={allChecked}
                    disabled={customerInvoices.length === 0}
                    onChange={(event) =>
                      change(setSelected)(event.target.checked ? customerInvoices.map((i) => i.id) : [])
                    }
                  />
                )}
              </th>
              <th>ใบแจ้งหนี้</th>
              <th>วันที่</th>
              <th>ครบกำหนด</th>
              <th className="num">ยอดรวม</th>
              <th className="num">หัก ณ ที่จ่าย</th>
              <th className="num">รับชำระ</th>
            </tr>
          </thead>
          <tbody>
            {customerInvoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  {!editing && (
                    <input
                      type="checkbox"
                      className="size-4"
                      aria-label={`เลือก ${invoice.doc_number}`}
                      checked={selected.includes(invoice.id)}
                      onChange={(event) =>
                        change(setSelected)(
                          event.target.checked
                            ? [...selected, invoice.id]
                            : selected.filter((id) => id !== invoice.id),
                        )
                      }
                    />
                  )}
                </td>
                <td className="whitespace-nowrap">
                  {invoice.doc_number}
                  {invoice.is_overdue && <span className="ml-2 text-xs font-medium text-bad">เกินกำหนด</span>}
                  {!editing && invoice.status === "paid" && (
                    <span className="ml-2 text-xs text-muted">(ชำระแล้ว ยังไม่มีใบเสร็จ)</span>
                  )}
                  {!editing && invoice.has_tax_invoice && (
                    <span className="ml-2 text-xs text-muted">(ออกใบกำกับภาษีแล้ว)</span>
                  )}
                </td>
                <td className="whitespace-nowrap">{formatDate(invoice.issue_date)}</td>
                <td className="whitespace-nowrap">{formatDate(invoice.due_date)}</td>
                <td className="num">{formatMoney(invoice.grand_total)}</td>
                <td className="num">{formatMoney(invoice.wht_amount)}</td>
                <td className="num">{formatMoney(invoice.net_total)}</td>
              </tr>
            ))}
            {customerInvoices.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  {customerId
                    ? "ลูกค้ารายนี้ไม่มีใบแจ้งหนี้ที่รอออกใบเสร็จ (ต้องส่งแล้ว และยังไม่มีใบเสร็จ)"
                    : "เลือกลูกค้าเพื่อดูใบแจ้งหนี้ที่รอรับชำระ"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      {editing && (
        <p className="text-sm text-muted">
          รายการใบแจ้งหนี้ในใบเสร็จแก้ไขไม่ได้ ถ้าต้องการเปลี่ยน ให้ยกเลิกใบเสร็จนี้แล้วออกใบใหม่
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="card p-4">
          <span className="field-label">หมายเหตุ</span>
          <textarea
            rows={3}
            className="input py-2"
            value={notes}
            onChange={(event) => change(setNotes)(event.target.value)}
          />
        </label>
        <dl className="card grid grid-cols-[1fr_auto] content-start gap-y-1.5 p-4 text-sm [&>dd]:pl-4">
          <dt className="text-muted">จำนวนใบแจ้งหนี้</dt>
          <dd className="text-right tabular-nums">{chosen.length} ใบ</dd>
          <dt className="text-muted">ยอดรวม (รวม VAT)</dt>
          <dd className="text-right tabular-nums">{formatMoney(sum(chosen.map((i) => i.grand_total)))}</dd>
          <dt className="text-muted">หัก ณ ที่จ่าย</dt>
          <dd className="text-right tabular-nums">{formatMoney(sum(chosen.map((i) => i.wht_amount)))}</dd>
          <dt className="border-t border-line pt-1.5 text-base font-semibold">ยอดรับชำระ</dt>
          <dd className="border-t border-line pt-1.5 text-right text-base font-semibold tabular-nums">
            {formatMoney(sum(chosen.map((i) => i.net_total)))}
          </dd>
        </dl>
      </div>

      <div className="grid gap-2">
        <ErrorNote message={error} />
        {!editing && (
          <p className="text-sm text-muted">
            {taxInvoice
              ? "ออกเป็นใบเสร็จรับเงิน/ใบกำกับภาษี · "
              : companyIssuesTaxInvoices && alreadyTaxed > 0 && !mixed
                ? "ใบแจ้งหนี้ที่เลือกออกใบกำกับภาษีแล้ว จึงออกเป็นใบเสร็จรับเงินธรรมดา · "
                : ""}
            เมื่อบันทึก ใบแจ้งหนี้ที่เลือกจะเปลี่ยนเป็น &quot;ชำระแล้ว&quot;
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>
            {pending ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "บันทึกใบเสร็จรับเงิน"}
          </button>
          <Link href={receipt ? `/receipts/${receipt.id}` : "/documents?type=RC"} className="btn">
            ยกเลิก
          </Link>
        </div>
      </div>
    </div>
  );
}
