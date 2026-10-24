/**
 * What editors paste when they add channels and accounts — links, @names or
 * bare names, several per line — turned into the names the adapters take.
 * Pure: the newsroom form and the server both use it.
 */

export type SocialKind = "telegram" | "x";

export interface ParsedHandles {
  /** valid names in the order pasted, duplicates removed (case-insensitive) */
  names: string[];
  rejected: Array<{ input: string; reason: string }>;
}

/** public usernames: 5–32 characters (a few old ones have 4), letters first */
const TG_NAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const X_NAME = /^[A-Za-z0-9_]{1,15}$/;

/** t.me paths that are not channels */
const TG_RESERVED = new Set(["s", "c", "joinchat", "addstickers", "addemoji", "addlist", "addtheme", "share", "proxy", "socks", "iv", "login", "boost", "setlanguage", "bg", "invoice", "contact", "confirmphone", "m"]);
/** x.com paths that are not accounts */
const X_RESERVED = new Set([
  "home",
  "explore",
  "search",
  "i",
  "intent",
  "share",
  "settings",
  "messages",
  "notifications",
  "compose",
  "hashtag",
  "login",
  "logout",
  "signup",
  "tos",
  "privacy",
  "about",
  "jobs",
  "download",
  "lists",
  "communities",
  "premium",
  "account",
  "following",
  "followers",
]);

const TG_HOSTS = /^(www\.)?(t\.me|telegram\.me|telegram\.dog)$/i;
const X_HOSTS = /^(www\.|mobile\.)?(x\.com|twitter\.com)$/i;

function asUrl(raw: string, hosts: RegExp): URL | null {
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : /^[^/@\s]+\.[a-z]{2,}\//i.test(raw) ? `https://${raw}` : null;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    return hosts.test(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

function telegramName(raw: string): string | { reason: string } {
  if (/^tg:\/\/resolve/i.test(raw)) {
    const domain = /[?&]domain=([^&]+)/i.exec(raw)?.[1];
    return domain && TG_NAME.test(domain) ? domain : { reason: "텔레그램 링크를 읽지 못했습니다" };
  }
  let name = raw;
  if (/^(https?:\/\/)?[^/\s]*(t\.me|telegram\.me|telegram\.dog)(\/|$)/i.test(raw)) {
    const u = asUrl(raw, TG_HOSTS);
    if (!u) return { reason: "텔레그램 링크를 읽지 못했습니다" };
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "s") parts.shift();
    const first = parts[0] ?? "";
    if (first.startsWith("+") || first === "joinchat") return { reason: "비공개 초대 링크입니다 — 공개 채널(@이름)만 수집할 수 있습니다" };
    if (first === "c") return { reason: "비공개 채널의 글 링크입니다 — 공개 채널(@이름)만 수집할 수 있습니다" };
    if (!first || TG_RESERVED.has(first.toLowerCase())) return { reason: "채널 주소가 아닙니다" };
    name = first;
  } else if (/^https?:\/\//i.test(raw)) {
    return { reason: "텔레그램 주소가 아닙니다" };
  }
  name = name.replace(/^@/, "");
  return TG_NAME.test(name) ? name : { reason: "채널 이름 형식이 아닙니다 (영문·숫자·밑줄 5–32자)" };
}

function xName(raw: string): string | { reason: string } {
  let name = raw;
  if (/^(https?:\/\/)?[^/\s]*(x\.com|twitter\.com)(\/|$)/i.test(raw)) {
    const u = asUrl(raw, X_HOSTS);
    if (!u) return { reason: "X 링크를 읽지 못했습니다" };
    const first = u.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!first || X_RESERVED.has(first.toLowerCase())) return { reason: "계정 주소가 아닙니다" };
    name = first;
  } else if (/^https?:\/\//i.test(raw)) {
    return { reason: "X 주소가 아닙니다" };
  }
  name = name.replace(/^@/, "");
  return X_NAME.test(name) ? name : { reason: "계정 이름 형식이 아닙니다 (영문·숫자·밑줄 15자 이내)" };
}

/** Splits on whitespace, commas and semicolons; keeps at most `max` names. */
export function parseHandles(kind: SocialKind, text: string, max = 50): ParsedHandles {
  const names: string[] = [];
  const seen = new Set<string>();
  const rejected: ParsedHandles["rejected"] = [];
  for (const token of text.split(/[\s,;、]+/)) {
    const raw = token.trim().replace(/^[<(“"']+|[>)”"'.。]+$/g, "");
    if (!raw) continue;
    const r = kind === "telegram" ? telegramName(raw) : xName(raw);
    if (typeof r !== "string") {
      rejected.push({ input: raw, reason: r.reason });
      continue;
    }
    const key = r.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (names.length >= max) {
      rejected.push({ input: raw, reason: `한 번에 ${max}개까지입니다` });
      continue;
    }
    names.push(r);
  }
  return { names, rejected };
}

/** Source slugs for a channel or account: tg-coinnesskr, x-openai (slugs take no underscores). */
export function socialSlug(kind: SocialKind, name: string): string {
  return `${kind === "telegram" ? "tg" : "x"}-${name.toLowerCase().replace(/_/g, "-")}`;
}
