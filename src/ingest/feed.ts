import { XMLParser } from "fast-xml-parser";
import { absUrl, clip, decodeEntities, htmlToText, oneLine, parseDate } from "./text";

/**
 * RSS 2.0 / Atom 1.0 / RSS 1.0 (RDF) → one shape. Namespaced fields that
 * matter here (dc:creator, dc:date, content:encoded, arxiv:announce_type,
 * media:thumbnail) are kept by their prefixed names.
 */

export interface FeedEntry {
  /** guid / id / link — whatever identifies the entry upstream */
  id: string;
  title: string;
  link: string | null;
  /** plain text */
  summary: string;
  published?: Date;
  updated?: Date;
  authors: string[];
  categories: string[];
  /** remaining namespaced extras (arxiv:announce_type, …) */
  extra: Record<string, string>;
}

export interface ParsedFeed {
  format: "rss" | "atom" | "rdf";
  title: string;
  link: string | null;
  entries: FeedEntry[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  // keep CDATA as text, never evaluate entities beyond XML's own
  cdataPropName: false,
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => ["item", "entry", "link", "category", "author", "dc:creator", "dc:subject"].includes(name),
});

type Node = Record<string, unknown> | string | undefined;

function text(n: unknown): string {
  if (n == null) return "";
  if (typeof n === "string" || typeof n === "number" || typeof n === "boolean") return String(n);
  if (Array.isArray(n)) return n.map(text).filter(Boolean).join(", ");
  if (typeof n === "object") {
    const o = n as Record<string, unknown>;
    if ("#text" in o) return text(o["#text"]);
    if ("name" in o) return text(o.name);
  }
  return "";
}

function arr<T>(v: T | T[] | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

export function parseFeed(xml: string, baseUrl: string): ParsedFeed {
  const trimmed = xml.trimStart();
  if (!trimmed.startsWith("<")) throw new Error(`not XML: ${oneLine(trimmed.slice(0, 120))}`);
  const doc = parser.parse(trimmed) as Record<string, Node>;

  if (doc.rss && typeof doc.rss === "object") {
    const ch = (doc.rss as Record<string, unknown>).channel as Record<string, unknown> | undefined;
    if (!ch) throw new Error("RSS without <channel>");
    const link = absUrl(text(arr(ch.link as Node | Node[])[0]), baseUrl);
    return { format: "rss", title: oneLine(text(ch.title)), link, entries: arr(ch.item as Node[]).map((it) => rssItem(it as Record<string, unknown>, link ?? baseUrl)) };
  }
  if (doc.feed && typeof doc.feed === "object") {
    const f = doc.feed as Record<string, unknown>;
    const base = text(f["@xml:base"]) || baseUrl;
    return { format: "atom", title: oneLine(text(f.title)), link: atomLink(f.link, base), entries: arr(f.entry as Node[]).map((e) => atomEntry(e as Record<string, unknown>, base)) };
  }
  const rdf = doc["rdf:RDF"] as Record<string, unknown> | undefined;
  if (rdf) {
    const ch = (rdf.channel ?? {}) as Record<string, unknown>;
    const link = absUrl(text(arr(ch.link as Node | Node[])[0]), baseUrl);
    return { format: "rdf", title: oneLine(text(ch.title)), link, entries: arr(rdf.item as Node[]).map((it) => rssItem(it as Record<string, unknown>, link ?? baseUrl)) };
  }
  throw new Error(`unknown feed root <${Object.keys(doc).filter((k) => !k.startsWith("?"))[0] ?? "?"}>`);
}

const KNOWN_RSS = new Set(["title", "link", "guid", "description", "pubDate", "dc:date", "dc:creator", "author", "category", "content:encoded", "dc:subject"]);

function rssItem(it: Record<string, unknown>, base: string): FeedEntry {
  const link = absUrl(text(arr(it.link as Node | Node[])[0]).trim(), base);
  const guid = text(it.guid).trim();
  const descHtml = text(it["content:encoded"]) || text(it.description);
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(it)) {
    if (k.includes(":") && !KNOWN_RSS.has(k) && !k.startsWith("@")) {
      const t = text(v).trim();
      if (t) extra[k] = t;
    }
  }
  return {
    id: guid || link || text(it.title).trim(),
    title: oneLine(decodeEntities(text(it.title))),
    link,
    summary: htmlToText(text(it.description) || descHtml),
    published: parseDate(text(it.pubDate).trim() || text(it["dc:date"]).trim()),
    authors: [...arr(it["dc:creator"] as Node[]), ...arr(it.author as Node[])].map((a) => oneLine(text(a))).filter(Boolean),
    categories: [...arr(it.category as Node[]), ...arr(it["dc:subject"] as Node[])].map((c) => oneLine(text(c) || text((c as Record<string, unknown>)?.["@term"]))).filter(Boolean),
    extra,
  };
}

function atomLink(links: unknown, base: string): string | null {
  const list = arr(links as Record<string, unknown>[]).filter((l) => l && typeof l === "object");
  const pick = list.find((l) => !l["@rel"] || l["@rel"] === "alternate") ?? list[0];
  return pick ? absUrl(text(pick["@href"]), base) : null;
}

function atomEntry(e: Record<string, unknown>, base: string): FeedEntry {
  const link = atomLink(e.link, base);
  const summaryNode = (e.summary ?? e.content) as Node;
  const summaryType = typeof summaryNode === "object" ? text((summaryNode as Record<string, unknown>)["@type"]) : "";
  const raw = text(summaryNode);
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(e)) {
    if (k.includes(":") && !k.startsWith("@")) {
      const t = text(v).trim();
      if (t) extra[k] = t;
    }
  }
  return {
    id: text(e.id).trim() || link || text(e.title).trim(),
    title: oneLine(decodeEntities(text(e.title))),
    link,
    summary: summaryType === "text" ? oneLine(raw) : htmlToText(raw),
    published: parseDate(text(e.published).trim() || text(e.updated).trim()),
    updated: parseDate(text(e.updated).trim()),
    authors: arr(e.author as Node[]).map((a) => oneLine(text(a))).filter(Boolean),
    categories: arr(e.category as Record<string, unknown>[]).map((c) => oneLine(text(c?.["@label"]) || text(c?.["@term"]))).filter(Boolean),
    extra,
  };
}

/** One RSS/Atom entry → summary sized for the inbox. */
export function entrySummary(e: FeedEntry, max = 600): string {
  return clip(e.summary.replace(/\s*\n\s*/g, " "), max);
}

/** Atom/OData property bags (Treasury XML) — exposed for adapters with odd feeds. */
export function parseXml(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}
