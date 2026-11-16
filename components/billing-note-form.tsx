"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ErrorNote } from "@/components/ui";
import { saveBillingNote } from "@/lib/actions";
import { formatDate, formatMoney } from "@/lib/format";
import type { BillableInvoice, BillingNoteSummary, Customer } from "@/lib/types";

type Props = {
  today: string;
  customers: Customer[];
  /** Billable invoices of every customer; the form shows the chosen customer's. */
  invoices: BillableInvoice[];
  note?: BillingNoteSummary;
  noteInvoiceIds?: string[];
  /** Preselection, e.g. from the "create billing note" button on an invoice. */
  initialCustomerId?: string;
  initialInvoiceIds?: string[];
};

type FormState = {
  customerId: string;
  issueDate: string;
  dueDate: string;
  dueTouched: boolean;
  notes: string;
  selected: string[];
};

function initialState(props: Props): FormState {
  if (props.note) {
    return {
      customerId: props.note.customer_id,
      issueDate: props.note.issue_date,
      dueDate: props.note.due_date,
      dueTouched: true,
      notes: props.note.notes ?? "",
      selected: props.noteInvoiceIds ?? [],
    };
  }
  const customerId = props.initialCustomerId ?? "";
  const allowed = new Set(props.invoices.filter((i) => i.customer_id === customerId).map((i) => i.id));
  return {
    customerId,
    issueDate: props.today,
    dueDate: props.today,
    dueTouched: false,
    notes: "",
    selected: (props.initialInvoiceIds ?? []).filter((id) => allowed.has(id)),
  };
}

const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + Math.round(b * 100), 0)) / 100;

