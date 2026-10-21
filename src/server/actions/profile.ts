"use server";

import { and, eq, ne, or } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { articles, staff } from "@/db/schema";
import { T } from "@/lib/cache-tags";
import { logActivity } from "../activity";
import { requireStaff } from "../auth";
import { invalidateFromAction } from "../invalidate";
import { fail, ok, type ActionState } from "./result";

/**
 * The signed-in editor's public profile. Their name is printed on every article
 * they sign off ("AI 초안 · {이름} 검수"), so it must be a real, public name.
 */
export async function updateMyProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z
      .object({
        name: z.string().trim().min(2, "이름은 2자 이상").max(40),
        title: z.string().trim().min(2).max(60),
        bio: z.string().trim().max(400).default(""),
        slug: z
          .string()
          .trim()
          .regex(/^[a-z0-9][a-z0-9-]{2,40}$/, "주소는 영문 소문자·숫자·하이픈 3자 이상"),
      })
      .parse(Object.fromEntries(form.entries()));
    const taken = await db.query.staff.findFirst({ where: and(eq(staff.slug, p.slug), ne(staff.id, me.id)) });
    if (taken) return { ok: false, error: "이미 사용 중인 주소입니다.", code: "invalid", at: Date.now() };
    await db.update(staff).set(p).where(eq(staff.id, me.id));
    await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "profile", summary: `프로필 수정: ${p.name}` });

    // Articles print the editor's name: refresh the pages they signed.
    const signed = await db
      .select({ slug: articles.slug })
      .from(articles)
      .where(or(eq(articles.editorId, me.id), eq(articles.authorId, me.id)));
    invalidateFromAction([T.editors, T.feed, ...signed.map((a) => T.article(a.slug))]);
    refresh();
    return ok("프로필을 저장했습니다.");
  } catch (e) {
    return fail(e);
  }
}
