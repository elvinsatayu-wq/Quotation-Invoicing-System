// Live totals for the document builder. Must match the document_summaries view:
// VAT on vatable lines only, WHT on the pre-VAT subtotal, each rounded to satang.
// Works in integer satang because binary floats misround values like 1.005.

export type CalcLine = {
  quantity: number;
  unitPrice: number;
  vatApplicable: boolean;
};

export type Totals = {
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
  whtAmount: number;
  netTotal: number;
};

function lineSatang(line: CalcLine) {
  const milliQty = Math.round(line.quantity * 1000);
  const priceSatang = Math.round(line.unitPrice * 100);
  return Math.round((milliQty * priceSatang) / 1000);
}

export function lineAmount(line: CalcLine) {
  return lineSatang(line) / 100;
}

export function calcTotals(lines: CalcLine[], vatRate: number, whtRate: number): Totals {
  let subtotal = 0;
  let vatBase = 0;
  for (const line of lines) {
    const amount = lineSatang(line);
    subtotal += amount;
    if (line.vatApplicable) vatBase += amount;
  }
  const vat = Math.round((vatBase * Math.round(vatRate * 100)) / 10000);
  const wht = Math.round((subtotal * Math.round(whtRate * 100)) / 10000);

  return {
    subtotal: subtotal / 100,
    vatAmount: vat / 100,
    grandTotal: (subtotal + vat) / 100,
    whtAmount: wht / 100,
    netTotal: (subtotal + vat - wht) / 100,
  };
}
