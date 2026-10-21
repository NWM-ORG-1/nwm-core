"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { candidates, type Beat, type CandidateStatus } from "@/db/schema";
import type { Draft } from "@/lib/content/blocks";
import { requireStaff } from "../auth";
import { NewsroomError } from "../newsroom";
import { fail, ok, type ActionState } from "./result";

/**
 * Read-only peek at a candidate's stored working copy. The editor calls it when
 * an autosave hits a lockVersion conflict: if the stored draft is exactly what
 * this editor last saved (the version moved because of a status change such as
 * schedule / move / reject), it adopts the new lockVersion and retries instead
 * of reporting a false "someone else saved" conflict.
 *
 * No activity log and no refresh(): nothing changes.
 */
export async function peekCandidate(input: { id: string }): Promise<
  ActionState<{
    lockVersion: number;
    status: CandidateStatus;
    draft: Draft;
    beat: Beat;
    storyId: string | null;
    priority: number;
    updatedAt: string;
  }>
> {
  try {
    await requireStaff();
    const p = z.object({ id: z.uuid() }).parse(input);
    const c = await db.query.candidates.findFirst({
      where: eq(candidates.id, p.id),
      columns: { lockVersion: true, status: true, draft: true, beat: true, storyId: true, priority: true, updatedAt: true },
    });
    if (!c) throw new NewsroomError("후보를 찾을 수 없습니다.", "not_found");
    return ok(undefined, { ...c, updatedAt: c.updatedAt.toISOString() });
  } catch (e) {
    return fail(e);
  }
}
