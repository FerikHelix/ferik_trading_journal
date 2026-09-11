import Decimal from 'decimal.js';

export function parseDecimal(value: unknown, fallback = '0'): string {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  let input = String(value).trim().replace(/[\s\u00a0']/g, '').replace(/[^0-9,\.\-+()]/g, '');
  const negative = input.startsWith('(') && input.endsWith(')');
  input = input.replace(/[()]/g, '');
  const comma = input.lastIndexOf(',');
  const dot = input.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    input = input.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.');
  } else if (comma >= 0) {
    const digits = input.length - comma - 1;
    input = digits === 3 && comma > 0 ? input.replace(/,/g, '') : input.replace(',', '.');
  } else if ((input.match(/\./g) ?? []).length > 1) {
    const parts = input.split('.');
    const last = parts.pop();
    input = `${parts.join('')}.${last}`;
  }
  try {
    const result = new Decimal(input || fallback);
    return (negative ? result.negated() : result).toString();
  } catch {
    throw new Error(`Angka tidak valid: ${String(value)}`);
  }
}
