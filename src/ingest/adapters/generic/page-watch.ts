import { parse, type HTMLElement, type Node } from "node-html-parser";
import { z } from "zod";
import { extractArticleText, selectedText } from "../../article";
import { passesKeywords } from "../../classify";
import { changedChars, changesOf, countChanges, diffLines, docDate, isoDay, renderChange, type DocDate } from "../../diff";
import type { HttpResponse } from "../../http";
import { assertRobotsAllow } from "../../robots";
import { absUrl, clip, decodeEntities, htmlToText, oneLine, parseKstDate, sha } from "../../text";
import { ConfigError, defineAdapter, type AdapterContext, type AdapterResult, type IngestItem } from "../../types";

/**
 * Pages without a feed: terms and policies, change logs, notice lists.
 *
 * - text: keeps the page's main text and, when it changes, files one item
 *   with the paragraphs added, removed or reworded (words marked) and the
 *   document's own date — where explainers like "the new contract says…" start.
 * - links: files the links that were not on the page before (notice boards).
 *
 * The first run only stores what the page looks like now. robots.txt is
 * honoured unless an agreement is recorded; one page per run, a few runs a day.
 */

const config = z.object({
  /** defaults to the source URL */
  url: z.url().optional(),
  mode: z.enum(["text", "links"]).default("text"),
  /** CSS selector for the part to compare (text) or the list to read (links); default: the main text / the page minus menus */
  select: z.string().min(1).max(200).optional(),
  /** document name in titles; defaults to the page's <title> */
  label: z.string().min(1).max(120).optional(),
  /** text: paragraphs matching any of these regular expressions are left out (counters, "updated 3 hours ago") */
  ignore: z.array(z.string().min(1).max(200)).max(20).optional(),
  /** text: smaller changes (characters) update the copy we keep but file nothing */
  minChange: z.number().int().min(1).max(5000).default(1),
  /** links: keep only URLs matching this regular expression */
  linkPattern: z.string().min(1).max(300).optional(),
  /** links: boards that open posts with javascript — `regex` reads href+onclick, its groups fill {1}, {2} in `url` */
  linkTemplate: z.object({ regex: z.string().min(1).max(300), url: z.string().min(1).max(500) }).optional(),
  /** links: text to cut from link titles, as a regular expression (a " N" new-post badge, "[공지]") */
  stripTitle: z.string().min(1).max(200).optional(),
  /** links: words the link text must (include) or must not (exclude) contain */
  include: z.array(z.string().min(1)).max(60).optional(),
  exclude: z.array(z.string().min(1)).max(60).optional(),
  /** links: a dated row older than this is not news (and on the first run, only rows this recent are filed) */
  maxAgeDays: z.number().min(1).max(60).default(3),
  maxItems: z.number().int().min(1).max(50).default(10),
  /** some sites choose the language by the visitor's address; defaults follow the source language */
  acceptLanguage: z.string().min(2).max(100).optional(),
  encoding: z.string().max(20).optional(),
  respectRobots: z.boolean().default(true),
  /** required when respectRobots is false: what allows us to read this page */
  robotsOverride: z.string().max(300).optional(),
  weight: z.number().min(0).max(1).default(0.6),
});

type Cfg = z.infer<typeof config>;

const LANG: Record<string, string> = { en: "en-US,en;q=0.9", ja: "ja-JP,ja;q=0.9,en;q=0.8" };
/** text kept between runs (and compared); longer pages are compared up to here */
const MAX_TEXT = 300_000;
const BODY_MAX = 8000;
const SUMMARY_MAX = 1500;
const MAX_VERSIONS = 12;
const MAX_SEEN = 1500;

interface TextState {
  hash?: string;
  text?: string;
  title?: string;
  docDate?: DocDate | null;
  checkedAt?: string;
  changedAt?: string;
  versions?: Array<{ hash: string; at: string }>;
}

