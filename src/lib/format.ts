/**
 * Formatting helpers. All are pure and deterministic given their inputs — none
 * read the current time, so they are safe in prerendered Server Components.
 * Relative times ("3분 전") are computed in the browser (see LocalTime).
 */

const KST = "Asia/Seoul";

const clockFmt = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, hour: "2-digit", minute: "2-digit", hour12: false });
const dateFmt = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, month: "long", day: "numeric", weekday: "short" });
const fullFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const ymdParts = new Intl.DateTimeFormat("en-CA", { timeZone: KST, year: "numeric", month: "2-digit", day: "2-digit" });

/** "14:05" (KST) */
export function clockKST(iso: string | Date): string {
  return clockFmt.format(new Date(iso));
}

/** "10월 21일 (화)" (KST) */
export function dateKST(iso: string | Date): string {
  return dateFmt.format(new Date(iso));
}

/** "2026. 10. 21. 14:05" (KST) */
export function dateTimeKST(iso: string | Date): string {
  return fullFmt.format(new Date(iso));
}

/** "2026-10-21" — the KST calendar day, used for archives and stats. */
export function ymdKST(iso: string | Date): string {
  return ymdParts.format(new Date(iso));
}

/** Relative time; the caller supplies `now` (browser clock). */
export function relTime(iso: string, now: number): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return dateKST(iso);
}

/* ─────────────────────────── numbers ─────────────────────────── */

export function fmtPrice(price: number, currency: string, symbol?: string): string {
  if (currency === "%") return `${price.toFixed(2)}%`;
  if (currency === "KRW" && symbol !== "USDKRW") return Math.round(price).toLocaleString("ko-KR");
  if (price >= 10000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 100) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 4 });
}

/** "▲1.24%" / "▼0.31%" — the arrow carries direction so colour is never the only cue. */
export function fmtChange(pct: number, digits = 2): string {
  const s = Math.abs(pct).toFixed(digits);
  if (pct > 0) return `▲${s}%`;
  if (pct < 0) return `▼${s}%`;
  return `${s}%`;
}

export function fmtSigned(v: number, digits = 0): string {
  const s = Math.abs(v).toFixed(digits);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : `±${s}`;
}

/** Korean compact numbers: 12,400 → "1.2만" */
export function compactKo(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, "")}만`;
  return n.toLocaleString("ko-KR");
}

export function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Trend direction for colouring: Korean market convention (red up, blue down). */
export function trendOf(v: number): "up" | "down" | "flat" {
  return v > 0 ? "up" : v < 0 ? "down" : "flat";
}
