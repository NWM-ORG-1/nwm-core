import { z } from "zod";
import type { Http } from "../../http";
import { clip, parseDate } from "../../text";
import { ConfigError, defineAdapter, type IngestItem, type SocialPostIn } from "../../types";

/**
 * Accounts on X the editors follow. Official API v2 recent search, pay-per-use:
 * every post returned is billed (re-reads of a post the same UTC day are not),
 * so the adapter only ever asks for posts newer than the last one it saw and
 * stops at the monthly cap. A different provider with a v2-compatible search
 * endpoint can be plugged in through `provider` without touching the rest.
 */

const PRICE_PER_POST_USD = 0.005;
/** recent search query length limit on self-serve access */
const MAX_QUERY = 512;

const config = z.object({
  accounts: z.array(z.string().regex(/^@?[A-Za-z0-9_]{1,15}$/)).min(1).max(300),
  includeReplies: z.boolean().default(false),
  includeReposts: z.boolean().default(false),
  /** extra operators appended to each query, e.g. "lang:ko" or "-is:quote" */
  extra: z.string().max(100).default(""),
  output: z.array(z.enum(["items", "posts"])).min(1).default(["items"]),
  /** posts read per run (billing guard) */
  maxPostsPerRun: z.number().int().min(10).max(2000).default(300),
  /** posts read per calendar month for this source (billing guard); 0 = no cap */
  monthlyPostCap: z.number().int().min(0).max(2_000_000).default(20_000),
  provider: z
    .object({
      kind: z.enum(["official", "compatible"]).default("official"),
      /** v2-compatible base URL for kind=compatible */
      baseUrl: z.url().optional(),
      /** header carrying the key for kind=compatible (default Authorization: Bearer) */
      authHeader: z.string().max(60).optional(),
      /** env var holding that key */
      keyEnv: z.string().regex(/^[A-Z][A-Z0-9_]{2,60}$/).optional(),
      pricePerPostUsd: z.number().min(0).max(1).optional(),
    })
    .default({ kind: "official" }),
  weight: z.number().min(0).max(1).default(0.5),
});

type Cfg = z.infer<typeof config>;

interface XPost {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  lang?: string;
  public_metrics?: { retweet_count?: number; reply_count?: number; like_count?: number; quote_count?: number; impression_count?: number };
}
interface XUser {
  id: string;
  username: string;
  name?: string;
}
interface XSearch {
  data?: XPost[];
  includes?: { users?: XUser[] };
  meta?: { newest_id?: string; next_token?: string; result_count?: number };
  errors?: Array<{ message?: string }>;
  title?: string;
  detail?: string;
}

/** Group "from:" clauses so every query stays under the length limit. */
export function buildQueries(c: Pick<Cfg, "accounts" | "includeReplies" | "includeReposts" | "extra">): string[] {
  const suffix = [c.includeReposts ? "" : "-is:retweet", c.includeReplies ? "" : "-is:reply", c.extra.trim()].filter(Boolean).join(" ");
  const out: string[] = [];
  let group: string[] = [];
  const render = (g: string[]) => `(${g.join(" OR ")}) ${suffix}`.trim();
  for (const raw of c.accounts) {
    const clause = `from:${raw.replace(/^@/, "")}`;
    if (group.length && render([...group, clause]).length > MAX_QUERY) {
      out.push(render(group));
      group = [];
    }
    group.push(clause);
  }
  if (group.length) out.push(render(group));
  return out;
}

async function search(http: Http, c: Cfg, auth: Record<string, string>, query: string, sinceId: string | undefined, startTime: string | undefined, nextToken?: string): Promise<XSearch> {
  const base = c.provider.kind === "compatible" ? c.provider.baseUrl! : "https://api.x.com";
  const params = new URLSearchParams({
    query,
    max_results: "100",
    "tweet.fields": "created_at,public_metrics,lang,author_id",
    expansions: "author_id",
    "user.fields": "username,name",
  });
  if (sinceId) params.set("since_id", sinceId);
  else if (startTime) params.set("start_time", startTime);
  if (nextToken) params.set("next_token", nextToken);
  const res = await http.request(`${base.replace(/\/$/, "")}/2/tweets/search/recent?${params}`, { headers: auth, okStatuses: [401, 403], timeoutMs: 20_000 });
  if (res.status === 401 || res.status === 403) throw new ConfigError(`X API ${res.status}: 키 또는 접근 권한(요금제)을 확인하세요`);
  return JSON.parse(res.text) as XSearch;
}