export const pageWatchAdapter = defineAdapter({
  key: "page.watch",
  label: "페이지 변경 감시",
  description:
    "RSS가 없는 페이지를 하루 몇 번 비교합니다. 약관·정책·변경 기록은 바뀐 문단(전·후, 바뀐 말 표시)과 문서 날짜를 한 건으로, 공지 목록은 새로 생긴 링크를 한 건씩 인박스에 올립니다. 첫 실행은 지금 모습만 저장합니다. robots.txt를 지킵니다.",
  kind: "scrape",
  group: "generic",
  configSchema: config,
  configExample: { mode: "text", label: "문서 이름", ignore: [], minChange: 1, acceptLanguage: "en-US,en;q=0.9", respectRobots: true },
  defaultPollSec: 21_600,
  async run(ctx) {
    const c = ctx.config;
    const url = c.url ?? ctx.source.url;
    if (!url) throw new ConfigError("감시할 페이지 URL이 없습니다 (소스 URL 또는 config.url)");
    if (!c.respectRobots && !c.robotsOverride) throw new ConfigError("robots.txt 예외에는 근거(robotsOverride: 협의 내용·일자)가 필요합니다");
    const lang = c.acceptLanguage ?? LANG[ctx.source.lang];
    const headers = lang ? { "accept-language": lang } : undefined;
    if (c.respectRobots) await assertRobotsAllow(ctx.http, ctx.state, url, ctx.now, headers);
    const res = await ctx.http.request(url, { conditional: true, encoding: c.encoding, timeoutMs: 30_000, headers });
    if (res.notModified) return { notModified: true, state: ctx.state, note: "변경 없음 (304)" };
    return c.mode === "links" ? watchLinks(ctx, c, res) : watchText(ctx, c, res);
  },
});

function compile(re: string, what: string): RegExp {
  try {
    return new RegExp(re, "i");
  } catch {
    throw new ConfigError(`${what}의 정규식이 올바르지 않습니다: ${re}`);
  }
}

/** Page text as comparable paragraphs: spaces folded, invisible characters and ignored lines dropped. */
export function pageLines(text: string, ignore: RegExp[] = []): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/[\u200b-\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim())
    .filter((l) => l && !ignore.some((re) => re.test(l)));
}

export function pageTitle(html: string): string | null {
  const og = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1];
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? og;
  const s = t ? oneLine(decodeEntities(t)) : "";
  return s ? clip(s, 120) : null;
}

function counted(n: { reworded: number; added: number; removed: number }): string {
  const parts = [n.reworded && `${n.reworded}곳 수정`, n.added && `${n.added}곳 추가`, n.removed && `${n.removed}곳 삭제`].filter(Boolean);
  return `문단 ${parts.join("·")}`;
}

