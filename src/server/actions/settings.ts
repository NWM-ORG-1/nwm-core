"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { siteSettings } from "@/db/schema";
import { T } from "@/lib/cache-tags";
import { LEGAL_FIELDS } from "@/lib/site";
import { logActivity } from "../activity";
import { requireStaff } from "../auth";
import { invalidateFromAction } from "../invalidate";
import { fail, ok, type ActionState } from "./result";

export async function saveLegal(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const value: Record<string, string> = {};
    for (const f of LEGAL_FIELDS) {
      value[f.key] = z.string().trim().max(200).parse(form.get(f.key) ?? "");
    }
    await db
      .insert(siteSettings)
      .values({ key: "legal", value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } });
    await logActivity(db, { actorId: me.id, kind: "settings", entityType: "settings", entityId: "legal", summary: "법정 표기 수정" });
    invalidateFromAction([T.site]);
    refresh();
    return ok("저장했습니다. 공개 페이지에 바로 반영됩니다.");
  } catch (e) {
    return fail(e);
  }
}
