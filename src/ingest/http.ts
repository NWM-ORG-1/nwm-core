/**
 * The only way adapters reach the network: one identifying User-Agent, timeouts,
 * a body size cap, charset decoding (EUC-KR pages), per-host pacing and
 * conditional requests (ETag / Last-Modified) remembered per source.
 */

export const DEFAULT_UA = "NWM-FeedBot/1.0 (+https://newweb.media)";

export function userAgent(): string {
  const base = process.env.FEED_USER_AGENT?.trim() || DEFAULT_UA;
  const contact = process.env.FEED_CONTACT_EMAIL?.trim();
  return contact && !base.includes(contact) ? `${base} ${contact}` : base;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly bodySnippet: string,
    readonly retryAfterSec?: number,
  ) {
    super(`HTTP ${status} ${new URL(url).host}${bodySnippet ? ` — ${bodySnippet}` : ""}`);
    this.name = "HttpError";
  }
}

/** Minimum spacing between requests to one host, shared by every source in the process. */
export class HostLimiter {
  private next = new Map<string, number>();
  private blockedUntil = new Map<string, number>();

  constructor(private readonly spacingMs: (host: string) => number = defaultSpacing) {}

  async wait(host: string, signal?: AbortSignal): Promise<void> {
    const now = Date.now();
    const at = Math.max(this.next.get(host) ?? 0, this.blockedUntil.get(host) ?? 0, now);
    this.next.set(host, at + this.spacingMs(host));
    if (at > now) await sleep(at - now, signal);
  }

  /** after 429 / 503 with Retry-After */
  block(host: string, seconds: number) {
    this.blockedUntil.set(host, Date.now() + Math.min(seconds, 3600) * 1000);
  }

  blockedFor(host: string): number {
    return Math.max(0, (this.blockedUntil.get(host) ?? 0) - Date.now());
  }
}

/** Polite defaults; documented limits where providers publish them. */
const SPACING: Array<[RegExp, number]> = [
  [/(^|\.)sec\.gov$/, 150], // ≤10 req/s
  [/(^|\.)arxiv\.org$/, 3000], // 1 request / 3 s
  [/(^|\.)binance\.(com|vision)$/, 120],
  [/(^|\.)bybit\.com$/, 120],
  [/(^|\.)upbit\.com$/, 150],
  [/(^|\.)bithumb\.com$/, 150],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$/, 1000],
  [/(^|\.)t\.me$/, 2500],
  [/(^|\.)telegram\.org$/, 300],
  // communities: one page at a time, slowly
  [/(^|\.)(dcinside\.com|clien\.net|ppomppu\.co\.kr|fmkorea\.com|naver\.com)$/, 4000],
];

