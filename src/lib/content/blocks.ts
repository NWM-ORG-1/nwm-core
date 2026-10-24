import { z } from "zod";
import { SECTION_LABELS } from "./meta";

export { BLOCK_TITLE_KO, SECTION_LABEL_KO, SECTION_LABELS, blockText, plainText, readSecondsFor, readTimeLabel } from "./meta";
export type { SectionLabel } from "./meta";

/**
 * Smart-brevity article body.
 *
 * An article is a headline + one-line signal (the dek) + an ordered list of
 * typed blocks. Blocks are stored as JSON in `articles.blocks` and in
 * `candidates.draft.blocks`, validated with these schemas on every write.
 * Text supports only `**bold**`; raw HTML is never rendered.
 */

const text = z.string().trim().min(1).max(600);
const item = z.string().trim().min(1).max(300);

export const keyNumberSchema = z.object({
  value: z.string().trim().min(1).max(24), // "₩98조", "+12.4%", "$1.2B"
  label: z.string().trim().min(1).max(60),
  delta: z.string().trim().max(24).optional(),
  trend: z.enum(["up", "down", "flat"]).optional(),
});
export type KeyNumber = z.infer<typeof keyNumberSchema>;

/** a chart holds up to this many points (monthly prices since 2013) */
export const MAX_CHART_POINTS = 160;

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("why"), items: z.array(item).min(1).max(3) }),
  z.object({ type: z.literal("numbers"), items: z.array(keyNumberSchema).min(1).max(4) }),
  z.object({
    type: z.literal("section"),
    label: z.enum(SECTION_LABELS),
    text: text.optional(),
    bullets: z.array(item).max(5).optional(),
  }),
  z.object({
    type: z.literal("quote"),
    text: text,
    attribution: z.string().trim().min(1).max(80),
    role: z.string().trim().max(80).optional(),
  }),
  z.object({
    type: z.literal("chart"),
    title: z.string().trim().min(1).max(80),
    unit: z.string().trim().max(12).optional(),
    points: z.array(z.number().finite()).min(2).max(MAX_CHART_POINTS),
    source: z.string().trim().max(80).optional(),
    /** x-axis label per point ("2020-11"); charts we draw from our own data carry them */
    labels: z.array(z.string().trim().max(12)).max(MAX_CHART_POINTS).optional(),
    /** events marked on the line (point index, short label) */
    marks: z
      .array(z.object({ i: z.number().int().min(0).max(MAX_CHART_POINTS - 1), label: z.string().trim().min(1).max(24) }))
      .max(8)
      .optional(),
    /** log scale for long price histories */
    scale: z.enum(["linear", "log"]).optional(),
  }),
  z.object({
    type: z.literal("table"),
    caption: z.string().trim().min(1).max(120),
    columns: z.array(z.string().trim().max(40)).min(2).max(6),
    rows: z.array(z.array(z.string().trim().max(60))).min(1).max(20),
  }),
  z.object({ type: z.literal("sentiment") }),
  z.object({ type: z.literal("next"), items: z.array(item).min(1).max(3) }),
  z.object({
    type: z.literal("deeper"),
    links: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(120),
          href: z.string().trim().max(500),
          kind: z.enum(["story", "article", "primary"]),
        }),
      )
      .min(1)
      .max(5),
  }),
]);
export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];

export const sourceRefSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().max(500).optional(),
  kind: z.enum(["filing", "press", "data", "social", "report", "news", "paper"]).optional(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

export const sentimentSourceSchema = z.object({
  name: z.string().trim().min(1).max(40), // "X", "Reddit", "텔레그램", "국내 커뮤니티"
  score: z.number().min(-100).max(100),
  share: z.number().min(0).max(1),
});

export const sentimentSnapshotSchema = z.object({
  score: z.number().min(-100).max(100), // −100 extreme fear … +100 extreme greed
  change24h: z.number(),
  bullish: z.number().min(0).max(100),
  bearish: z.number().min(0).max(100),
  volume: z.number().int().min(0),
  sources: z.array(sentimentSourceSchema).max(6),
  keywords: z.array(z.string().trim().max(30)).max(8).optional(),
});
export type SentimentSnapshot = z.infer<typeof sentimentSnapshotSchema>;

/** Working copy of an article inside a candidate. Looser than a published article. */
export const draftSchema = z.object({
  title: z.string().trim().max(120),
  dek: z.string().trim().max(300),
  blocks: z.array(blockSchema).max(16),
  tags: z.array(z.string().trim().min(1).max(30)).max(8),
  tickers: z.array(z.string().trim().min(1).max(16)).max(6),
  sources: z.array(sourceRefSchema).max(10),
  sentiment: sentimentSnapshotSchema.nullable().optional(),
  isBreaking: z.boolean().optional(),
});
export type Draft = z.infer<typeof draftSchema>;

export const EMPTY_DRAFT: Draft = { title: "", dek: "", blocks: [], tags: [], tickers: [], sources: [] };

