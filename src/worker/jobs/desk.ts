import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { bodyFetcher } from "@/ingest/fetch-body";
import { candidates, deskDecisions, deskRuns } from "@/db/schema";
import { hasAnthropicKey } from "@/lib/ai/models";
import { loadDeskModel, refreshDeskModel } from "@/server/desk/learn";
import { countPendingCases, LESSON_MIN_CASES, reviewLessons } from "@/server/desk/lessons";
import { activePlaybook, REFLECT_EVERY_DAYS, REFLECT_MIN, REFLECT_MODEL, reflect, savePlaybookVersion } from "@/server/desk/playbook";
import { deskSpendUsd, runDesk } from "@/server/desk/run";
import { loadDeskSettings, loadDeskState, patchDeskState } from "@/server/desk/settings";
import type { CreateCall } from "@/server/generator/claude";
import { draftGeneratorConfig } from "@/server/generator/config";
import { aiMonthSpendUsd, dbLedger } from "@/server/generator/ledger";
import type { Job, JobResult } from "../jobs";

/**
 * The AI desk in the worker (src/server/desk):
 *   desk.triage   judges new feed items and writes the best as drafts in 검토,
 *                 every `cadenceMin` minutes or when the newsroom asks
 *   desk.learn    refreshes what reader response and editor calls say (3 h)
 *   desk.playbook rewrites the editorial guide weekly once there is data,
 *                 or when the newsroom asks
 */

let client: Anthropic | null = null;
function claude(): CreateCall | null {
  if (!hasAnthropicKey()) return null;
  // no one is waiting on a desk call: a couple of retries and a long timeout
  const c = (client ??= new Anthropic({ maxRetries: 2, timeout: 180_000 }));
  return (body) => c.messages.create(body);
}

const after = (iso: string | undefined, than: Date | undefined) => Boolean(iso && (!than || Date.parse(iso) > than.getTime()));

async function lastRunAt(): Promise<Date | undefined> {
  const [r] = await db.select({ at: deskRuns.startedAt }).from(deskRuns).orderBy(desc(deskRuns.startedAt)).limit(1);
  return r?.at;
}

export const deskTriageJob: Job = {
  name: "desk.triage",
  // checks every minute; runs on the newsroom's cadence or when asked
  everySec: 60,
  async due(now) {
    const [settings, state, last] = await Promise.all([loadDeskSettings(db), loadDeskState(db), lastRunAt()]);
    if (after(state.runRequestedAt, last)) return true;
    return settings.enabled && (!last || now.getTime() - last.getTime() >= settings.cadenceMin * 60_000 - 30_000);
  },
  async run(now) {
    const [state, last] = await Promise.all([loadDeskState(db), lastRunAt()]);
    const cfg = draftGeneratorConfig();
    const r = await runDesk({
      db,
      create: claude(),
      ledger: dbLedger(db),
      now,
      trigger: after(state.runRequestedAt, last) ? "manual" : "schedule",
      globalCapUsd: cfg.budgetUsd,
      draftEffort: cfg.effort,
      fetchBody: bodyFetcher(),
    });
    return {
      seen: r.itemsSeen,
      inserted: r.drafted.length,
      note: r.note,
      meta: { runId: r.runId, stories: r.stories, queued: r.queued },
    };
  },
};

export const deskLearnJob: Job = {
  name: "desk.learn",
  everySec: 3 * 3600,
  offsetSec: 20 * 60,
  async run(now) {
    const m = await refreshDeskModel(db, now);
    return {
      seen: m.measured,
      note: `${m.phase} · 측정 기사 ${m.measured}건 · 데스크 초안 결정 ${m.editor.total}건`,
    };
  },
};

export const deskPlaybookJob: Job = {
  name: "desk.playbook",
  // checks every 10 minutes so a request from the newsroom is not kept waiting
  everySec: 600,
  offsetSec: 5 * 60,
  async due(now) {
    const [settings, state, playbook] = await Promise.all([loadDeskSettings(db), loadDeskState(db), activePlaybook(db)]);
    const lastReview = state.reflectedAt ? new Date(state.reflectedAt) : undefined;
    if (after(state.reflectRequestedAt, lastReview)) return true;
    if (!settings.enabled || !settings.playbookAuto || !hasAnthropicKey()) return false;
    const since = lastReview ?? new Date(playbook.createdAt);
    if (now.getTime() - since.getTime() < REFLECT_EVERY_DAYS * 86_400_000) return false;
    // the stored snapshot (desk.learn keeps it fresh) is enough to decide
    const m = await loadDeskModel(db);
    return m.measured >= REFLECT_MIN.measured || m.editor.total >= REFLECT_MIN.editorCalls;
  },
  async run(now) {
    // a review counts as done whatever happens, so a failing one waits for the next week or request
    try {
      return await review(now);
    } finally {
      await patchDeskState(db, { reflectedAt: now.toISOString() });
    }
  },
};

