import { z } from "zod";
import { passesKeywords } from "../../classify";
import { parseJson } from "../../http";
import { assertRobotsAllow } from "../../robots";
import { clip, htmlToText, oneLine, parseDate, parseKstDate } from "../../text";
import { ConfigError, defineAdapter, type IngestItem } from "../../types";

/**
 * Any JSON list as inbox items, by configuration alone: where the list sits
 * in the response and which fields hold the id, title, link and time — for
 * APIs without an adapter of their own (exchange announcements, the Federal
 * Register, model hubs, job boards). Rows older than `maxAgeDays` are left
 * out; rows without a time are filed when they first appear (not on the
 * first run). Free keys come from the environment, never from the config.
 */

/** "data.notices", "result.list.0.details"; "" = the response itself */
const path = z.string().max(200);
/** a path ("title") or a template with paths in braces ("{name} — {status}") */
const text = z.string().min(1).max(500);

const KEYS = [
  { name: "DATA_GO_KR_KEY", required: false, help: "공공데이터포털(data.go.kr) 일반 인증키(Decoding). 마이페이지 > 데이터활용 > Open API > 인증키 발급현황" },
  { name: "ASSEMBLY_API_KEY", required: false, help: "열린국회정보(open.assembly.go.kr) 인증키. 마이페이지 > 인증키 발급" },
  { name: "CONGRESS_API_KEY", required: false, help: "Congress.gov API 키 (api.congress.gov/sign-up, api.data.gov 키)" },
];

const config = z.object({
  /** defaults to the source URL */
  url: z.url().optional(),
  method: z.enum(["GET", "POST"]).default("GET"),
  /** JSON body for POST */
  body: z.string().max(4000).optional(),
  itemsPath: path.default(""),
  fields: z.object({
    id: text,
    title: text,
    url: text.optional(),
    summary: text.optional(),
    /** ISO / RFC dates, "2026-10-21 14:03" (KST), or Unix seconds / milliseconds */
    time: path.optional(),
  }),
  /** keep rows whose field equals a value or matches a regular expression (all conditions must hold) */
  where: z
    .array(z.object({ field: path, equals: z.union([z.string(), z.number(), z.boolean()]).optional(), matches: z.string().min(1).max(200).optional() }))
    .max(8)
    .optional(),
  /** words the title (and summary) must or must not contain */
  include: z.array(z.string().min(1)).max(60).optional(),
  exclude: z.array(z.string().min(1)).max(60).optional(),
  /** words that raise the inbox score */
  boost: z.array(z.string().min(1)).max(40).optional(),
  maxAgeDays: z.number().min(0.1).max(90).default(3),
  maxItems: z.number().int().min(1).max(200).default(40),
  /** a free key from an environment variable, sent as a query parameter or a header */
  key: z
    .object({ env: z.enum(KEYS.map((k) => k.name) as [string, ...string[]]), query: z.string().min(1).max(40).optional(), header: z.string().min(1).max(60).optional() })
    .refine((k) => Boolean(k.query) !== Boolean(k.header), "query나 header 중 하나만 정합니다")
    .optional(),
  /** title and summary fields hold HTML */
  html: z.boolean().default(false),
  respectRobots: z.boolean().default(true),
  robotsOverride: z.string().max(300).optional(),
  weight: z.number().min(0).max(1).default(0.5),
});

type Cfg = z.infer<typeof config>;
type Row = Record<string, unknown>;

const MAX_SEEN = 2000;

export function getPath(v: unknown, p: string): unknown {
  if (!p) return v;
  let cur = v;
  for (const k of p.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur) ? cur[Number(k)] : (cur as Row)[k];
  }
  return cur;
}

function str(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(", ");
  if (typeof v === "object") return (v as Row).name != null ? str((v as Row).name) : "";
  return String(v);
}

/** A path, or a template whose {paths} are filled in; `encode` escapes values placed inside a URL. */
export function fill(tpl: string, row: unknown, encode = false): string {
  if (!tpl.includes("{")) return str(getPath(row, tpl));
  return tpl.replace(/\{([^{}]+)\}/g, (_, p: string) => {
    const s = str(getPath(row, p.trim()));
    return encode ? encodeURIComponent(s).replace(/%2F/gi, "/") : s;
  });
}

export function parseTime(v: unknown, now: Date): Date | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : /^\d{10}(\d{3})?$/.test(String(v).trim()) ? Number(v) : NaN;
  if (Number.isFinite(n)) {
    const d = new Date(n > 1e12 ? n : n * 1000);
    return d.getTime() > now.getTime() + 2 * 86_400_000 ? undefined : d;
  }
  const s = String(v).trim();
  // "2026-10-24 11:55:00" has no zone: the Korean exchanges and boards mean KST
  if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}( \d{1,2}:\d{2}(:\d{2})?)?$/.test(s)) return parseKstDate(s, now);
  return parseDate(s, now);
}

