import "server-only";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { feedSources, type Beat } from "@/db/schema";
import { parseChannelInfo, parseChannelPage } from "@/ingest/adapters/social/telegram";
import { validateConfig } from "@/ingest/execute";
import { HostLimiter, Http } from "@/ingest/http";
import { getAdapter } from "@/ingest/registry";
import { socialSlug, type SocialKind } from "@/ingest/social-handles";
import { clip } from "@/ingest/text";
import { mapLimit } from "@/lib/ai/limit";
import { logActivity } from "./activity";
import type { StaffRow } from "./auth";
import { NewsroomError } from "./newsroom";

/**
 * 뉴스룸 → 소스 → 텔레그램·X 연결: check what the editor pasted, then make one
 * source per channel or account and let the worker collect it at once.
 *  - Telegram: the channel's public page (t.me/s) — title, subscribers, last posts.
 *  - X: the public embed endpoint says whether the account exists; posts are read
 *    later by the worker through the paid API, so nothing is billed here.
 */

const ADAPTER: Record<SocialKind, string> = { telegram: "telegram.channel", x: "x.accounts" };
export const SOCIAL_BATCH: Record<SocialKind, number> = { telegram: 20, x: 50 };
/** X: a cap per account per month (each post read costs $0.005) */
export const X_MONTHLY_CAP = 3000;
const POLL_SEC: Record<SocialKind, number> = { telegram: 120, x: 600 };

export interface SocialPreview {
  /** the name to save — Telegram's own spelling when the page gives it */
  name: string;
  status: "ok" | "missing" | "unchecked";
  title?: string;
  subscribers?: number;
  description?: string;
  recent?: Array<{ text: string; at: string | null; link: string }>;
  /** a source already following exactly this channel or account */
  existing?: { id: string; name: string; status: string };
  /** X: a multi-account source that also lists it */
  alsoIn?: string;
  error?: string;
}

interface Followed {
  id: string;
  name: string;
  slug: string;
  status: string;
  config: Record<string, unknown>;
}

const norm = (s: string) => s.replace(/^@/, "").toLowerCase();

/** Sources already on these channels/accounts: the exact one (same name, alone), and multi-account X sources listing it. */
async function followed(db: Pick<DB, "select">, kind: SocialKind) {
  const rows: Followed[] = await db
    .select({ id: feedSources.id, name: feedSources.name, slug: feedSources.slug, status: feedSources.status, config: feedSources.config })
    .from(feedSources)
    .where(eq(feedSources.adapter, ADAPTER[kind]));
  return (name: string): { exact?: Followed; alsoIn?: Followed } => {
    const key = norm(name);
    if (kind === "telegram") return { exact: rows.find((r) => typeof r.config.channel === "string" && norm(r.config.channel) === key) };
    const lists = rows.map((r) => ({ r, accounts: Array.isArray(r.config.accounts) ? (r.config.accounts as unknown[]).filter((a): a is string => typeof a === "string").map(norm) : [] }));
    const exact = lists.find((l) => l.accounts.length === 1 && l.accounts[0] === key)?.r;
    return { exact, alsoIn: exact ? undefined : lists.find((l) => l.accounts.includes(key))?.r };
  };
}

export interface PreviewDeps {
  fetchImpl?: typeof fetch;
  /** tests only */
  allowPrivate?: boolean;
  signal?: AbortSignal;
}

