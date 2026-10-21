"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { feedSources, sentimentSnapshots, siteSettings } from "@/db/schema";
import { collectorEnv } from "@/data/admin-ingest";
import { executeAdapter } from "@/ingest/execute";
import { HostLimiter } from "@/ingest/http";
import { ConfigError } from "@/ingest/types";
import { T } from "@/lib/cache-tags";
import { logActivity } from "../activity";
import { requireStaff } from "../auth";
import { invalidateFromAction } from "../invalidate";
import { fail, ok, type ActionState } from "./result";

/** The worker picks the source up on its next tick (≈5 s). */
export async function runSourceNow(input: { id: string }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const { id } = z.object({ id: z.uuid() }).parse(input);
    const [row] = await db
      .update(feedSources)
      .set({ nextRunAt: new Date() })
      .where(and(eq(feedSources.id, id), eq(feedSources.isSample, false)))
      .returning({ name: feedSources.name, status: feedSources.status });
    if (!row) return { ok: false, error: "샘플 소스는 수집하지 않습니다.", at: Date.now() };
    await logActivity(db, { actorId: me.id, kind: "source", entityType: "source", entityId: id, summary: `지금 수집 요청: ${row.name}` });
    refresh();
    return ok(row.status === "paused" ? "요청했지만 일시정지 상태라 수집하지 않습니다. 먼저 켜세요." : "곧 수집합니다 (워커 기준 수 초 내).");
  } catch (e) {
    return fail(e);
  }
}

export interface DryRunPreview {
  note?: string;
  durationMs: number;
  requests: number;
  httpStatus?: number;
  counts: { items: number; posts: number; quotes: number; metrics: number };
  items: Array<{ title: string; url: string | null; publishedAt: string | null; summary: string }>;
  posts: Array<{ text: string; postedAt: string; engagement: Record<string, number | undefined> }>;
  quotes: Array<{ symbol: string; price: number; changePct: number; currency: string; asOf: string }>;
  metrics: Array<{ metric: string; symbol: string; at: string; value: number }>;
}

/**
 * Runs the adapter once without saving anything — with the config being edited
 * when given, so selectors can be tried before they are saved.
 */
export async function testSource(input: { id: string; configJson?: string }): Promise<ActionState<DryRunPreview>> {
  try {
    await requireStaff();
    const p = z.object({ id: z.uuid(), configJson: z.string().max(20_000).optional() }).parse(input);
    const s = await db.query.feedSources.findFirst({ where: eq(feedSources.id, p.id) });
    if (!s) return { ok: false, error: "소스를 찾을 수 없습니다.", at: Date.now() };
    let config = s.config;
    if (p.configJson?.trim()) {
      try {
        config = JSON.parse(p.configJson) as Record<string, unknown>;
      } catch {
        return { ok: false, error: "어댑터 설정이 올바른 JSON이 아닙니다.", at: Date.now() };
      }
    }
    try {
      const ex = await executeAdapter(
        { ...s, config, url: s.url, state: s.adapter === "exchange.markets" ? s.state : {} },
        { limiter: new HostLimiter(), signal: AbortSignal.timeout(60_000) },
      );
      const r = ex.result;
      const iso = (d?: Date | null) => (d ? d.toISOString() : null);
      return ok(r.note ?? "실행했습니다.", {
        note: r.note,
        durationMs: ex.durationMs,
        requests: ex.requests,
        httpStatus: ex.httpStatus,
        counts: { items: r.items?.length ?? 0, posts: r.posts?.length ?? 0, quotes: r.quotes?.length ?? 0, metrics: r.metrics?.length ?? 0 },
        items: (r.items ?? []).slice(0, 8).map((i) => ({ title: i.title, url: i.url ?? null, publishedAt: iso(i.publishedAt), summary: (i.summary ?? "").slice(0, 200) })),
        posts: (r.posts ?? []).slice(0, 8).map((x) => ({ text: x.text.slice(0, 160), postedAt: x.postedAt.toISOString(), engagement: x.engagement ?? {} })),
        quotes: (r.quotes ?? []).slice(0, 8).map((q) => ({ symbol: q.symbol, price: q.price, changePct: q.changePct, currency: q.currency, asOf: q.asOf.toISOString() })),
        metrics: (r.metrics ?? []).slice(-6).map((m) => ({ metric: m.metric, symbol: m.symbol, at: m.at.toISOString(), value: m.value })),
      });
    } catch (err) {
      let msg = err instanceof ConfigError ? err.message : `수집 실패: ${(err as Error).message}`;
      if (err instanceof ConfigError && msg.startsWith("키 필요")) {
        // the dry run runs here, in the web service — the worker may hold keys this process lacks
        const { env } = await collectorEnv();
        const onWorker = msg.slice(msg.indexOf(":") + 1).split(",").map((n) => n.trim()).filter((n) => env[n]);
        if (onWorker.length) msg += ` — 수집 워커에는 있는 키입니다. 미리 실행은 웹 서비스에서 돌기 때문에 웹 서비스 변수에도 같은 키(${onWorker.join(", ")})가 있어야 합니다.`;
      }
      return { ok: false, error: msg, code: err instanceof ConfigError ? "config" : "fetch", at: Date.now() };
    }
  } catch (e) {
    return fail(e);
  }
}

export async function setIngestPaused(input: { paused: boolean }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const { paused } = z.object({ paused: z.boolean() }).parse(input);
    await db
      .insert(siteSettings)
      .values({ key: "ingest", value: { paused } })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: { paused }, updatedAt: new Date() } });
    await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "ingest", summary: paused ? "전체 수집 일시정지" : "전체 수집 재개" });
    refresh();
    return ok(paused ? "모든 수집을 멈췄습니다 (30초 안에 반영)." : "수집을 다시 시작합니다.");
  } catch (e) {
    return fail(e);
  }
}

/**
 * Leaves the shadow period: from now on new readings are public, and the last
 * 48 h of shadow readings are published with them so the chart has history.
 */
export async function setSentimentPublic(input: { public: boolean }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ public: z.boolean() }).parse(input);
    await db.transaction(async (tx) => {
      const value = { public: p.public, ...(p.public ? { publicSince: new Date().toISOString() } : {}) };
      await tx
        .insert(siteSettings)
        .values({ key: "sentiment", value })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } });
      await tx
        .update(sentimentSnapshots)
        .set({ shadow: !p.public })
        .where(and(eq(sentimentSnapshots.isSample, false), gt(sentimentSnapshots.at, sql`now() - interval '48 hours'`)));
      await logActivity(tx, {
        actorId: me.id,
        kind: "settings",
        entityType: "settings",
        entityId: "sentiment",
        summary: p.public ? "센티먼트 인덱스 공개 시작 (베타)" : "센티먼트 인덱스 비공개 전환 (그림자 운영)",
      });
    });
    invalidateFromAction([T.sentiment]);
    refresh();
    return ok(p.public ? "센티먼트 인덱스를 공개했습니다." : "센티먼트 인덱스를 다시 그림자 운영으로 돌렸습니다.");
  } catch (e) {
    return fail(e);
  }
}
