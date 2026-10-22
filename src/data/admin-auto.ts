import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db/client";
import { articles, candidates, feedSources, type CandidateStatus } from "@/db/schema";
import { requireStaff } from "@/server/auth";
import { liveQuotes, publicSentiment } from "@/server/auto/inputs";
import { AUTO_TEMPLATE_IDS, loadAutoSettings, type AutoTemplateId, type AutoTemplateSetting } from "@/server/auto/settings";
import { DATA_TEMPLATES, type TemplateTrigger } from "@/server/generator/data-templates";
import type { Beat } from "@/db/schema";

/** Read model for 자동 기사: settings, what each type made lately, and what would stop it. */

export interface AutoWarning {
  text: string;
  href?: string;
}

export interface AutoTemplateRow {
  id: AutoTemplateId;
  label: string;
  description: string;
  beat: Beat;
  trigger: TemplateTrigger;
  setting: AutoTemplateSetting;
  made7d: number;
  published7d: number;
  recent: Array<{ id: string; title: string; status: CandidateStatus; createdAt: string; articleSlug: string | null }>;
  warnings: AutoWarning[];
}

export async function getAutoAdmin(): Promise<{ rows: AutoTemplateRow[]; schedulerOn: boolean }> {
  await connection();
  await requireStaff();
  const now = new Date();
  const [settings, quotes, sentiment, exchangeSources, recent, counts] = await Promise.all([
    loadAutoSettings(db),
    liveQuotes(db, now, 15),
    publicSentiment(db),
    db
      .select({ id: feedSources.id, name: feedSources.name, status: feedSources.status, reviewedAt: feedSources.licReviewedAt })
      .from(feedSources)
      .where(and(eq(feedSources.adapter, "exchange.markets"), eq(feedSources.isSample, false))),
    db
      .select({
        id: candidates.id,
        gid: sql<string>`${candidates.generator}->>'id'`,
        title: sql<string>`${candidates.draft}->>'title'`,
        status: candidates.status,
        createdAt: candidates.createdAt,
        articleSlug: articles.slug,
      })
      .from(candidates)
      .leftJoin(articles, eq(articles.id, candidates.articleId))
      .where(and(eq(candidates.isSample, false), sql`${candidates.generator}->>'id' like 'template:%'`))
      .orderBy(desc(candidates.createdAt))
      .limit(120),
    db.execute<{ gid: string; made: number; published: number }>(sql`
      select generator->>'id' as gid, count(*)::int as made, count(*) filter (where status = 'published')::int as published
      from candidates where is_sample = false and generator->>'id' like 'template:%' and created_at > now() - interval '7 days' group by 1`),
  ]);

  const schedulerOn = process.env.SCHEDULER !== "off";
  const btcFresh = quotes.some((q) => q.symbol === "BTC");
  const activeExchange = exchangeSources.filter((s) => s.status !== "paused");
  const unreviewed = activeExchange.filter((s) => !s.reviewedAt);

  const rows = AUTO_TEMPLATE_IDS.map((id): AutoTemplateRow => {
    const meta = DATA_TEMPLATES[id];
    const setting = settings[id];
    const c = counts.find((x) => x.gid === `template:${id}`);
    const warnings: AutoWarning[] = [];
    if (setting.mode !== "off") {
      if ((id === "crypto_daily" || id === "crypto_move") && !btcFresh) {
        warnings.push({ text: "최근 15분 안에 들어온 비트코인 시세가 없습니다. 바이낸스 소스와 워커를 확인하세요.", href: "/admin/ingest" });
      }
      if (id === "sentiment_daily" && !sentiment) warnings.push({ text: "센티먼트 인덱스를 공개한 뒤부터 만들어집니다.", href: "/admin/sentiment" });
      if (id.startsWith("exchange_")) {
        if (!activeExchange.length) warnings.push({ text: "업비트·빗썸 마켓 목록 소스가 꺼져 있습니다.", href: "/admin/sources" });
        if (setting.mode === "auto") {
          for (const s of unreviewed) warnings.push({ text: `자동 발행하려면 ‘${s.name}’ 소스의 라이선스를 검토하세요. 검토 전에는 검토 단계로 돌아갑니다.`, href: `/admin/sources/${s.id}` });
        }
      }
      if (setting.mode === "auto" && !schedulerOn) warnings.push({ text: "SCHEDULER=off — 웹 서비스의 예약 발행이 꺼져 있어 자동 발행이 멈춥니다." });
    }
    return {
      id,
      label: meta.label,
      description: meta.description,
      beat: meta.beat,
      trigger: meta.trigger,
      setting,
      made7d: c?.made ?? 0,
      published7d: c?.published ?? 0,
      recent: recent
        .filter((r) => r.gid === `template:${id}`)
        .slice(0, 3)
        .map((r) => ({ id: r.id, title: r.title, status: r.status, createdAt: r.createdAt.toISOString(), articleSlug: r.articleSlug })),
      warnings,
    };
  });
  return { rows, schedulerOn };
}