/** One quick look per name; a burst of up to 20/50 requests a human started, so lighter spacing than the collector's. */
export async function previewSocial(db: Pick<DB, "select">, kind: SocialKind, names: string[], deps: PreviewDeps = {}): Promise<SocialPreview[]> {
  if (names.length > SOCIAL_BATCH[kind]) throw new NewsroomError(`한 번에 ${SOCIAL_BATCH[kind]}개까지 확인합니다.`, "invalid");
  const find = await followed(db, kind);
  const http = new Http({
    limiter: new HostLimiter(() => (kind === "telegram" ? 400 : 250)),
    signal: deps.signal ?? AbortSignal.timeout(50_000),
    fetchImpl: deps.fetchImpl,
    allowPrivate: deps.allowPrivate,
  });
  return mapLimit(names, 4, async (name) => {
    const { exact, alsoIn } = find(name);
    const base: SocialPreview = {
      name,
      status: "unchecked",
      ...(exact ? { existing: { id: exact.id, name: exact.name, status: exact.status } } : {}),
      ...(alsoIn ? { alsoIn: alsoIn.name } : {}),
    };
    // already collecting: nothing to look up
    if (exact && exact.status !== "paused") return base;
    try {
      return { ...base, ...(kind === "telegram" ? await lookTelegram(http, name) : await lookX(http, name)) };
    } catch (e) {
      return { ...base, status: "unchecked", error: `확인하지 못했습니다 (${e instanceof Error ? e.message.slice(0, 80) : "오류"}) — 추가는 할 수 있습니다` };
    }
  });
}

async function lookTelegram(http: Http, name: string): Promise<Partial<SocialPreview>> {
  const html = await http.text(`https://t.me/s/${name}`, { timeoutMs: 15_000 });
  const page = parseChannelPage(html, name);
  if (!page.messages.length) return { status: "missing", error: "공개 채널이 아니거나 없는 이름입니다 — 개인 계정·봇·비공개 채널은 수집할 수 없습니다" };
  const info = parseChannelInfo(html);
  const canonical = info.username && norm(info.username) === norm(name) ? info.username : name;
  const recent = page.messages
    .filter((m) => m.text)
    .slice(-3)
    .reverse()
    .map((m) => ({ text: clip(m.text.replace(/\s+/g, " "), 140), at: m.date?.toISOString() ?? null, link: `https://t.me/${canonical}/${m.id}` }));
  return { name: canonical, status: "ok", title: info.title, subscribers: info.subscribers, description: info.description, recent };
}

async function lookX(http: Http, name: string): Promise<Partial<SocialPreview>> {
  const url = `https://publish.x.com/oembed?url=${encodeURIComponent(`https://x.com/${name}`)}&omit_script=1&dnt=true`;
  const res = await http.request(url, { okStatuses: [404], timeoutMs: 10_000, headers: { accept: "application/json" } });
  if (res.status === 404) return { status: "missing", error: "없는 계정이거나 비공개·정지된 계정입니다" };
  return { status: "ok" };
}

/* ───────────────────────── add ───────────────────────── */

export interface AddSocialInput {
  kind: SocialKind;
  entries: Array<{ name: string; title?: string }>;
  beats: Beat[];
  lang: "ko" | "en" | "ja" | "zh";
  trustTier: number;
  signalOnly: boolean;
  output: Array<"items" | "posts">;
  /** Telegram: the operator agreed to collection and AI use for this channel */
  llmConsent: boolean;
}

export interface AddSocialResult {
  added: Array<{ id: string; name: string }>;
  resumed: Array<{ id: string; name: string }>;
  skipped: Array<{ name: string; reason: string; id?: string }>;
}

function configFor(kind: SocialKind, name: string, p: AddSocialInput, prev: Record<string, unknown> = {}): Record<string, unknown> {
  const config =
    kind === "telegram"
      ? { maxPages: 2, weight: 0.45, ...prev, channel: name, output: p.output, llmConsent: p.llmConsent }
      : { includeReplies: false, includeReposts: false, extra: "", maxPostsPerRun: 100, monthlyPostCap: X_MONTHLY_CAP, provider: { kind: "official" }, weight: 0.5, ...prev, accounts: [name], output: p.output };
  const v = validateConfig(ADAPTER[kind], config);
  if (!v.ok) throw new NewsroomError(`${name}: 설정을 만들지 못했습니다 — ${v.message}`, "invalid");
  return config;
}

/**
 * New sources start at once (next_run_at null = due). A paused source on the same
 * channel or account is switched back on with the options chosen now; one that is
 * already collecting is left alone.
 */
