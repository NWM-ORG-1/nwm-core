import { parse, type HTMLElement } from "node-html-parser";
import { z } from "zod";
import { passesKeywords } from "../../classify";
import { HttpError } from "../../http";
import { parseRobots } from "../../robots";
import { absUrl, clip, oneLine, parseCount, parseKstDate } from "../../text";
import { ConfigError, defineAdapter, type IngestItem, type SocialPostIn } from "../../types";

/**
 * Config-driven list-page reader for boards without an API: Korean
 * communities (sentiment) and official boards without RSS (inbox). Reads the
 * list page only — never post bodies — at one page per poll, honours
 * robots.txt unless an agreement with the site is recorded, and identifies
 * itself with the NWM bot User-Agent.
 */

const field = z.object({
  /** CSS selector inside the row; omit to use the row itself */
  sel: z.string().max(200).optional(),
  /** attribute to read instead of the text */
  attr: z.string().max(60).optional(),
  /** first capture group (or whole match) is kept */
  regex: z.string().max(200).optional(),
});

const config = z.object({
  /** defaults to the source URL */
  url: z.url().optional(),
  row: z.string().min(1).max(200),
  fields: z.object({
    id: field,
    title: field,
    link: field.optional(),
    time: field.optional(),
    author: field.optional(),
    views: field.optional(),
    comments: field.optional(),
    likes: field.optional(),
  }),
  /** rows matching this selector are skipped (notices, ads) */
  skip: z.string().max(200).optional(),
  /** rows whose field text matches are skipped, e.g. a number cell reading "공지" */
  skipIf: z.object({ sel: z.string().max(200), regex: z.string().max(200) }).optional(),
  /** pinned and old rows: drop anything older than this (rows without a time are kept) */
  maxAgeDays: z.number().min(0.1).max(60).default(3),
  /** posts → sentiment (social_posts), items → newsroom inbox */
  output: z.enum(["posts", "items"]).default("posts"),
  /** titles may be scored by the LLM; set false when the agreement does not cover AI analysis */
  llmConsent: z.boolean().default(true),
  include: z.array(z.string().min(1)).max(60).optional(),
  exclude: z.array(z.string().min(1)).max(60).optional(),
  maxRows: z.number().int().min(1).max(200).default(60),
  encoding: z.string().max(20).optional(),
  /** board sets a cookie and redirects once before showing the list */
  cookieCheck: z.boolean().default(false),
  respectRobots: z.boolean().default(true),
  /** required when respectRobots is false: what allows us to read this board */
  robotsOverride: z.string().max(300).optional(),
  /** only with a written agreement that names a User-Agent */
  userAgent: z.string().max(200).optional(),
  /** score items in the inbox (output=items) */
  weight: z.number().min(0).max(1).default(0.35),
  /** fold fixed boilerplate out of titles ("[공지]", category tags) */
  stripTitle: z.string().max(200).optional(),
});

type Cfg = z.infer<typeof config>;

