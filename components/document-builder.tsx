"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { ErrorNote, TotalsList } from "@/components/ui";
import { saveDocument } from "@/lib/actions";
import { calcTotals, lineAmount } from "@/lib/calc";
import { addDays, formatMoney } from "@/lib/format";
import type {
  Company,
  Customer,
  DocType,
  DocumentItem,
  DocumentSummary,
  Product,
} from "@/lib/types";

const VAT_RATE = 7;
const QUOTATION_VALID_DAYS = 30;

const WHT_OPTIONS = [
  { rate: 0, label: "ไม่หัก ณ ที่จ่าย" },
  { rate: 1, label: "หัก 1% (ค่าขนส่ง)" },
  { rate: 2, label: "หัก 2% (ค่าโฆษณา)" },
  { rate: 3, label: "หัก 3% (ค่าบริการ)" },
  { rate: 5, label: "หัก 5% (ค่าเช่า)" },
];

type Row = {
  key: string;
  productId: string;
  description: string;
  unit: string;
  // Kept as text so a half-typed value such as "1." survives re-renders.
  quantity: string;
  unitPrice: string;
  vatApplicable: boolean;
};

type FormState = {
  customerId: string;
  issueDate: string;
  dueDate: string;
  whtRate: number;
  notes: string;
  rows: Row[];
};

type Props = {
  type: DocType;
  today: string;
  company: Company | null;
  customers: Customer[];
  products: Product[];
  document?: DocumentSummary;
  items?: DocumentItem[];
  actions?: ReactNode;
  /** Where to go after saving an existing document (the edit page returns to the document). */
  returnHref?: string;
};

function blankRow(key: string): Row {
  return {
    key,
    productId: "",
    description: "",
    unit: "",
    quantity: "1",
    unitPrice: "0",
    vatApplicable: true,
  };
}

function initialForm({ type, today, document, items }: Props): FormState {
  if (!document) {
    return {
      customerId: "",
      issueDate: today,
      dueDate: addDays(today, type === "QT" ? QUOTATION_VALID_DAYS : 0),
      whtRate: 0,
      notes: "",
      rows: [blankRow("row-0")],
    };
  }
  return {
    customerId: document.customer_id,
    issueDate: document.issue_date,
    dueDate: document.due_date,
    whtRate: document.wht_rate,
    notes: document.notes ?? "",
    rows: (items ?? []).map((item, index) => ({
      key: `row-${index}`,
      productId: item.product_id ?? "",
      description: item.description,
      unit: item.unit,
      quantity: String(item.quantity),
      unitPrice: String(item.unit_price),
      vatApplicable: item.vat_applicable,
    })),
  };
}

function comparable(form: FormState) {
  return JSON.stringify({
    ...form,
    rows: form.rows.map((row) => ({
      ...row,
      key: undefined,
      quantity: Number(row.quantity),
      unitPrice: Number(row.unitPrice),
    })),
  });
}

function toLine(row: Row) {
  return {
    quantity: Number(row.quantity) || 0,
    unitPrice: Number(row.unitPrice) || 0,
    vatApplicable: row.vatApplicable,
  };
}

function validate(form: FormState) {
  if (!form.customerId) return "กรุณาเลือกลูกค้า";
  if (!form.issueDate || !form.dueDate) return "กรุณาระบุวันที่ให้ครบ";
  if (form.dueDate < form.issueDate) return "วันครบกำหนดต้องไม่ก่อนวันที่เอกสาร";
  if (form.rows.length === 0) return "เอกสารต้องมีรายการอย่างน้อย 1 รายการ";
  for (const [index, row] of form.rows.entries()) {
    const line = `รายการที่ ${index + 1}: `;
    if (!row.description.trim()) return `${line}กรุณากรอกชื่อรายการ`;
    if (!row.unit.trim()) return `${line}กรุณากรอกหน่วยนับ`;
    if (!(Number(row.quantity) > 0)) return `${line}จำนวนต้องมากกว่า 0`;
    if (!(Number(row.unitPrice) >= 0)) return `${line}ราคาต้องไม่ติดลบ`;
  }
  return null;
}