function keep(row: unknown, where: Cfg["where"]): boolean {
  for (const w of where ?? []) {
    const v = getPath(row, w.field);
    if (w.equals !== undefined && str(v) !== String(w.equals)) return false;
    if (w.matches !== undefined && !new RegExp(w.matches, "i").test(str(v))) return false;
  }
  return true;
}

export const jsonListAdapter = defineAdapter({
  key: "json.list",
  label: "JSON 목록 API",
  description:
    "JSON으로 목록을 주는 API를 설정만으로 읽습니다(목록 위치, id·제목·링크·시간 필드). 거래소 공지, 미국 연방관보, 모델 허브, 채용 공고 등. 최근 며칠 것만 올리고, 시간이 없는 항목은 새로 나타날 때 올립니다. 무료 키는 환경 변수에서만 읽습니다.",
  kind: "api",
  group: "generic",
  configSchema: config,
  configExample: {
    itemsPath: "data.notices",
    fields: { id: "id", title: "title", url: "https://example.com/notice/{id}", time: "listed_at" },
    maxAgeDays: 3,
    maxItems: 40,
  },
  envVars: KEYS,
  defaultPollSec: 600,
  async run(ctx) {
    const c = ctx.config;
    const base = c.url ?? ctx.source.url;
    if (!base) throw new ConfigError("API URL이 없습니다 (소스 URL 또는 config.url)");
    if (!c.respectRobots && !c.robotsOverride) throw new ConfigError("robots.txt 예외에는 근거(robotsOverride: 협의 내용·일자)가 필요합니다");
    for (const w of c.where ?? []) {
      if (w.matches) {
        try {
          new RegExp(w.matches);
        } catch {
          throw new ConfigError(`where.matches 정규식이 올바르지 않습니다: ${w.matches}`);
        }
      }
    }
    if (c.respectRobots) await assertRobotsAllow(ctx.http, ctx.state, base, ctx.now);

    const url = new URL(base);
    const headers: Record<string, string> = c.method === "POST" ? { "content-type": "application/json" } : {};
    // some APIs answer in (or validate against) the visitor's language
    if (ctx.source.lang === "en") headers["accept-language"] = "en-US,en;q=0.9";
    if (c.key) {
      const secret = ctx.secret(c.key.env);
      if (!secret) throw new ConfigError(`키 필요: ${c.key.env}`);
      if (c.key.query) url.searchParams.set(c.key.query, secret);
      else headers[c.key.header!] = secret;
    }
    const res = await ctx.http.request(url.toString(), { method: c.method, body: c.body, headers: { accept: "application/json", ...headers }, timeoutMs: 30_000 });
    // never echo a key back into notes or errors
    const shown = c.key?.query ? base : url.toString();
    const data = parseJson<unknown>(res.text, shown);
    const list = getPath(data, c.itemsPath);
    if (!Array.isArray(list)) throw new Error(`목록이 없습니다 (itemsPath: "${c.itemsPath || "(응답 전체)"}") — 응답 앞부분: ${clip(oneLine(res.text), 160)}`);

    const prevSeen = (ctx.state.seen as string[] | undefined) ?? [];
    const known = new Set(prevSeen);
    const first = !prevSeen.length;
    const cutoff = ctx.now.getTime() - c.maxAgeDays * 86_400_000;
    const plain = (s: string) => oneLine(c.html ? htmlToText(s) : s);

    const ids: string[] = [];
    const items: IngestItem[] = [];
    for (const row of list) {
      if (!keep(row, c.where)) continue;
      const id = fill(c.fields.id, row).trim();
      const title = plain(fill(c.fields.title, row));
      if (!id || !title) continue;
      ids.push(id);
      const summary = c.fields.summary ? plain(fill(c.fields.summary, row)) : "";
      if (!passesKeywords(`${title} ${summary}`, c.include, c.exclude)) continue;
      const time = c.fields.time ? parseTime(getPath(row, c.fields.time), ctx.now) : undefined;
      if (items.length >= c.maxItems || (time ? time.getTime() < cutoff : first || known.has(id))) continue;
      const link = c.fields.url ? fill(c.fields.url, row, c.fields.url.includes("{")) : "";
      items.push({
        externalId: id.slice(0, 500),
        url: /^https?:\/\//.test(link) ? link : null,
        title: clip(title, 300),
        summary: clip(summary, 700),
        publishedAt: time ?? (first ? null : ctx.now),
        weight: c.weight,
      });
    }
    const seen = [...new Set([...ids, ...prevSeen])].slice(0, MAX_SEEN);
    return { items, state: { ...ctx.state, seen }, note: `${list.length}행 중 ${items.length}건` };
  },
});