export function BillingNoteForm(props: Props) {
  const { customers, invoices, note } = props;
  const router = useRouter();
  const [form, setForm] = useState(() => initialState(props));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const customerInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.customer_id === form.customerId),
    [invoices, form.customerId],
  );
  const chosen = customerInvoices.filter((invoice) => form.selected.includes(invoice.id));

  // Until the user picks a date, pay-by follows the latest due date of the chosen invoices.
  const latestDue = chosen.reduce((latest, i) => (i.due_date > latest ? i.due_date : latest), form.issueDate);
  const dueDate = form.dueTouched ? form.dueDate : latestDue;

  function update(patch: Partial<FormState>) {
    setError(null);
    setForm((current) => ({ ...current, ...patch }));
  }

  function toggle(id: string, on: boolean) {
    update({ selected: on ? [...form.selected, id] : form.selected.filter((x) => x !== id) });
  }

  const allChecked = customerInvoices.length > 0 && chosen.length === customerInvoices.length;

  function save() {
    if (!form.customerId) return setError("กรุณาเลือกลูกค้า");
    if (chosen.length === 0) return setError("กรุณาเลือกใบแจ้งหนี้อย่างน้อย 1 ใบ");
    if (dueDate < form.issueDate) return setError("วันนัดชำระต้องไม่ก่อนวันที่วางบิล");

    startTransition(async () => {
      const result = await saveBillingNote(note?.id ?? null, {
        customer_id: form.customerId,
        issue_date: form.issueDate,
        due_date: dueDate,
        notes: form.notes,
        // Keep the on-screen order (by invoice date).
        invoice_ids: chosen.map((invoice) => invoice.id),
      });
      if (result.error || !result.id) return setError(result.error);
      // Hidden routes keep their state, so clear the new-note form for next time.
      if (!note) setForm(initialState({ ...props, initialCustomerId: undefined, initialInvoiceIds: [] }));
      router.push(`/billing-notes/${result.id}`);
    });
  }

  const selectedCustomer = customers.find((c) => c.id === form.customerId);

  return (
    <div className="grid grid-cols-1 gap-3">
      <section className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <label className="sm:col-span-3">
          <span className="field-label">ลูกค้า *</span>
          <select
            className="input"
            value={form.customerId}
            onChange={(event) => update({ customerId: event.target.value, selected: [] })}
          >
            <option value="">— เลือกลูกค้า —</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          {selectedCustomer && (
            <span className="mt-1 block text-sm text-muted">
              {selectedCustomer.address} · เครดิต {selectedCustomer.credit_term_days} วัน
            </span>
          )}
        </label>
        <label>
          <span className="field-label">วันที่วางบิล</span>
          <input
            type="date"
            className="input"
            value={form.issueDate}
            onChange={(event) => update({ issueDate: event.target.value })}
          />
        </label>
        <label>
          <span className="field-label">วันนัดชำระ</span>
          <input
            type="date"
            className="input"
            value={dueDate}
            onChange={(event) => update({ dueDate: event.target.value, dueTouched: true })}
          />
        </label>
      </section>

      <section className="card table-scroll">
        <table className="data-table min-w-[720px]">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  className="size-4"
                  aria-label="เลือกทั้งหมด"
                  checked={allChecked}
                  disabled={customerInvoices.length === 0}
                  onChange={(event) =>
                    update({ selected: event.target.checked ? customerInvoices.map((i) => i.id) : [] })
                  }
                />
              </th>
              <th>ใบแจ้งหนี้</th>
              <th>วันที่</th>
              <th>ครบกำหนด</th>
              <th className="num">ยอดรวม</th>
              <th className="num">หัก ณ ที่จ่าย</th>
              <th className="num">ยอดสุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {customerInvoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  <input
                    type="checkbox"
                    className="size-4"
                    aria-label={`เลือก ${invoice.doc_number}`}
                    checked={form.selected.includes(invoice.id)}
                    onChange={(event) => toggle(invoice.id, event.target.checked)}
                  />
                </td>
                <td className="whitespace-nowrap">
                  {invoice.doc_number}
                  {invoice.is_overdue && <span className="ml-2 text-xs font-medium text-bad">เกินกำหนด</span>}
                  {(invoice.status === "paid" || invoice.status === "cancelled") && (
                    <span className="ml-2 text-xs text-muted">
                      ({invoice.status === "paid" ? "ชำระแล้ว" : "ยกเลิก"})
                    </span>
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
                  {form.customerId
                    ? "ลูกค้ารายนี้ไม่มีใบแจ้งหนี้ที่รอวางบิล (ต้องส่งแล้วและยังไม่ชำระ)"
                    : "เลือกลูกค้าเพื่อดูใบแจ้งหนี้ที่รอวางบิล"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="card p-4">
          <span className="field-label">หมายเหตุ</span>
          <textarea
            rows={3}
            className="input py-2"
            value={form.notes}
            onChange={(event) => update({ notes: event.target.value })}
          />
        </label>
        <dl className="card grid grid-cols-[1fr_auto] content-start gap-y-1.5 p-4 text-sm [&>dd]:pl-4">
          <dt className="text-muted">จำนวนใบแจ้งหนี้</dt>
          <dd className="text-right tabular-nums">{chosen.length} ใบ</dd>
          <dt className="text-muted">ยอดรวม (รวม VAT)</dt>
          <dd className="text-right tabular-nums">{formatMoney(sum(chosen.map((i) => i.grand_total)))}</dd>
          <dt className="text-muted">หัก ณ ที่จ่าย</dt>
          <dd className="text-right tabular-nums">{formatMoney(sum(chosen.map((i) => i.wht_amount)))}</dd>
          <dt className="border-t border-line pt-1.5 text-base font-semibold">ยอดวางบิลสุทธิ</dt>
          <dd className="border-t border-line pt-1.5 text-right text-base font-semibold tabular-nums">
            {formatMoney(sum(chosen.map((i) => i.net_total)))}
          </dd>
        </dl>
      </div>

      <div className="grid gap-2">
        <ErrorNote message={error} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>
            {pending ? "กำลังบันทึก…" : note ? "บันทึกการแก้ไข" : "บันทึกใบวางบิล"}
          </button>
          <Link href={note ? `/billing-notes/${note.id}` : "/documents?type=BL"} className="btn">
            ยกเลิก
          </Link>
        </div>
      </div>
    </div>
  );
}