export const htmlListAdapter = defineAdapter({
  key: "html.list",
  label: "게시판 목록 (HTML)",
  description: "API·RSS가 없는 게시판의 목록 페이지를 CSS 선택자로 읽습니다. 커뮤니티 글은 센티먼트(제목·조회·댓글 수)로, 기관 게시판은 인박스로. 본문은 읽지 않고 robots.txt를 지킵니다(협의 시에만 예외 기록).",
  kind: "scrape",
  group: "social",
  configSchema: config,
  configExample: {
    row: "tr.ub-content.us-post",
    fields: { id: { attr: "data-no" }, title: { sel: "td.gall_tit a" }, link: { sel: "td.gall_tit a", attr: "href" }, time: { sel: "td.gall_date", attr: "title" } },
    output: "posts",
    llmConsent: true,
    maxRows: 60,
    respectRobots: true,
    cookieCheck: false,
    weight: 0.35,
  },
  defaultPollSec: 300,
  async run(ctx) {
    const c = ctx.config;
    const url = c.url ?? ctx.source.url;
    if (!url) throw new ConfigError("목록 URL이 없습니다");
    if (!c.respectRobots && !c.robotsOverride) throw new ConfigError("robots.txt 예외에는 근거(robotsOverride: 협의 내용·일자)가 필요합니다");
    const headers = c.userAgent ? { "user-agent": c.userAgent } : undefined;

    if (c.respectRobots) {
      const u = new URL(url);
      const cached = ctx.state.robots as { at: number; txt: string } | undefined;
      let txt = cached && ctx.now.getTime() - cached.at < 86_400_000 ? cached.txt : undefined;
      if (txt === undefined) {
        const r = await ctx.http.request(`${u.origin}/robots.txt`, { okStatuses: [404, 410], timeoutMs: 15_000, headers });
        txt = r.status === 200 ? r.text.slice(0, 200_000) : "";
        ctx.state.robots = { at: ctx.now.getTime(), txt };
      }
      if (!parseRobots(txt).isAllowed(`${u.pathname}${u.search}`)) {
        throw new ConfigError(`robots.txt가 이 경로를 막고 있습니다 (${u.pathname}${u.search}). 협의가 있으면 respectRobots=false와 robotsOverride를 기록하세요.`);
      }
    }

    const html = c.cookieCheck ? await fetchWithCookieCheck(ctx.http, url, c.encoding, headers) : await ctx.http.text(url, { encoding: c.encoding, timeoutMs: 25_000, headers });
    const all = readRows(html, url, c, ctx.now);
    if (!all.length) throw new Error(`목록에서 행을 찾지 못했습니다 (row: ${c.row}) — ${describePage(html)}`);
    const cutoff = ctx.now.getTime() - c.maxAgeDays * 86_400_000;
    const rows = all.filter((r) => !r.time || r.time.getTime() >= cutoff);

    const seenIds = new Set((ctx.state.seen as string[] | undefined) ?? []);
    const state = { robots: ctx.state.robots, seen: [...new Set([...rows.map((r) => r.id), ...seenIds])].slice(0, 600) };
    if (c.output === "posts") {
      const posts: SocialPostIn[] = rows.map((r) => ({
        externalId: r.id,
        url: r.link,
        author: r.author,
        text: r.title,
        postedAt: r.time ?? ctx.now,
        engagement: { views: r.views, comments: r.comments, likes: r.likes },
      }));
      return { posts, state, note: `${rows.length} rows (${rows.filter((r) => !seenIds.has(r.id)).length} new)` };
    }
    const items: IngestItem[] = rows.map((r) => ({
      externalId: r.id,
      url: r.link,
      title: r.title,
      summary: [r.author, r.views !== undefined ? `조회 ${r.views}` : null].filter(Boolean).join(" · "),
      publishedAt: r.time ?? null,
      weight: c.weight,
    }));
    return { items, state, note: `${rows.length} rows` };
  },
});

interface Row {
  id: string;
  title: string;
  link: string | null;
  time?: Date;
  author?: string;
  views?: number;
  comments?: number;
  likes?: number;
}

/**
 * Real pages leave tags unclosed. By default the parser deletes elements still
 * open at the end of the document (and with them `<body>` and every list row);
 * keeping them leaves rows in the tree, possibly nested inside one another.
 */
function parseHtml(html: string): HTMLElement {
  // a script/style block ends at the exact text `</name>` as its opening tag spelled the name,
  // so `<SCRIPT>…</script>` or `</script >` would swallow the rest of the page
  const tidy = html.replace(/<(\/?)(script|style|noscript)\b([^>]*)>/gi, (_, slash: string, name: string, rest: string) =>
    slash ? `</${name.toLowerCase()}>` : `<${name.toLowerCase()}${rest}>`,
  );
  return parse(tidy, { blockTextElements: { script: false, style: false, noscript: false }, parseNoneClosedTags: true });
}

