"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { experiments, feedSources } from "@/db/schema";
import { collectorEnv } from "@/data/admin-ingest";
import { validateConfig } from "@/ingest/execute";
import { getAdapter } from "@/ingest/registry";
import { parseHandles, type SocialKind } from "@/ingest/social-handles";
import { logActivity } from "../activity";
import { requireStaff } from "../auth";
import { NewsroomError } from "../newsroom";
import { addSocialSourcesAs, previewSocial, SOCIAL_BATCH, type AddSocialResult, type SocialPreview } from "../social-sources";
import { fail, ok, type ActionState } from "./result";

const tri = z.enum(["yes", "no", "unknown"]).transform((v) => (v === "yes" ? true : v === "no" ? false : null));
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const sourceForm = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,60}$/, "slug는 영문 소문자·숫자·하이픈"),
  kind: z.enum(["rss", "api", "ws", "scrape", "press_pdf", "manual"]),
  url: optText(500),
  lang: z.enum(["ko", "en", "ja", "zh"]),
  beats: z.array(z.enum(["ai", "crypto", "economy", "tech", "sentiment"])).default([]),
  experimentId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  adapter: z.string().trim().min(1).max(60).default("manual"),
  pollIntervalSec: z.coerce.number().int().min(15).max(86_400),
  trustTier: z.coerce.number().int().min(1).max(4),
  signalOnly: z.enum(["on"]).optional().transform((v) => v === "on"),
  licCommercialOk: tri,
  licRedistributionOk: tri,
  licVerbatimOk: tri,
  licAttribution: optText(200),
  licRetentionDays: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(0).max(36_500).nullable()),
  licTermsUrl: optText(500),
  licReviewed: z.enum(["on"]).optional().transform((v) => v === "on"),
  configJson: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return {};
      try {
        const parsed = JSON.parse(v);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      } catch {}
      ctx.addIssue({ code: "custom", message: "어댑터 설정은 JSON 객체여야 합니다" });
      return z.NEVER;
    }),
});

/** Create or update a feed source (used with useActionState). */
export async function saveSource(_prev: ActionState<{ id: string }>, form: FormData): Promise<ActionState<{ id: string }>> {
  try {
    const me = await requireStaff();
    const p = sourceForm.parse({
      ...Object.fromEntries(form.entries()),
      beats: form.getAll("beats"),
    });
    // a known adapter's config is checked against its schema; "manual" and unknown keys pass through
    if (getAdapter(p.adapter)) {
      const v = validateConfig(p.adapter, p.configJson);
      // shown under the config field (form-kit splits issues on " · ")
      if (!v.ok) return { ok: false, error: `configJson: 어댑터 규칙에 맞지 않습니다 — ${v.message.replaceAll(" · ", "; ")}`, code: "invalid", at: Date.now() };
    }
    const values = {
      name: p.name,
      slug: p.slug,
      kind: p.kind,
      url: p.url,
      lang: p.lang,
      beats: p.beats,
      experimentId: p.experimentId ?? null,
      adapter: p.adapter,
      pollIntervalSec: p.pollIntervalSec,
      trustTier: p.trustTier,
      signalOnly: p.signalOnly,
      licCommercialOk: p.licCommercialOk,
      licRedistributionOk: p.licRedistributionOk,
      licVerbatimOk: p.licVerbatimOk,
      licAttribution: p.licAttribution,
      licRetentionDays: p.licRetentionDays,
      licTermsUrl: p.licTermsUrl,
      config: p.configJson,
      ...(p.licReviewed ? { licReviewedAt: new Date(), licReviewedBy: me.name } : { licReviewedAt: null, licReviewedBy: null }),
    };
    let sourceId = p.id;
    if (sourceId) {
      await db.update(feedSources).set(values).where(eq(feedSources.id, sourceId));
    } else {
      const [row] = await db.insert(feedSources).values(values).returning({ id: feedSources.id });
      sourceId = row.id;
    }
    await logActivity(db, { actorId: me.id, kind: "source", entityType: "source", entityId: sourceId, summary: `${p.id ? "소스 수정" : "소스 추가"}: ${p.name}` });
    refresh();
    return ok("저장했습니다.", { id: sourceId });
  } catch (e) {
    return fail(e);
  }
}

export async function setSourceStatus(input: { id: string; status: "active" | "paused" }): Promise<ActionState> {
  try {
    const me = await requireStaff();
    const p = z.object({ id: z.uuid(), status: z.enum(["active", "paused"]) }).parse(input);
    await db.update(feedSources).set({ status: p.status, lastError: p.status === "active" ? null : undefined }).where(eq(feedSources.id, p.id));
    await logActivity(db, { actorId: me.id, kind: "source", entityType: "source", entityId: p.id, summary: p.status === "active" ? "수집 재개" : "수집 일시정지" });
    refresh();
    return ok(p.status === "active" ? "수집을 재개했습니다." : "수집을 멈췄습니다.");
  } catch (e) {
    return fail(e);
  }
}

