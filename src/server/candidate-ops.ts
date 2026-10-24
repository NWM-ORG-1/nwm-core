import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { candidates, type Beat, type CandidateStatus, type CheckResult } from "@/db/schema";
import type { Draft } from "@/lib/content/blocks";
import { logActivity } from "./activity";
import type { StaffRow } from "./auth";
import { draftHash } from "./checks";
import { computeChecks, NewsroomError, publishCandidate, type PublishResult } from "./newsroom";

/**
 * Candidate operations shared by the newsroom's Server Actions and the
 * Telegram bot. Callers authenticate the editor (`me`) and refresh caches;
 * these change the database and record the activity.
 */

export type Via = "telegram";

/** checks without the legal sign-off (any draft change invalidates it) */
const dropLegal = sql`coalesce((select jsonb_agg(x) from jsonb_array_elements(${candidates.checks}) x where x->>'id' <> 'legal'), '[]'::jsonb)`;

/**
 * Saves a new version of the draft, refused if someone saved since `lockVersion`.
 * A content change voids the legal sign-off and pulls a scheduled piece back to review.
 */
export async function saveDraftAs(
  db: DB,
  p: { id: string; lockVersion: number; draft: Draft; beat?: Beat; storyId?: string | null; priority?: number },
  now = new Date(),
): Promise<{ lockVersion: number; status: CandidateStatus }> {
  const same = sql`(${candidates.draft} = ${JSON.stringify(p.draft)}::jsonb)`;
  const updated = await db
    .update(candidates)
    .set({
      draft: p.draft,
      ...(p.beat ? { beat: p.beat } : {}),
      ...(p.storyId !== undefined ? { storyId: p.storyId } : {}),
      ...(p.priority !== undefined ? { priority: p.priority } : {}),
      updatedAt: now,
      lockVersion: sql`${candidates.lockVersion} + 1`,
      status: sql`(case when ${candidates.status} = 'new' then 'drafting'
                        when ${candidates.status} = 'scheduled' and not ${same} then 'review'
                        else ${candidates.status}::text end)::candidate_status`,
      scheduledAt: sql`case when ${candidates.status} = 'scheduled' and not ${same} then null else ${candidates.scheduledAt} end`,
      scheduledById: sql`case when ${candidates.status} = 'scheduled' and not ${same} then null else ${candidates.scheduledById} end`,
      checks: sql`case when ${same} then ${candidates.checks} else ${dropLegal} end`,
    })
    .where(and(eq(candidates.id, p.id), eq(candidates.lockVersion, p.lockVersion), ne(candidates.status, "published")))
    .returning({ lockVersion: candidates.lockVersion, status: candidates.status });

  if (!updated.length) {
    const exists = await db.query.candidates.findFirst({ where: eq(candidates.id, p.id), columns: { id: true, status: true } });
    if (!exists) throw new NewsroomError("후보를 찾을 수 없습니다.", "not_found");
    if (exists.status === "published") throw new NewsroomError("이미 발행된 후보입니다.", "state");
    throw new NewsroomError("다른 편집자가 먼저 저장했습니다. 새로고침 후 다시 시도하세요.", "conflict");
  }
  return updated[0];
}

/**
 * The legal check is a human confirmation, bound to the exact draft it was
 * given for. With `lockVersion`, it is refused if the draft changed since the
 * editor read it.
 */
export async function confirmLegalAs(db: DB, me: StaffRow, id: string, confirmed: boolean, via?: Via, lockVersion?: number): Promise<CheckResult[]> {
  const c = await db.query.candidates.findFirst({ where: eq(candidates.id, id) });
  if (!c) throw new NewsroomError("후보를 찾을 수 없습니다.", "not_found");
  if (lockVersion != null && c.lockVersion !== lockVersion) {
    throw new NewsroomError("초안이 그사이 바뀌었습니다. 바뀐 내용을 확인한 뒤 다시 발행하세요.", "conflict");
  }
  const legal: CheckResult = {
    id: "legal",
    ok: confirmed,
    blocking: true,
    message: confirmed ? `${me.name} 확인 (명예훼손·저작권·개인정보)${via === "telegram" ? " · 텔레그램" : ""}` : "편집자가 직접 확인해야 합니다",
    ...(confirmed ? { draftHash: draftHash(c.draft) } : {}),
  };
  const prev = c.checks.filter((x) => x.id !== "legal");
  await db.update(candidates).set({ checks: [...prev, legal] }).where(eq(candidates.id, c.id));
  const checks = await computeChecks(db, c.id, me.name);
  await db.update(candidates).set({ checks }).where(eq(candidates.id, c.id));
  await logActivity(db, {
    actorId: me.id,
    kind: "check",
    entityType: "candidate",
    entityId: c.id,
    summary: confirmed ? "법률 검토 확인" : "법률 검토 해제",
    ...(via ? { meta: { via } } : {}),
  });
  return checks;
}

/** Publishes the version the editor reviewed (`lockVersion`); any newer change is refused. */
export async function publishAs(db: DB, me: StaffRow, p: { id: string; overrideReason?: string; lockVersion?: number; via?: Via }): Promise<PublishResult> {
  const res = await publishCandidate(db, {
    candidateId: p.id,
    editorId: me.id,
    actorId: me.id,
    overrideReason: p.overrideReason,
    expectedLockVersion: p.lockVersion,
    via: p.via,
  });
  if (!res) throw new NewsroomError("발행할 수 없는 상태입니다.", "state");
  return res;
}

export async function rejectAs(db: DB, me: StaffRow, p: { id: string; reason: string; via?: Via }): Promise<void> {
  const rejected = await db
    .update(candidates)
    .set({ status: "rejected", aiNote: `반려: ${p.reason}`, scheduledAt: null, scheduledById: null, updatedAt: new Date(), lockVersion: sql`${candidates.lockVersion} + 1` })
    .where(and(eq(candidates.id, p.id), ne(candidates.status, "published")))
    .returning({ id: candidates.id });
  if (!rejected.length) {
    const exists = await db.query.candidates.findFirst({ where: eq(candidates.id, p.id), columns: { id: true } });
    throw new NewsroomError(exists ? "발행된 후보는 반려할 수 없습니다." : "후보를 찾을 수 없습니다.", exists ? "state" : "not_found");
  }
  await logActivity(db, {
    actorId: me.id,
    kind: "reject",
    entityType: "candidate",
    entityId: p.id,
    summary: `반려: ${p.reason}`,
    ...(p.via ? { meta: { via: p.via } } : {}),
  });
}
