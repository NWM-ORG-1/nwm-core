/* made-up market data for tests */

/** monthly closes from 2020-01: 100, 110, 121 … (+10 % a month), so every figure below is easy to check */
export function monthlyKlines(from = Date.UTC(2020, 0, 1), months = 82): Array<[number, string, string, string, string]> {
  return Array.from({ length: months }, (_, i) => {
    const open = Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth() + i, 1);
    const close = (100 * 1.1 ** i).toFixed(4);
    return [open, close, close, close, close];
  });
}