export function DocumentBuilder(props: Props) {
  const { type, company, customers, products, document, actions, returnHref } = props;
  const router = useRouter();
  const [form, setForm] = useState(() => initialForm(props));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nextRowId = useRef(form.rows.length);

  const totals = useMemo(
    () => calcTotals(form.rows.map(toLine), document?.vat_rate ?? VAT_RATE, form.whtRate),
    [form.rows, form.whtRate, document?.vat_rate],
  );

  // After a save the server sends fresh props, which clears this flag.
  const dirty = comparable(form) !== comparable(initialForm(props));

  function update(patch: Partial<FormState>) {
    setError(null);
    setForm((current) => ({ ...current, ...patch }));
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setError(null);
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));
  }

  function addRow() {
    const row = blankRow(`row-${nextRowId.current++}`);
    setForm((current) => ({ ...current, rows: [...current.rows, row] }));
  }

  function removeRow(key: string) {
    setForm((current) => ({ ...current, rows: current.rows.filter((row) => row.key !== key) }));
  }

  function pickProduct(key: string, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateRow(
      key,
      product
        ? {
            productId,
            description: product.name,
            unit: product.unit,
            unitPrice: String(product.unit_price),
            vatApplicable: product.vat_applicable,
          }
        : { productId: "" },
    );
  }

  // An invoice falls due after the customer's credit term; a quotation has a fixed validity.
  function dueDateFor(issueDate: string, customerId: string) {
    if (type === "QT") return addDays(issueDate, QUOTATION_VALID_DAYS);
    const customer = customers.find((c) => c.id === customerId);
    return addDays(issueDate, customer?.credit_term_days ?? 0);
  }

  function save() {
    const problem = validate(form);
    setError(problem);
    if (problem) return;

    startTransition(async () => {
      const result = await saveDocument(
        document?.id ?? null,
        {
          type,
          customer_id: form.customerId,
          issue_date: form.issueDate,
          due_date: form.dueDate,
          vat_rate: document?.vat_rate ?? VAT_RATE,
          wht_rate: form.whtRate,
          notes: form.notes,
        },
        form.rows.map((row) => ({
          product_id: row.productId,
          description: row.description.trim(),
          unit: row.unit.trim(),
          quantity: Number(row.quantity),
          unit_price: Number(row.unitPrice),
          vat_applicable: row.vatApplicable,
        })),
      );

      if (result.error) {
        setError(result.error);
      } else if (document && returnHref) {
        router.push(returnHref);
      } else if (!document) {
        // Hidden routes keep their state, so clear the form for the next new document.
        setForm(initialForm(props));
        router.push(`/documents/${result.id}`);
      }
    });
  }

  const selectedCustomer = customers.find((c) => c.id === form.customerId);

  return (
    <div className="grid grid-cols-1 gap-3">
      {actions && (
        <div>
          {dirty ? (
            <p className="text-sm text-warn">มีการแก้ไขที่ยังไม่บันทึก บันทึกก่อนจึงจะเปลี่ยนสถานะได้</p>
          ) : (
            actions
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="card p-4 text-sm">
          <h2 className="mb-1 font-medium text-muted">ผู้ออกเอกสาร</h2>
          {company ? (
            <>
              <p className="font-medium">{company.name}</p>
              <p className="text-muted">{company.address}</p>
              <p className="text-muted">
                เลขผู้เสียภาษี {company.tax_id} ({company.branch})
              </p>
            </>
          ) : (
            <p className="text-bad">
              ยังไม่มีข้อมูลบริษัท{" "}
              <Link href="/company" className="font-medium underline">
                ใส่ข้อมูลบริษัท
              </Link>{" "}
              ก่อนออกเอกสาร
            </p>
          )}
        </section>

        <section className="card grid grid-cols-1 gap-3 p-4">
          <label>
            <span className="field-label">ลูกค้า *</span>
            <select
              className="input"
              value={form.customerId}
              onChange={(event) => {
                const customerId = event.target.value;
                update({ customerId, dueDate: dueDateFor(form.issueDate, customerId) });
              }}
            >
              <option value="">เลือกลูกค้า…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          {selectedCustomer && (
            <p className="text-sm text-muted">
              {selectedCustomer.address}
              {selectedCustomer.tax_id && ` · เลขผู้เสียภาษี ${selectedCustomer.tax_id}`}
              {` · เครดิต ${selectedCustomer.credit_term_days} วัน`}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">วันที่เอกสาร</span>
              <input
                type="date"
                className="input"
                value={form.issueDate}
                onChange={(event) => {
                  const issueDate = event.target.value;
                  update({
                    issueDate,
                    dueDate: issueDate ? dueDateFor(issueDate, form.customerId) : form.dueDate,
                  });
                }}
              />
            </label>
            <label>
              <span className="field-label">{type === "QT" ? "ยืนราคาถึง" : "ครบกำหนดชำระ"}</span>
              <input
                type="date"
                className="input"
                min={form.issueDate}
                value={form.dueDate}
                onChange={(event) => update({ dueDate: event.target.value })}
              />
            </label>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="table-scroll">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th className="w-44">สินค้า/บริการ</th>
                <th>รายการ</th>
                <th className="num w-24">จำนวน</th>
                <th className="w-24">หน่วย</th>
                <th className="num w-32">ราคา/หน่วย</th>
                <th className="w-14">VAT</th>
                <th className="num w-32">จำนวนเงิน</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {form.rows.map((row, index) => (
                <tr key={row.key}>
                  <td>
                    <select
                      aria-label={`เลือกสินค้า รายการที่ ${index + 1}`}
                      className="input"
                      value={row.productId}
                      onChange={(event) => pickProduct(row.key, event.target.value)}
                    >
                      <option value="">กรอกเอง</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.code} {product.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={`ชื่อรายการที่ ${index + 1}`}
                      className="input"
                      value={row.description}
                      onChange={(event) => updateRow(row.key, { description: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`จำนวน รายการที่ ${index + 1}`}
                      type="number"
                      min="0"
                      step="any"
                      className="input num"
                      value={row.quantity}
                      onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`หน่วย รายการที่ ${index + 1}`}
                      className="input"
                      value={row.unit}
                      onChange={(event) => updateRow(row.key, { unit: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`ราคาต่อหน่วย รายการที่ ${index + 1}`}
                      type="number"
                      min="0"
                      step="any"
                      className="input num"
                      value={row.unitPrice}
                      onChange={(event) => updateRow(row.key, { unitPrice: event.target.value })}
                    />
                  </td>
                  <td className="text-center">
                    <input
                      aria-label={`คิด VAT รายการที่ ${index + 1}`}
                      type="checkbox"
                      className="size-4"
                      checked={row.vatApplicable}
                      onChange={(event) => updateRow(row.key, { vatApplicable: event.target.checked })}
                    />
                  </td>
                  <td className="num">{formatMoney(lineAmount(toLine(row)))}</td>
                  <td>
                    <button
                      type="button"
                      aria-label={`ลบรายการที่ ${index + 1}`}
                      className="btn btn-danger w-10 px-0"
                      onClick={() => removeRow(row.key)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line p-3">
          <button type="button" className="btn" onClick={addRow}>
            + เพิ่มรายการ
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="card p-4">
          <label>
            <span className="field-label">หมายเหตุ</span>
            <textarea
              rows={4}
              className="input py-2"
              value={form.notes}
              onChange={(event) => update({ notes: event.target.value })}
            />
          </label>
        </section>
        <section className="card p-4">
          <TotalsList
            totals={totals}
            vatRate={document?.vat_rate ?? VAT_RATE}
            whtRate={form.whtRate}
            whtControl={
              <select
                aria-label="อัตราหัก ณ ที่จ่าย"
                className="input min-h-8 w-auto py-1"
                value={form.whtRate}
                onChange={(event) => update({ whtRate: Number(event.target.value) })}
              >
                {WHT_OPTIONS.map(({ rate, label }) => (
                  <option key={rate} value={rate}>
                    {label}
                  </option>
                ))}
              </select>
            }
          />
        </section>
      </div>

      <div className="grid gap-2">
        <ErrorNote message={error} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !company || (Boolean(document) && !dirty)}
            onClick={save}
          >
            {pending ? "กำลังบันทึก…" : document ? "บันทึกการแก้ไข" : "บันทึกเอกสาร"}
          </button>
          {returnHref && (
            <Link href={returnHref} className="btn">
              ยกเลิกการแก้ไข
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