/** Exported for fixtures: list HTML → rows. */
export function readRows(
  html: string,
  baseUrl: string,
  c: Pick<Cfg, "row" | "fields" | "skip" | "maxRows" | "include" | "exclude" | "stripTitle"> & { skipIf?: Cfg["skipIf"] },
  now = new Date(),
): Row[] {
  const root = parseHtml(html);
  const strip = c.stripTitle ? new RegExp(c.stripTitle, "g") : null;
  const skipIf = c.skipIf ? { sel: c.skipIf.sel, re: new RegExp(c.skipIf.regex) } : null;
  const all = root.querySelectorAll(c.row);
  const rows = new Set(all);
  const out: Row[] = [];
  const ids = new Set<string>();
  for (const el of all) {
    if (out.length >= c.maxRows) break;
    const get = (f: z.infer<typeof field>) => read(el, f, rows);
    if (c.skip && own(el, c.skip, rows)) continue;
    if (skipIf && skipIf.re.test(get({ sel: skipIf.sel }))) continue;
    const id = get(c.fields.id);
    let title = get(c.fields.title);
    if (!id || !title || ids.has(id)) continue;
    if (strip) title = oneLine(title.replace(strip, ""));
    if (!title || !passesKeywords(title, c.include, c.exclude)) continue;
    ids.add(id);
    const href = c.fields.link ? get(c.fields.link) : undefined;
    const time = c.fields.time ? get(c.fields.time) : undefined;
    out.push({
      id,
      title: clip(title, 300),
      link: absUrl(href, baseUrl),
      time: time ? parseKstDate(time, now) : undefined,
      author: c.fields.author ? get(c.fields.author) || undefined : undefined,
      views: c.fields.views ? parseCount(get(c.fields.views)) : undefined,
      comments: c.fields.comments ? (parseCount(get(c.fields.comments)) ?? 0) : undefined,
      likes: c.fields.likes ? parseCount(get(c.fields.likes)) : undefined,
    });
  }
  return out;
}

/** First match inside `row` that belongs to it, not to a row nested in it. */
function own(row: HTMLElement, sel: string, rows: Set<HTMLElement>): HTMLElement | undefined {
  return row.querySelectorAll(sel).find((el) => {
    let n: HTMLElement | null = el;
    while (n && !rows.has(n)) n = n.parentNode;
    return n === row;
  });
}

function read(row: HTMLElement, f: z.infer<typeof field>, rows: Set<HTMLElement>): string {
  const el = f.sel ? own(row, f.sel, rows) : row;
  if (!el) return "";
  let v = f.attr ? (el.getAttribute(f.attr) ?? "") : el.textContent;
  v = oneLine(decodeText(v));
  if (f.regex) {
    const m = new RegExp(f.regex).exec(v);
    v = m ? (m[1] ?? m[0]) : "";
  }
  return v.trim();
}

/** What came back instead of a list: the page title and the start of its text. */
function describePage(html: string): string {
  const root = parseHtml(html);
  const title = oneLine(root.querySelector("title")?.textContent ?? "");
  const body = oneLine(root.querySelector("body")?.textContent ?? root.textContent).slice(0, 140);
  return `페이지 제목 “${title || "(없음)"}”, 본문 “${body || "(비어 있음)"}” (${html.length}자). 차단 페이지이거나 구조가 바뀌었을 수 있습니다`;
}

function decodeText(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", nbsp: " " })[e] ?? _);
}

/** Boards that answer the first visit with Set-Cookie + 302 back to themselves. */
async function fetchWithCookieCheck(http: import("../../http").Http, url: string, encoding: string | undefined, headers?: Record<string, string>): Promise<string> {
  const jar = new Map<string, string>();
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const res = await http.request(current, {
      encoding,
      timeoutMs: 25_000,
      redirect: "manual",
      okStatuses: [301, 302, 303, 307, 308],
      headers: { ...headers, ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}) },
    });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    if (res.status >= 400) throw new HttpError(res.status, current, "");
    return res.text;
  }
  throw new Error("too many redirects");
}
