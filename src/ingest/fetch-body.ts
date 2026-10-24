import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractArticleText, pdfLinks } from "./article";
import { HostLimiter, Http, HttpError } from "./http";
import { parseRobots, type Robots } from "./robots";

/**
 * The article behind a feed item whose feed carried only a title: the page's
 * main text or, when the page is only a download list (한국은행), the text of
 * its PDF through poppler's pdftotext. robots.txt is honoured with the feed
 * bot's User-Agent; any failure is a null, never an error.
 */

export interface FetchedBody {
  text: string;
  from: "page" | "pdf";
  url: string;
}
export type BodyFetcher = (url: string) => Promise<FetchedBody | null>;

export const MIN_BODY = 200;
/** a short page is still better than a headline when there is no PDF to read */
const MIN_SHORT = 80;
const MAX_BODY = 8000;
const PDF_PAGES = 8;

const DENY_ALL: Robots = { isAllowed: () => false };

export function bodyFetcher(o: { signal?: AbortSignal; fetchImpl?: typeof fetch; limiter?: HostLimiter; pdfText?: (pdf: Uint8Array) => Promise<string> } = {}): BodyFetcher {
  const http = new Http({ limiter: o.limiter ?? new HostLimiter(), signal: o.signal ?? new AbortController().signal, fetchImpl: o.fetchImpl });
  const pdfText = o.pdfText ?? pdftotext;
  const robots = new Map<string, Promise<Robots | null>>();

  // RFC 9309: no robots.txt (4xx) allows everything; an unreachable one allows nothing
  const rules = (origin: string) => {
    let r = robots.get(origin);
    if (!r) {
      r = http
        .request(`${origin}/robots.txt`, { timeoutMs: 10_000, maxBytes: 500_000 })
        .then((res) => parseRobots(res.text))
        .catch((e) => (e instanceof HttpError && e.status >= 400 && e.status < 500 ? null : DENY_ALL));
      robots.set(origin, r);
    }
    return r;
  };
  const allowed = async (url: string) => {
    const u = new URL(url);
    const r = await rules(u.origin);
    return !r || r.isAllowed(`${u.pathname}${u.search}`);
  };

  const fromPdf = async (url: string): Promise<FetchedBody | null> => {
    if (!(await allowed(url))) return null;
    const res = await http.request(url, { binary: true, timeoutMs: 30_000, maxBytes: 10_000_000 });
    if (!res.bytes || !/%PDF-/.test(new TextDecoder("latin1").decode(res.bytes.subarray(0, 1024)))) return null;
    const text = cleanPdfText(await pdfText(res.bytes));
    return text.length >= MIN_BODY ? { text: clip(text), from: "pdf", url } : null;
  };

  return async (url) => {
    try {
      if (!(await allowed(url))) return null;
      if (/\.pdf($|[?#])/i.test(url)) return await fromPdf(url);
      const res = await http.request(url, { timeoutMs: 20_000, maxBytes: 3_000_000 });
      if (/application\/pdf/i.test(res.headers.get("content-type") ?? "")) return await fromPdf(res.url);
      const text = extractArticleText(res.text, MAX_BODY);
      if (text.length >= MIN_BODY) return { text, from: "page", url: res.url };
      for (const pdf of pdfLinks(res.text, res.url).slice(0, 2)) {
        const got = await fromPdf(pdf).catch(() => null);
        if (got) return got;
      }
      return text.length >= MIN_SHORT ? { text, from: "page", url: res.url } : null;
    } catch {
      return null;
    }
  };
}

function clip(t: string): string {
  return t.length > MAX_BODY ? `${t.slice(0, MAX_BODY).replace(/\s+\S*$/, "")}…` : t;
}

/** pdftotext output: page numbers and empty lines out, one space between words. */
export function cleanPdfText(t: string): string {
  return t
    .replace(/\f/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l) => l && !/^[-–—]?\s*\d{1,3}\s*[-–—]?$/.test(l) && !/^\d+\s*\/\s*\d+$/.test(l))
    .join("\n");
}

/** First pages of a PDF as UTF-8 text; needs poppler-utils (the worker image has it). */
async function pdftotext(pdf: Uint8Array): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "nwm-pdf-"));
  try {
    const file = join(dir, "in.pdf");
    await writeFile(file, pdf);
    return await new Promise<string>((resolve, reject) =>
      execFile("pdftotext", ["-enc", "UTF-8", "-l", String(PDF_PAGES), "-nopgbrk", file, "-"], { timeout: 20_000, maxBuffer: 4_000_000 }, (err, stdout) =>
        err ? reject(err) : resolve(stdout),
      ),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