function watchText(ctx: AdapterContext<Cfg>, c: Cfg, res: HttpResponse): AdapterResult {
  const ignore = (c.ignore ?? []).map((re) => compile(re, "ignore"));
  const raw = c.select ? selectedText(res.text, c.select, MAX_TEXT) : extractArticleText(res.text, MAX_TEXT);
  const lines = pageLines(raw, ignore);
  if (!lines.length) throw new Error(c.select ? `선택자에 맞는 본문이 없습니다 (select: ${c.select})` : "비교할 본문을 찾지 못했습니다 — 차단 페이지이거나 스크립트로만 그리는 페이지일 수 있습니다");
  const text = lines.join("\n");
  const hash = sha(text, 24);
  const prev = ctx.state as TextState;
  const at = ctx.now.toISOString();
  const title = c.label ?? pageTitle(res.text) ?? ctx.source.name;
  // the date often sits beside the text ("Effective Jun 17, 2025" above the column)
  const date = docDate(text) ?? docDate(htmlToText(res.text.slice(0, 2_000_000)));
  const versions = [{ hash, at }, ...(prev.versions ?? []).filter((v) => v.hash !== hash)].slice(0, MAX_VERSIONS);
  const keep = (changedAt?: string) => ({ ...ctx.state, hash, text, title, docDate: date, checkedAt: at, changedAt, versions });

  if (!prev.hash || prev.text === undefined) {
    return {
      state: keep(at),
      note: `처음 읽음 — 지금 모습을 기준으로 저장 (${lines.length}문단 ${text.length.toLocaleString("en-US")}자${date ? `, ${date.label}` : ""}). 다음 확인부터 바뀐 문단을 올립니다`,
    };
  }
  if (prev.hash === hash) return { notModified: true, state: keep(prev.changedAt), note: "변경 없음" };
  // pages that alternate between two versions (A/B tests, rotating blocks) are filed once
  if (prev.versions?.some((v) => v.hash === hash)) return { state: keep(prev.changedAt), note: "전에 본 판으로 돌아감 — 올리지 않음" };

  const changes = changesOf(diffLines(prev.text.split("\n"), lines));
  const size = changedChars(changes);
  if (!changes.length || size < c.minChange) return { state: keep(prev.changedAt), note: `작은 변경(${size}자) — 올리지 않음` };

  const n = countChanges(changes);
  const what = counted(n);
  const prevDate = prev.docDate ?? null;
  const dateMoved = date && date.label !== prevDate?.label;
  const dateLine = date ? `문서 날짜: ${date.label}${dateMoved && prevDate ? ` (이전: ${prevDate.label})` : ""}` : "";
  const rendered = changes.map((ch, i) => renderChange(ch, i + 1));
  const url = res.url;

  let summary = `${title} 페이지가 바뀌었습니다(${what}).${dateLine ? ` ${dateLine}.` : ""}`;
  for (const r of rendered) {
    if (summary.length + r.length + 1 > SUMMARY_MAX) break;
    summary += ` ${r}`;
  }
  const body = clip(
    [`문서: ${title} (${url})`, dateLine, "표기: [-…-] 지운 말, {+…+} 새로 넣은 말", ...rendered].filter(Boolean).join("\n"),
    BODY_MAX,
  );
  const item: IngestItem = {
    externalId: `v:${hash}`,
    url,
    title: clip(`${title} 변경 — ${what}${dateMoved ? ` (${date.label})` : ""}`, 300),
    summary: clip(summary, SUMMARY_MAX + 300),
    publishedAt: ctx.now,
    weight: c.weight,
    payload: {
      watch: "text",
      doc: title,
      counts: n,
      changedChars: size,
      docDate: date?.iso ?? null,
      docDateLabel: date?.label ?? null,
      prevDocDateLabel: prevDate?.label ?? null,
      version: hash,
      prevVersion: prev.hash,
      prevCheckedAt: prev.checkedAt ?? null,
      body,
      bodyFrom: "page",
      bodyUrl: url,
      bodyAt: at,
    },
  };
  return { items: [item], state: keep(at), note: `변경: ${what} (${size}자)` };
}

/* ── links ── */

export interface LinkRow {
  url: string;
  text: string;
  /** the other text on the link's row (date, department) */
  row: string;
  date?: Date;
}

const ROW_DATE =
  /\d{4}\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2}|\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일|\b\d{1,2}\/\d{1,2}\/\d{4}\b|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+\d{4}/i;

/** The link's row: a table row or list item, else the nearest block that shows a date and holds no other row's links. */
function rowOf(a: HTMLElement): HTMLElement {
  for (let n = a.parentNode, up = 0; n && up < 6; n = n.parentNode, up++) {
    const tag = n.rawTagName?.toLowerCase();
    if (tag === "tr" || tag === "li" || tag === "article" || tag === "dl") return n;
  }
  let last: HTMLElement = a.parentNode ?? a;
  for (let n = a.parentNode, up = 0; n && up < 5; n = n.parentNode, up++) {
    if (n.querySelectorAll("a").length > 4) return last;
    last = n;
    if (ROW_DATE.test(spacedText(n))) return n;
  }
  return a.parentNode ?? a;
}

/** Text with a space between every text node, so table cells do not run together. */
function spacedText(el: HTMLElement): string {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) out.push(n.rawText);
    else for (const c of n.childNodes) walk(c);
  };
  walk(el);
  return oneLine(decodeEntities(out.join(" ")));
}