async function review(now: Date): Promise<JobResult> {
  const create = claude();
  if (!create) return { note: "ANTHROPIC_API_KEY가 없어 건너뜀" };
  const [settings, deskSpent, allSpent] = await Promise.all([loadDeskSettings(db), deskSpendUsd(db), aiMonthSpendUsd(db)]);
  if (deskSpent >= settings.monthlyBudgetUsd || allSpent >= draftGeneratorConfig().budgetUsd) return { note: "예산이 차서 지침 검토를 건너뜀" };

  const [model, playbook] = await Promise.all([refreshDeskModel(db, now), activePlaybook(db)]);
  const rejected = await db
    .select({
      title: sql<string>`${candidates.draft}->>'title'`,
      topic: deskDecisions.topic,
      note: candidates.aiNote,
    })
    .from(deskDecisions)
    .innerJoin(candidates, eq(candidates.id, deskDecisions.candidateId))
    .where(and(eq(candidates.status, "rejected"), gte(deskDecisions.draftedAt, new Date(now.getTime() - 30 * 86_400_000))))
    .orderBy(desc(deskDecisions.draftedAt))
    .limit(15);

  const out = await reflect({ create, ledger: dbLedger(db) }, REFLECT_MODEL, {
    playbook,
    model,
    rejected: rejected.map((r) => ({
      title: r.title ?? "",
      topic: r.topic,
      reason: r.note?.startsWith("반려: ") ? r.note.slice(4) : "",
    })),
  });
  const same = out.body.replace(/\s+/g, " ").trim() === playbook.body.replace(/\s+/g, " ").trim();
  if (same)
    return {
      note: `지침 v${playbook.version} 유지 — ${out.changes.join(" / ") || "바꿀 것 없음"}`,
      meta: { costUsd: out.usage.costUsd },
    };
  const version = await savePlaybookVersion(db, {
    body: out.body,
    source: "ai",
    notes: out.changes.join("\n"),
  });
  return {
    inserted: 1,
    note: `지침 v${version}: ${out.changes.join(" / ")}`.slice(0, 500),
    meta: { costUsd: out.usage.costUsd },
  };
}

/**
 * desk.lessons — brings the 편집 노트 up to date from the drafts editors
 * changed: when a few are waiting, at least every few days when any is, or
 * when the newsroom asks. A weekly pass with nothing waiting only retires
 * faded notes (no model call).
 */
const LESSONS_GAP_H = 6;
const LESSONS_STALE_DAYS = 3;
const LESSONS_SWEEP_DAYS = 7;

export const deskLessonsJob: Job = {
  name: "desk.lessons",
  everySec: 3600,
  offsetSec: 40 * 60,
  async due(now) {
    const state = await loadDeskState(db);
    if (after(state.lessonsRequestedAt, state.lessonsAt ? new Date(state.lessonsAt) : undefined)) return true;
    const since = state.lessonsAt ? now.getTime() - Date.parse(state.lessonsAt) : Number.POSITIVE_INFINITY;
    if (since < LESSONS_GAP_H * 3_600_000) return false;
    if (since >= LESSONS_SWEEP_DAYS * 86_400_000) return true;
    const waiting = await countPendingCases(db);
    return waiting >= LESSON_MIN_CASES || (waiting > 0 && since >= LESSONS_STALE_DAYS * 86_400_000);
  },
  async run(now) {
    try {
      const create = claude();
      const waiting = await countPendingCases(db);
      // with edits to read the review needs the model; a sweep of faded notes does not
      if (waiting && !create) return { note: "ANTHROPIC_API_KEY가 없어 건너뜀" };
      if (waiting && (await aiMonthSpendUsd(db)) >= draftGeneratorConfig().budgetUsd) return { note: "이번 달 AI 한도가 차서 편집 노트 정리를 건너뜀" };
      const r = await reviewLessons({ create, ledger: dbLedger(db) }, db, now);
      return {
        seen: r.cases,
        inserted: r.added,
        updated: r.updated,
        note: `편집 노트: 사례 ${r.cases}건 · 새 노트 ${r.added} · 고침 ${r.updated} · 뺌 ${r.retired}${r.notes ? ` — ${r.notes}` : ""}`.slice(0, 500),
        meta: { costUsd: r.usage?.costUsd ?? 0 },
      };
    } finally {
      await patchDeskState(db, { lessonsAt: now.toISOString() });
    }
  },
};
