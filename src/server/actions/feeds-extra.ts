"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { experiments, feedSources } from "@/db/schema";
import { logActivity } from "../activity";
import { requireStaff } from "../auth";
import { fail, type ActionState } from "./result";
import { saveExperiment, saveSource } from "./sources";

/**
 * Thin guards around saveSource / saveExperiment (src/server/actions/sources.ts)
 * for the source and hypothesis editors:
 *
 * - a taken slug / code comes back as a field error in Korean (the unique index
 *   would otherwise surface as the generic server error), and
 * - the licence-review stamp is an audit record: re-saving a reviewed source
 *   whose terms did not change keeps the original reviewer and time unless the
 *   editor explicitly says they reviewed it again (`licRereview`).
 */

/** Same "path: message" shape `fail()` produces for zod issues, so forms map it to the field. */
function fieldError(path: string, message: string): ActionState<never> {
  return { ok: false, error: `${path}: ${message}`, code: "invalid", at: Date.now() };
}

const optId = z.uuid().optional().or(z.literal("").transform(() => undefined));
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : undefined);

const tri = z
  .enum(["yes", "no", "unknown"])
  .catch("unknown")
  .transform((v) => (v === "yes" ? true : v === "no" ? false : null));
const optText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

/** The licence terms a review attests to. */
const termsForm = z.object({
  signalOnly: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  licCommercialOk: tri,
  licRedistributionOk: tri,
  licVerbatimOk: tri,
  licAttribution: optText,
  licTermsUrl: optText,
  licRetentionDays: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null)),
});

type Terms = z.infer<typeof termsForm>;

function sameTerms(a: Terms, b: Terms) {
  const norm = (v: unknown) => (v === "" || v === undefined ? null : v);
  return (Object.keys(termsForm.shape) as Array<keyof Terms>).every((k) => norm(a[k]) === norm(b[k]));
}

export async function saveSourceChecked(prev: ActionState<{ id: string }>, form: FormData): Promise<ActionState<{ id: string }>> {
  try {
    const me = await requireStaff();
    const head = z
      .object({ id: optId, slug: z.string().trim(), name: z.string().trim(), licReviewed: z.boolean(), licRereview: z.boolean() })
      .safeParse({
        id: str(form.get("id")) ?? "",
        slug: str(form.get("slug")) ?? "",
        name: str(form.get("name")) ?? "",
        licReviewed: form.get("licReviewed") === "on",
        licRereview: form.get("licRereview") === "on",
      });
    // Malformed input: let saveSource report it field by field.
    if (!head.success) return saveSource(prev, form);
    const p = head.data;

    if (p.slug) {
      const clash = await db.query.feedSources.findFirst({
        where: and(eq(feedSources.slug, p.slug), p.id ? ne(feedSources.id, p.id) : undefined),
        columns: { name: true },
      });
      if (clash) return fieldError("slug", `이미 ‘${clash.name}’ 소스가 쓰고 있는 슬러그입니다`);
    }

    const cur = p.id
      ? await db.query.feedSources.findFirst({
          where: eq(feedSources.id, p.id),
          columns: {
            signalOnly: true,
            licCommercialOk: true,
            licRedistributionOk: true,
            licVerbatimOk: true,
            licAttribution: true,
            licTermsUrl: true,
            licRetentionDays: true,
            licReviewedAt: true,
            licReviewedBy: true,
          },
        })
      : undefined;

    let keep: { at: Date; by: string | null } | null = null;
    if (cur?.licReviewedAt && p.licReviewed && !p.licRereview) {
      const next = termsForm.safeParse(Object.fromEntries(form.entries()));
      const { licReviewedAt, licReviewedBy, ...stored } = cur;
      if (next.success && sameTerms(stored, next.data)) keep = { at: licReviewedAt, by: licReviewedBy };
    }

    const res = await saveSource(prev, form);
    if (!res?.ok || !res.data?.id) return res;
    const id = res.data.id;

    if (keep) {
      await db.update(feedSources).set({ licReviewedAt: keep.at, licReviewedBy: keep.by }).where(eq(feedSources.id, id));
      refresh();
    } else if (p.licReviewed) {
      await logActivity(db, {
        actorId: me.id,
        kind: "source",
        entityType: "source",
        entityId: id,
        summary: `라이선스 검토 기록: ${p.name}`,
      });
    } else if (cur?.licReviewedAt) {
      await logActivity(db, { actorId: me.id, kind: "source", entityType: "source", entityId: id, summary: `라이선스 검토 해제: ${p.name}` });
    }
    return res;
  } catch (e) {
    return fail(e);
  }
}

export async function saveExperimentChecked(prev: ActionState<{ id: string }>, form: FormData): Promise<ActionState<{ id: string }>> {
  try {
    await requireStaff();
    const head = z
      .object({ id: optId, code: z.string().trim().toUpperCase() })
      .safeParse({ id: str(form.get("id")) ?? "", code: str(form.get("code")) ?? "" });
    if (head.success && head.data.code) {
      const { id, code } = head.data;
      const clash = await db.query.experiments.findFirst({
        where: and(sql`upper(${experiments.code}) = ${code}`, id ? ne(experiments.id, id) : undefined),
        columns: { name: true },
      });
      if (clash) return fieldError("code", `이미 ‘${clash.name}’ 가설이 쓰는 코드입니다`);
    }
    return saveExperiment(prev, form);
  } catch (e) {
    return fail(e);
  }
}