function defaultSpacing(host: string): number {
  for (const [re, ms] of SPACING) if (re.test(host)) return ms;
  return 800;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal!.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface RequestOptions {
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  /** per request, default 20 s */
  timeoutMs?: number;
  /** default 5 MB */
  maxBytes?: number;
  /** force a charset when the server lies (old Korean sites) */
  encoding?: string;
  /** send If-None-Match / If-Modified-Since from the last answer to this URL */
  conditional?: boolean;
  /** statuses returned instead of thrown (e.g. 404 = "no data yet") */
  okStatuses?: number[];
  /** "manual" to inspect redirects yourself (cookie checks) */
  redirect?: "follow" | "manual";
  /** keep the body as bytes (PDFs) instead of decoding it to text */
  binary?: boolean;
}

export interface HttpResponse {
  status: number;
  url: string;
  headers: Headers;
  text: string;
  notModified: boolean;
  /** with `binary` */
  bytes?: Uint8Array;
}

type Validators = Record<string, { etag?: string; lastModified?: string; at: number }>;

export interface HttpInit {
  limiter: HostLimiter;
  signal: AbortSignal;
  /** conditional-request validators from the previous runs of this source */
  validators?: Validators;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  /** tests only: allow localhost / private addresses */
  allowPrivate?: boolean;
}

const MAX_VALIDATORS = 24;

export class Http {
  readonly validators: Validators;
  /** status of the last response (for the run log) */
  lastStatus: number | undefined;
  requests = 0;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly init: HttpInit) {
    this.validators = { ...(init.validators ?? {}) };
    this.fetchImpl = init.fetchImpl ?? fetch;
  }

  async request(url: string, opts: RequestOptions = {}): Promise<HttpResponse> {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`unsupported URL ${url}`);
    if (!this.init.allowPrivate && isPrivateHost(u.hostname)) throw new Error(`내부망 주소는 수집할 수 없습니다 (${u.hostname})`);
    await this.init.limiter.wait(u.host, this.init.signal);

    const headers: Record<string, string> = {
      "user-agent": this.init.userAgent ?? userAgent(),
      accept: "*/*",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.8",
      ...opts.headers,
    };
    const v = opts.conditional ? this.validators[url] : undefined;
    if (v?.etag) headers["if-none-match"] = v.etag;
    if (v?.lastModified) headers["if-modified-since"] = v.lastModified;

    const signal = AbortSignal.any([this.init.signal, AbortSignal.timeout(opts.timeoutMs ?? 20_000)]);
    this.requests++;
    const res = await this.fetchImpl(url, { method: opts.method ?? "GET", headers, body: opts.body, redirect: opts.redirect ?? "follow", signal });
    this.lastStatus = res.status;

    if (res.status === 304) {
      await res.body?.cancel();
      return { status: 304, url: res.url || url, headers: res.headers, text: "", notModified: true };
    }

    const bytes = await readCapped(res, opts.maxBytes ?? 5_000_000);
    const text = opts.binary && res.ok ? "" : decode(bytes, res.headers.get("content-type"), opts.encoding);

    if (!res.ok && !opts.okStatuses?.includes(res.status)) {
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      if ((res.status === 429 || res.status === 503) && retryAfter) this.init.limiter.block(u.host, retryAfter);
      throw new HttpError(res.status, url, snippet(text), retryAfter);
    }

    if (opts.conditional && res.ok) {
      const etag = res.headers.get("etag") ?? undefined;
      const lastModified = res.headers.get("last-modified") ?? undefined;
      if (etag || lastModified) this.remember(url, { etag, lastModified, at: Date.now() });
    }
    return { status: res.status, url: res.url || url, headers: res.headers, text, notModified: false, ...(opts.binary ? { bytes } : {}) };
  }

  async text(url: string, opts?: RequestOptions): Promise<string> {
    return (await this.request(url, opts)).text;
  }

  async json<T = unknown>(url: string, opts?: RequestOptions): Promise<T> {
    const res = await this.request(url, { ...opts, headers: { accept: "application/json", ...opts?.headers } });
    return parseJson<T>(res.text, url);
  }

  private remember(url: string, v: Validators[string]) {
    this.validators[url] = v;
    const keys = Object.keys(this.validators);
    if (keys.length > MAX_VALIDATORS) {
      keys.sort((a, b) => this.validators[a].at - this.validators[b].at);
      for (const k of keys.slice(0, keys.length - MAX_VALIDATORS)) delete this.validators[k];
    }
  }
}

/**
 * Source URLs come from the newsroom: never let one point the collector at our
 * own network (cloud metadata, Railway private services, localhost).
 * Literal addresses and well-known internal names only — not a DNS-rebinding defence.
 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (/^(0|127|10)\./.test(h) || /^169\.254\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  if (h === "::1" || h === "::" || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h) || /^::ffff:/.test(h)) return true;
  return false;
}

export function parseJson<T>(text: string, url: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`invalid JSON from ${new URL(url).host}: ${snippet(text)}`);
  }
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) {
    await res.body?.cancel();
    throw new Error(`response too large (${declared} bytes) from ${res.url}`);
  }
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error(`response over ${max} bytes from ${res.url}`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

/** Header charset → <meta charset> / XML declaration → UTF-8. Node's ICU decodes EUC-KR (CP949). */
export function decode(bytes: Uint8Array, contentType: string | null, forced?: string): string {
  let cs = forced ?? /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  if (!cs) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
    cs = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) ?? /<\?xml[^>]+encoding=["']([\w-]+)/i.exec(head))?.[1];
  }
  const label = (cs ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(label === "ks_c_5601-1987" ? "euc-kr" : label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function parseRetryAfter(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(1, n);
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(1, Math.round((at - Date.now()) / 1000)) : undefined;
}

function snippet(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}
