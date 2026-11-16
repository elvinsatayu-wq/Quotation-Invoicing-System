// Amount in Thai words, as printed on invoices: 1,250.50 → "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์"

const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** Reads 0–999,999. `following` is true when larger groups come before it (for "เอ็ด"). */
function readGroup(n: number, following: boolean): string {
  const digits = String(n).split("").map(Number);
  let words = "";
  digits.forEach((digit, index) => {
    const place = digits.length - 1 - index;
    if (digit === 0) return;
    if (place === 1 && digit === 1) words += "สิบ";
    else if (place === 1 && digit === 2) words += "ยี่สิบ";
    else if (place === 0 && digit === 1 && (n > 10 || following)) words += "เอ็ด";
    else words += DIGITS[digit] + PLACES[place];
  });
  return words;
}

function readInteger(n: number): string {
  if (n < 1_000_000) return readGroup(n, false);
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  return readInteger(millions) + "ล้าน" + (rest ? readGroup(rest, true) : "");
}

export function bahtText(amount: number): string {
  const satangTotal = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;
  const sign = amount < 0 && satangTotal > 0 ? "ลบ" : "";

  if (baht === 0 && satang === 0) return "ศูนย์บาทถ้วน";
  const bahtWords = baht ? readInteger(baht) + "บาท" : "";
  return sign + bahtWords + (satang ? readGroup(satang, false) + "สตางค์" : "ถ้วน");
}