export async function addSocialSourcesAs(db: DB, me: StaffRow, p: AddSocialInput): Promise<AddSocialResult> {
  if (!p.entries.length) throw new NewsroomError("추가할 채널·계정이 없습니다.", "invalid");
  if (p.entries.length > SOCIAL_BATCH[p.kind]) throw new NewsroomError(`한 번에 ${SOCIAL_BATCH[p.kind]}개까지 추가합니다.`, "invalid");
  const adapter = getAdapter(ADAPTER[p.kind])!;
  const label = p.kind === "telegram" ? "텔레그램 채널" : "X 계정";
  const today = new Date().toISOString().slice(0, 10);
  const out: AddSocialResult = { added: [], resumed: [], skipped: [] };

  await db.transaction(async (tx) => {
    const find = await followed(tx, p.kind);
    const taken = new Set((await tx.select({ slug: feedSources.slug }).from(feedSources)).map((r) => r.slug));
    const shared = {
      beats: p.beats,
      lang: p.lang,
      trustTier: p.trustTier,
      signalOnly: p.signalOnly,
      status: "active" as const,
      nextRunAt: null,
      failCount: 0,
      lastError: null,
    };
    for (const e of p.entries) {
      const { exact } = find(e.name);
      if (exact && exact.status !== "paused") {
        out.skipped.push({ name: exact.name, reason: "이미 수집 중입니다", id: exact.id });
        continue;
      }
      if (exact) {
        await tx
          .update(feedSources)
          .set({ ...shared, config: configFor(p.kind, e.name, p, exact.config) })
          .where(eq(feedSources.id, exact.id));
        await logActivity(tx, { actorId: me.id, kind: "source", entityType: "source", entityId: exact.id, summary: `${label} 다시 켬: ${exact.name}` });
        out.resumed.push({ id: exact.id, name: exact.name });
        continue;
      }
      let slug = socialSlug(p.kind, e.name);
      for (let n = 2; taken.has(slug); n++) slug = `${socialSlug(p.kind, e.name)}-${n}`;
      taken.add(slug);
      const name = p.kind === "telegram" ? clip(e.title?.trim() || `@${e.name}`, 80) : `X @${e.name}`;
      const [row] = await tx
        .insert(feedSources)
        .values({
          ...shared,
          slug,
          name,
          kind: adapter.kind,
          url: p.kind === "telegram" ? `https://t.me/${e.name}` : `https://x.com/${e.name}`,
          adapter: adapter.key,
          config: configFor(p.kind, e.name, p),
          auth: { envVars: (adapter.envVars ?? []).map((v) => v.name) },
          pollIntervalSec: POLL_SEC[p.kind],
          origin: "manual",
          notes: `${today} 텔레그램·X 연결에서 추가 (${me.name})${p.kind === "telegram" && p.llmConsent ? " · 운영자 동의(수집·AI 활용) 받음으로 기록" : ""}`,
          ...(p.kind === "telegram"
            ? {
                licCommercialOk: null,
                licRedistributionOk: false,
                licVerbatimOk: false,
                licAttribution: `출처: 텔레그램 ${clip(e.title?.trim() || `@${e.name}`, 120)}`,
                licRetentionDays: 30,
                licTermsUrl: "https://telegram.org/tos/content-licensing",
              }
            : {
                licCommercialOk: true,
                licRedistributionOk: false,
                licVerbatimOk: false,
                licAttribution: "X 게시물은 공식 임베드로만 노출",
                licRetentionDays: 30,
                licTermsUrl: "https://developer.x.com/en/developer-terms/agreement-and-policy",
              }),
        })
        .returning({ id: feedSources.id });
      await logActivity(tx, { actorId: me.id, kind: "source", entityType: "source", entityId: row.id, summary: `${label} 연결: ${name}` });
      out.added.push({ id: row.id, name });
    }
  });
  return out;
}