/** Links on a list page, in page order, with the date shown on their row when there is one. */
export function pageLinks(
  html: string,
  baseUrl: string,
  o: { select?: string; linkPattern?: RegExp; linkTemplate?: { regex: RegExp; url: string }; stripTitle?: RegExp } = {},
  now = new Date(),
): LinkRow[] {
  const root = parse(html, { comment: false, blockTextElements: { script: false, style: false, noscript: false } });
  let scopes: HTMLElement[];
  if (o.select) scopes = root.querySelectorAll(o.select);
  else {
    const main = root.querySelector("main") ?? root.querySelector("body") ?? root;
    for (const el of main.querySelectorAll("nav,header,footer,aside,script,style")) el.remove();
    scopes = [main];
  }
  const out: LinkRow[] = [];
  const seen = new Set<string>();
  for (const scope of scopes) {
    for (const a of scope.querySelectorAll("a")) {
      const href = (a.getAttribute("href") ?? "").trim();
      const onclick = a.getAttribute("onclick") ?? "";
      let link: string | null = null;
      if (o.linkTemplate) {
        const m = o.linkTemplate.regex.exec(`${href} ${onclick}`);
        if (m) link = o.linkTemplate.url.replace(/\{(\d)\}/g, (_, k: string) => encodeURIComponent(m[Number(k)] ?? ""));
      }
      if (!link) {
        if (!href || /^(javascript:|mailto:|tel:|#)/i.test(href)) continue;
        link = absUrl(href, baseUrl);
      }
      if (!link) continue;
      link = link.replace(/#.*$/, "");
      if (o.linkPattern && !o.linkPattern.test(link)) continue;
      const raw = oneLine(decodeEntities(a.textContent ?? "")) || oneLine(decodeEntities(a.getAttribute("title") ?? ""));
      const text = o.stripTitle ? oneLine(raw.replace(new RegExp(o.stripTitle.source, "gi"), " ")) : raw;
      if (text.length < 4 || seen.has(link)) continue;
      seen.add(link);
      const rowText = spacedText(rowOf(a));
      const d = ROW_DATE.exec(rowText)?.[0];
      const iso = d ? isoDay(d) : null;
      out.push({
        url: link,
        text: clip(text, 300),
        row: clip(oneLine(rowText.replace(raw, " ")), 300),
        date: iso ? parseKstDate(iso.replaceAll("-", ""), now) : undefined,
      });
    }
  }
  return out;
}

function watchLinks(ctx: AdapterContext<Cfg>, c: Cfg, res: HttpResponse): AdapterResult {
  const links = pageLinks(
    res.text,
    res.url,
    {
      select: c.select,
      linkPattern: c.linkPattern ? compile(c.linkPattern, "linkPattern") : undefined,
      linkTemplate: c.linkTemplate ? { regex: compile(c.linkTemplate.regex, "linkTemplate.regex"), url: c.linkTemplate.url } : undefined,
      stripTitle: c.stripTitle ? compile(c.stripTitle, "stripTitle") : undefined,
    },
    ctx.now,
  ).filter((l) => passesKeywords(l.text, c.include, c.exclude));
  if (!links.length) throw new Error(`목록에서 링크를 찾지 못했습니다${c.select ? ` (select: ${c.select})` : ""}${c.linkPattern ? ` (linkPattern: ${c.linkPattern})` : ""}`);

  const prevSeen = (ctx.state.seen as string[] | undefined) ?? [];
  const known = new Set(prevSeen);
  const first = !prevSeen.length;
  const seen = [...new Set([...links.map((l) => l.url), ...prevSeen])].slice(0, MAX_SEEN);
  const state = { ...ctx.state, seen, checkedAt: ctx.now.toISOString() };
  const fresh = links.filter((l) => !known.has(l.url));
  const cutoff = ctx.now.getTime() - c.maxAgeDays * 86_400_000;
  const recent = (l: LinkRow) => (l.date ? l.date.getTime() >= cutoff : !first);

  // a redesign turns every link "new": take the page as it is now instead of filing all of it
  if (!first && fresh.length > 20 && fresh.length > links.length * 0.6) {
    return { state, note: `링크 ${fresh.length}개가 한꺼번에 바뀜 — 페이지 개편으로 보고 지금 모습을 다시 기준으로 저장` };
  }
  const items: IngestItem[] = fresh
    .filter(recent)
    .slice(0, c.maxItems)
    .map((l) => ({
      externalId: l.url.slice(0, 500),
      url: l.url,
      title: l.text,
      summary: l.row,
      // on the first run the row's date is all we know; later, finding it is within a poll of its posting
      publishedAt: first || (l.date && ctx.now.getTime() - l.date.getTime() > 36 * 3_600_000) ? (l.date ?? null) : ctx.now,
      weight: c.weight,
      payload: { watch: "links", list: res.url },
    }));
  const note = first ? `처음 읽음 — 링크 ${links.length}개 저장, 최근 ${items.length}건 올림` : `새 링크 ${fresh.length}개${items.length < fresh.length ? ` (오래된 ${fresh.length - items.length}개 제외)` : ""}`;
  return { items, state, note };
}
