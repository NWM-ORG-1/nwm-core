"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { articles, correctionRequests } from "@/db/schema";
import { requireStaff } from "../auth";
import { NewsroomError } from "../newsroom";
import { reviseArticle } from "./articles";
import { fail, type ActionState } from "./result";

type ReviseInput = Parameters<typeof reviseArticle>[0];

/**
 * reviseArticle() with two guards the newsroom form needs:
 *
 * 1. Lost update — the form sends the revision it was opened on. If another
 *    editor has saved since, nothing is written and the editor is told to load
 *    the latest version first (otherwise their save would silently replace the
 *    other editor's text).
 * 2. Stale request link — a linked 정정 요청 must still be open and belong to
 *    this article. reviseArticle() marks the linked request "accepted" without
 *    checking its status, so a request rejected in the meantime would flip.
 *
 * Validation, the revision write, activity log, cache invalidation and
 * refresh() all stay in reviseArticle().
 */
export async function reviseArticleAt(input: ReviseInput & { baseRevision: number }): Promise<ActionState<{ revision: number }>> {
  try {
    await requireStaff();
    const { baseRevision, ...rest } = input;
    const p = z
      .object({
        id: z.uuid(),
        baseRevision: z.number().int().min(1),
        requestId: z.uuid().nullable().optional(),
        linked: z.boolean(),
      })
      .parse({ id: rest.id, baseRevision, requestId: rest.requestId, linked: Boolean(rest.correction && rest.requestId) });

    const a = await db.query.articles.findFirst({ where: eq(articles.id, p.id), columns: { revision: true } });
    if (!a) throw new NewsroomError("기사를 찾을 수 없습니다.", "not_found");
    if (a.revision !== p.baseRevision) {
      throw new NewsroomError(
        `이 양식을 연 뒤 다른 편집자가 r${a.revision}을 저장했습니다. ‘최신 버전 불러오기’로 바뀐 내용을 확인한 뒤 다시 적용하세요.`,
        "conflict",
      );
    }

    if (p.linked && p.requestId) {
      const r = await db.query.correctionRequests.findFirst({
        where: and(eq(correctionRequests.id, p.requestId), eq(correctionRequests.articleId, p.id)),
        columns: { status: true },
      });
      if (!r) throw new NewsroomError("연결한 정정 요청을 찾을 수 없습니다.", "not_found");
      if (r.status !== "open") throw new NewsroomError("연결한 정정 요청은 이미 처리되었습니다. 연결을 해제하고 다시 저장하세요.", "state");
    }

    // reviseArticle re-checks the base revision inside its write, closing the gap after the read above.
    return await reviseArticle({ ...rest, baseRevision: p.baseRevision, requestId: p.linked ? p.requestId : null });
  } catch (e) {
    return fail(e);
  }
}
