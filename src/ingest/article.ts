import { parse, type HTMLElement, type Node } from "node-html-parser";
import { absUrl, decodeEntities } from "./text";

/**
 * Main text of an article page — for press releases whose feed carries only a
 * title. No site rules: drop chrome (menus, headers, footers, share bars), then
 * walk down from <body> while one child holds most of the remaining non-link
 * text. Whatever we stop at is the article; its text keeps paragraph breaks.
 */

const DROP = "script,style,noscript,template,svg,iframe,form,nav,header,footer,aside,button,select,textarea,input,label,img,video,audio,object";
// chrome by class/id; "content" and friends win when both match (e.g. "sub_content_menu" stays out, "content" stays in)
const CHROME =
  /(^|[\s_-])(g?nb|lnb|snb|menu|navi?|header|footer|sidebar|side_?menu|banner|breadcrumbs?|location|util|share|sns|related|recommend|comments?|reply|copyright|skip|quick|pagination|paging|prev|next|search|popup|modal|login|sitemap|family|satisfaction|survey|kogl|tag_?list)([\s_-]|$)/i;
const BLOCK = new Set(["p", "div", "section", "article", "main", "table", "tbody", "thead", "tr", "td", "th", "ul", "ol", "li", "dl", "dt", "dd", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "figure", "figcaption", "br", "hr"]);
// lines that are page furniture, not article text
const FURNITURE = /^(목록|목록보기|이전글|다음글|이전|다음|첨부파일|첨부|다운로드|바로보기|미리보기|내려받기|인쇄|프린트|공유|공유하기|스크랩|글자 ?크기|확대|축소|URL ?복사|맨 ?위로|TOP|페이스북|트위터|카카오(톡|스토리)?|네이버 ?블로그|블로그|print|share|back to top)$/i;

const DOMINANT = 0.7;
const MIN_TEXT = 80;

function isElement(n: Node): n is HTMLElement {
  return n.nodeType === 1;
}

function marker(el: HTMLElement): string {
  return `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""} ${el.getAttribute("role") ?? ""}`;
}

/** Non-link text length under `el` — links are navigation more often than not. */
function weight(el: HTMLElement, memo: Map<HTMLElement, number>): number {
  const hit = memo.get(el);
  if (hit !== undefined) return hit;
  let n = 0;
  for (const c of el.childNodes) {
    if (isElement(c)) {
      if (c.rawTagName?.toLowerCase() === "a") continue;
      n += weight(c, memo);
    } else if (c.nodeType === 3) {
      n += c.rawText.replace(/\s+/g, "").length;
    }
  }
  memo.set(el, n);
  return n;
}

/** Text with a line break after every block element. */
function blockText(el: HTMLElement): string {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (isElement(n)) {
      const tag = n.rawTagName?.toLowerCase() ?? "";
      if (tag === "br") return void out.push("\n");
      for (const c of n.childNodes) walk(c);
      if (BLOCK.has(tag)) out.push("\n");
    } else if (n.nodeType === 3) {
      // a line break in the HTML source is a space (hard-wrapped pages), except inside <pre>
      const pre = n.parentNode?.rawTagName?.toLowerCase() === "pre";
      out.push(decodeEntities(pre ? n.rawText : n.rawText.replace(/\s*\n\s*/g, " ")));
    }
  };
  walk(el);
  return out
    .join("")
    .replace(/[ \t\f\v ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !FURNITURE.test(l))
    .join("\n")
    .replace(/\n{2,}/g, "\n");
}

// a region chosen by selector keeps its form-ish wrappers (some sites put whole sections in <label>)
const DROP_IN_SELECTED = "script,style,noscript,template,svg,iframe,button,select,textarea,input,img,video,audio,object";

function parsePage(html: string, drop = DROP): HTMLElement {
  const root = parse(html, { comment: false, blockTextElements: { script: false, style: false, noscript: false, pre: true } });
  for (const el of root.querySelectorAll(drop)) el.remove();
  return root;
}

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, "")}…` : text;
}

export function extractArticleText(html: string, max = 8000): string {
  const root = parsePage(html);
  for (const el of root.querySelectorAll("[class],[id],[role]")) {
    const m = marker(el);
    if (CHROME.test(m) && !/(^|[\s_-])(article|contents?|view|post|entry|body)([\s_-]|$)/i.test(m)) el.remove();
  }
  const memo = new Map<HTMLElement, number>();
  let el: HTMLElement = root.querySelector("body") ?? root;
  for (;;) {
    const total = weight(el, memo);
    const kids = el.childNodes.filter(isElement);
    let top: HTMLElement | null = null;
    for (const k of kids) if (!top || weight(k, memo) > weight(top, memo)) top = k;
    if (!top || weight(top, memo) < total * DOMINANT) break;
    el = top;
  }
  if (weight(el, memo) < MIN_TEXT) return "";
  return cut(blockText(el), max);
}

/** Text of every element matching `select`, in page order — for pages whose main text the heuristic above would miss. */
export function selectedText(html: string, select: string, max = 8000): string {
  const all = parsePage(html, DROP_IN_SELECTED).querySelectorAll(select);
  const matched = new Set(all);
  // a match inside another match is already in its text
  const outer = all.filter((el) => {
    for (let p = el.parentNode; p; p = p.parentNode) if (matched.has(p)) return false;
    return true;
  });
  return cut(outer.map((el) => blockText(el)).filter(Boolean).join("\n"), max);
}

/**
 * PDF attachments linked from a page, best first: the press release itself
 * ("보도자료" in the name) before tables and appendices.
 */
export function pdfLinks(html: string, pageUrl: string): string[] {
  const root = parse(html, { comment: false });
  const found: Array<{ url: string; rank: number }> = [];
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    const name = `${a.getAttribute("title") ?? ""} ${a.text}`;
    if (!/\.pdf($|[?#])/i.test(href) && !/\.pdf\b/i.test(name)) continue;
    if (/viewer\.html|javascript:/i.test(href)) continue;
    const url = absUrl(href, pageUrl);
    if (!url || found.some((f) => f.url === url)) continue;
    found.push({ url, rank: /보도|press|release/i.test(name) ? 0 : /붙임|별첨|참고|통계|appendix/i.test(name) ? 2 : 1 });
  }
  return found.sort((a, b) => a.rank - b.rank).map((f) => f.url);
}
