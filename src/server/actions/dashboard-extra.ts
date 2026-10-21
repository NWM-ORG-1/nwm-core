"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { stories } from "@/db/schema";
import { T } from "@/lib/cache-tags";
import { logActivity } from "@/server/activity";
import { requireStaff } from "@/server/auth";
import { invalidateFromAction } from "@/server/invalidate";
import { NewsroomError } from "@/server/newsroom";
import { fail, ok, type ActionState } from "./result";

const STORY_STATUS_KO = { developing: "진행중", settled: "일단락" } as const;

/** Edit a story's title, summary and status. Public story pages and lists are invalidated. */
export async function updateStory(input: {
  id: string;
  title: string;
  summary: string;
  status: string;
}): Promise<ActionState<{ id: string; slug: string }>> {
  try {
    const me = await requireStaff();
    const p = z
      .object({
        id: z.uuid(),
        title: z.string().trim().min(2, "제목은 2자 이상이어야 합니다").max(80, "제목은 80자 이내로 적어주세요"),
        summary: z.string().trim().max(300, "요약은 300자 이내로 적어주세요"),
        status: z.enum(["developing", "settled"]),
      })
      .parse(input);

    const prev = await db.query.stories.findFirst({ where: eq(stories.id, p.id), columns: { slug: true, title: true, summary: true, status: true } });
    if (!prev) throw new NewsroomError("스토리를 찾을 수 없습니다.", "not_found");
    if (prev.title === p.title && prev.summary === p.summary && prev.status === p.status) {
      return ok("변경 사항이 없습니다.", { id: p.id, slug: prev.slug });
    }

    const [s] = await db
      .update(stories)
      .set({ title: p.title, summary: p.summary, status: p.status })
      .where(eq(stories.id, p.id))
      .returning({ id: stories.id, slug: stories.slug });

    const changes: string[] = [];
    if (prev.title !== p.title) changes.push("제목");
    if (prev.summary !== p.summary) changes.push("요약");
    if (prev.status !== p.status) changes.push(`상태 ${STORY_STATUS_KO[prev.status]} → ${STORY_STATUS_KO[p.status]}`);
    await logActivity(db, {
      actorId: me.id,
      kind: "story",
      entityType: "story",
      entityId: s.id,
      summary: `스토리 수정: ${p.title}${changes.length ? ` (${changes.join(", ")})` : ""}`,
    });

    // Editor pages print story titles on their cards.
    invalidateFromAction([T.feed, T.story(s.id), T.editors]);
    refresh();
    return ok("스토리를 저장했습니다.", s);
  } catch (e) {
    return fail(e);
  }
}
