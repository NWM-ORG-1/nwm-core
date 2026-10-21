import { createHash } from "node:crypto";

/** Small text helpers shared by parsers. No HTML ever reaches the database unescaped. */

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  middot: "·",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** HTML fragment → plain text (block tags become line breaks). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Cut at a word boundary near `max` characters, with an ellipsis. */
export function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s.,;:·…-]+$/, "")}…`;
}

export function sha(s: string, len = 32): string {
  return createHash("sha256").update(s).digest("hex").slice(0, len);
}

/** "1,234" "1.2K" "3.4M" "1.2만" "12억" → number */
export function parseCount(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const s = raw.replace(/[,\s]/g, "").trim();
  const m = /^([\d.]+)([KkMmBb만억천]?)$/.exec(s);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const mult: Record<string, number> = { "": 1, k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9, 천: 1e3, 만: 1e4, 억: 1e8 };
  return Math.round(n * (mult[m[2]] ?? 1));
}

const KST_OFFSET = "+09:00";

/**
 * Korean site timestamps without a zone are KST:
 * "2026.10.21 14:03", "2026-10-21 14:03:22", "26.10.21", "20261021", "14:03" (today, KST).
 */
export function parseKstDate(raw: string | null | undefined, now = new Date()): Date | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return iso(`${m[1]}-${m[2]}-${m[3]}T00:00:00${KST_OFFSET}`);
  m = /^(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})\.?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const y = m[1].length === 2 ? `20${m[1]}` : m[1];
    return iso(`${y}-${pad(m[2])}-${pad(m[3])}T${pad(m[4] ?? "0")}:${m[5] ?? "00"}:${m[6] ?? "00"}${KST_OFFSET}`);
  }
  m = /^(\d{1,2})[./-](\d{1,2})$/.exec(s); // "10.21" (this year, KST)
  if (m) {
    const y = kstParts(now).y;
    return iso(`${y}-${pad(m[1])}-${pad(m[2])}T00:00:00${KST_OFFSET}`);
  }
  m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s); // "14:03" → today KST (yesterday if that is in the future)
  if (m) {
    const { y, mo, d } = kstParts(now);
    const t = iso(`${y}-${pad(mo)}-${pad(d)}T${pad(m[1])}:${m[2]}:${m[3] ?? "00"}${KST_OFFSET}`);
    if (t && t.getTime() > now.getTime() + 5 * 60_000) return new Date(t.getTime() - 86_400_000);
    return t;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** RSS/Atom/HTTP dates; undefined when unparseable or absurd (far future). */
export function parseDate(raw: unknown, now = new Date()): Date | undefined {
  if (raw == null || raw === "") return undefined;
  // a bare date ("2026-10-21") would parse as UTC midnight; our date-only feeds are Korean
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return parseKstDate(raw.trim().replaceAll("-", ""), now);
  const d = raw instanceof Date ? raw : new Date(typeof raw === "number" ? raw : String(raw).trim());
  if (Number.isNaN(d.getTime())) return typeof raw === "string" ? parseKstDate(raw, now) : undefined;
  if (d.getTime() > now.getTime() + 2 * 86_400_000) return undefined;
  return d;
}

export function kstParts(d: Date): { y: number; mo: number; d: number; h: number; mi: number; dow: number } {
  const k = new Date(d.getTime() + 9 * 3_600_000);
  return { y: k.getUTCFullYear(), mo: k.getUTCMonth() + 1, d: k.getUTCDate(), h: k.getUTCHours(), mi: k.getUTCMinutes(), dow: k.getUTCDay() };
}

/** "20261021" in KST */
export function kstYmd(d: Date): string {
  const p = kstParts(d);
  return `${p.y}${pad(p.mo)}${pad(p.d)}`;
}

function pad(v: string | number): string {
  return String(v).padStart(2, "0");
}

function iso(s: string): Date | undefined {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function absUrl(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(decodeEntities(href.trim()), base).toString();
  } catch {
    return null;
  }
}