export const xAccountsAdapter = defineAdapter({
  key: "x.accounts",
  label: "X 지정 계정",
  description: "지정 계정의 새 게시물(공식 API v2 최근 검색, 사용량 과금). 마지막으로 본 글 이후만 요청하고 월 한도에서 멈춥니다. 다른 v2 호환 API로 바꿀 수 있습니다.",
  kind: "api",
  group: "social",
  configSchema: config,
  configExample: {
    accounts: ["@sama", "@AnthropicAI", "@Upbit_Official"],
    includeReplies: false,
    includeReposts: false,
    extra: "",
    output: ["items"],
    maxPostsPerRun: 300,
    monthlyPostCap: 20_000,
    provider: { kind: "official" },
    weight: 0.5,
  },
  envVars: [{ name: "X_BEARER_TOKEN", required: false, help: "X 개발자 콘솔의 앱 Bearer 토큰 (공식 API 사용 시 필수)" }],
  defaultPollSec: 300,
  async run(ctx) {
    const c = ctx.config;
    let auth: Record<string, string>;
    if (c.provider.kind === "official") {
      const token = ctx.secret("X_BEARER_TOKEN");
      if (!token) throw new ConfigError("키 필요: X_BEARER_TOKEN");
      auth = { authorization: `Bearer ${token}` };
    } else {
      if (!c.provider.baseUrl || !c.provider.keyEnv) throw new ConfigError("호환 API에는 provider.baseUrl과 provider.keyEnv가 필요합니다");
      const key = process.env[c.provider.keyEnv]?.trim();
      if (!key) throw new ConfigError(`키 필요: ${c.provider.keyEnv}`);
      auth = c.provider.authHeader ? { [c.provider.authHeader.toLowerCase()]: key } : { authorization: `Bearer ${key}` };
    }
    const price = c.provider.pricePerPostUsd ?? (c.provider.kind === "official" ? PRICE_PER_POST_USD : 0);

    const month = ctx.now.toISOString().slice(0, 7);
    const usage = (ctx.state.usage as { month: string; posts: number } | undefined)?.month === month ? (ctx.state.usage as { month: string; posts: number }) : { month, posts: 0 };
    if (c.monthlyPostCap && usage.posts >= c.monthlyPostCap) {
      return { state: { ...ctx.state, usage }, nextRunInSec: 3600, note: `월 한도 도달 (${usage.posts}/${c.monthlyPostCap})` };
    }

    const queries = buildQueries(c);
    const sinceIds = { ...((ctx.state.sinceIds ?? {}) as Record<string, string>) };
    // first run per query: only the last 15 minutes (reading a week of history is billed)
    const startTime = new Date(ctx.now.getTime() - 15 * 60_000).toISOString();
    const users = new Map<string, XUser>();
    const posts: XPost[] = [];
    let read = 0;
    for (const q of queries) {
      let next: string | undefined;
      let newest: string | undefined;
      do {
        const budget = Math.min(c.maxPostsPerRun - read, c.monthlyPostCap ? c.monthlyPostCap - usage.posts - read : Infinity);
        if (budget <= 0) break;
        const r = await search(ctx.http, c, auth, q, sinceIds[q], sinceIds[q] ? undefined : startTime, next);
        if (r.errors?.length && !r.data) throw new Error(`X: ${r.errors.map((e) => e.message).join("; ")}`);
        for (const u of r.includes?.users ?? []) users.set(u.id, u);
        for (const p of r.data ?? []) posts.push(p);
        read += r.data?.length ?? 0;
        newest ??= r.meta?.newest_id;
        next = r.meta?.next_token;
      } while (next);
      if (newest) sinceIds[q] = newest;
    }
    usage.posts += read;

    const items: IngestItem[] = [];
    const social: SocialPostIn[] = [];
    for (const p of posts) {
      const u = p.author_id ? users.get(p.author_id) : undefined;
      const handle = u?.username ?? "i";
      const url = `https://x.com/${handle}/status/${p.id}`;
      const m = p.public_metrics ?? {};
      const engagement = (m.like_count ?? 0) + 2 * (m.retweet_count ?? 0) + (m.reply_count ?? 0) + (m.quote_count ?? 0);
      if (c.output.includes("items")) {
        items.push({
          externalId: p.id,
          url,
          title: clip(`@${handle}: ${p.text.replace(/\s+/g, " ")}`, 160),
          summary: clip(p.text, 1000),
          lang: p.lang && p.lang !== "und" ? p.lang : undefined,
          publishedAt: parseDate(p.created_at) ?? null,
          weight: Math.min(1, c.weight + Math.log10(1 + engagement) / 8),
          payload: { author: handle, name: u?.name, metrics: m, embed: url },
        });
      }
      if (c.output.includes("posts")) {
        social.push({
          externalId: p.id,
          url,
          author: handle,
          text: p.text,
          lang: p.lang,
          postedAt: parseDate(p.created_at) ?? ctx.now,
          engagement: { likes: m.like_count, comments: m.reply_count, shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0), views: m.impression_count },
        });
      }
    }
    return {
      items,
      posts: social,
      state: { sinceIds, usage },
      usage: { unit: "x_post_read", count: read, costUsd: Math.round(read * price * 1000) / 1000 },
      note: `${read} posts read (${queries.length} queries), month ${usage.posts}${c.monthlyPostCap ? `/${c.monthlyPostCap}` : ""}`,
    };
  },
});
