import assert from "node:assert/strict";
import { test } from "node:test";
import { calcTotals, lineAmount } from "./calc.ts";

const line = (quantity: number, unitPrice: number, vatApplicable = true) => ({
  quantity,
  unitPrice,
  vatApplicable,
});

test("VAT 7% and WHT 3% on the pre-VAT subtotal", () => {
  assert.deepEqual(calcTotals([line(2, 8500), line(6, 2500)], 7, 3), {
    subtotal: 32000,
    vatAmount: 2240,
    grandTotal: 34240,
    whtAmount: 960,
    netTotal: 33280,
  });
});

test("non-VAT lines count toward subtotal and WHT but not VAT", () => {
  const totals = calcTotals([line(1, 4590), line(2, 350, false)], 7, 3);
  assert.equal(totals.subtotal, 5290);
  assert.equal(totals.vatAmount, 321.3);
  assert.equal(totals.whtAmount, 158.7);
});

test("line amounts round half up like Postgres numeric", () => {
  assert.equal(lineAmount(line(1.5, 33.33)), 50);
  assert.equal(lineAmount(line(1.005, 1)), 1.01);
  assert.equal(lineAmount(line(3, 0.1)), 0.3);
});

test("no lines gives zero totals", () => {
  assert.equal(calcTotals([], 7, 3).netTotal, 0);
});