/* ───────────────────────── 텔레그램·X 연결 ───────────────────────── */

const socialKind = z.enum(["telegram", "x"]);

export interface SocialCheck {
  kind: SocialKind;
  items: SocialPreview[];
  rejected: Array<{ input: string; reason: string }>;
  /** X: the collector has no key yet — sources can be added but read nothing until it does */
  keyMissing?: string;
}

/** Reads what was pasted and looks each channel/account up (nothing saved). */
export async function checkSocialSources(input: { kind: SocialKind; text: string }): Promise<ActionState<SocialCheck>> {
  try {
    await requireStaff();
    const p = z.object({ kind: socialKind, text: z.string().max(20_000) }).parse(input);
    const parsed = parseHandles(p.kind, p.text, SOCIAL_BATCH[p.kind]);
    const items = parsed.names.length ? await previewSocial(db, p.kind, parsed.names) : [];
    const keyMissing = p.kind === "x" && !(await collectorEnv()).env.X_BEARER_TOKEN?.trim() ? "X_BEARER_TOKEN" : undefined;
    return ok(undefined, { kind: p.kind, items, rejected: parsed.rejected, keyMissing });
  } catch (e) {
    return fail(e);
  }
}

const socialForm = z.object({
  kind: socialKind,
  entries: z
    .array(z.object({ name: z.string().trim().min(1).max(64), title: z.string().trim().max(200).optional() }))
    .min(1)
    .max(50),
  beats: z.array(z.enum(["ai", "crypto", "economy", "tech", "sentiment"])).default([]),
  lang: z.enum(["ko", "en", "ja", "zh"]),
  trustTier: z.number().int().min(1).max(4),
  signalOnly: z.boolean(),
  output: z.array(z.enum(["items", "posts"])).min(1),
  llmConsent: z.boolean().default(false),
});

/** One source per channel/account, collecting at once (the worker picks new sources up within seconds). */
export async function addSocialSources(input: z.input<typeof socialForm>): Promise<ActionState<AddSocialResult>> {
  try {
    const me = await requireStaff();
    const p = socialForm.parse(input);
    // only names the parser accepts reach the database
    const entries = p.entries.flatMap((e) => {
      const [name] = parseHandles(p.kind, e.name, 1).names;
      return name ? [{ name, title: e.title }] : [];
    });
    if (entries.length !== p.entries.length) throw new NewsroomError("채널·계정 이름을 다시 확인하세요.", "invalid");
    const r = await addSocialSourcesAs(db, me, { ...p, entries });
    refresh();
    const done = r.added.length + r.resumed.length;
    const waitsForKey = p.kind === "x" && !(await collectorEnv()).env.X_BEARER_TOKEN?.trim();
    return ok(
      !done ? "새로 추가한 소스가 없습니다." : waitsForKey ? `${done}개 소스를 추가했습니다. X 키를 넣으면 수집을 시작합니다.` : `${done}개 소스가 수집을 시작합니다.`,
      r,
    );
  } catch (e) {
    return fail(e);
  }
}

const experimentForm = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  code: z.string().trim().regex(/^H\d{1,2}$/, "코드는 H1, H2 … 형식"),
  name: z.string().trim().min(2).max(80),
  hypothesis: z.string().trim().min(5).max(500),
  primaryMetric: z.enum(["publish_rate", "promote_rate", "read_rate", "time_to_publish", "correction_rate"]),
  status: z.enum(["draft", "running", "paused", "concluded"]),
  colorSlot: z.coerce.number().int().min(1).max(4),
  notes: z.string().trim().max(2000).default(""),
});

export async function saveExperiment(_prev: ActionState<{ id: string }>, form: FormData): Promise<ActionState<{ id: string }>> {
  try {
    const me = await requireStaff();
    const p = experimentForm.parse(Object.fromEntries(form.entries()));
    const values = {
      code: p.code,
      name: p.name,
      hypothesis: p.hypothesis,
      primaryMetric: p.primaryMetric,
      status: p.status,
      colorSlot: p.colorSlot,
      notes: p.notes,
      ...(p.status === "running" ? { endedAt: null } : {}),
      ...(p.status === "concluded" ? { endedAt: new Date() } : {}),
    };
    let expId = p.id;
    if (expId) await db.update(experiments).set(values).where(eq(experiments.id, expId));
    else {
      const [row] = await db.insert(experiments).values({ ...values, startedAt: new Date() }).returning({ id: experiments.id });
      expId = row.id;
    }
    await logActivity(db, { actorId: me.id, kind: "experiment", entityType: "experiment", entityId: expId, summary: `가설 ${p.code} 저장` });
    refresh();
    return ok("저장했습니다.", { id: expId });
  } catch (e) {
    return fail(e);
  }
}
