/** What the desk has learned, refreshed by the worker (desk.learn) and stored in site_settings. */

export interface Effect {
  /** reader effects: mean performance in z units; editor effects: acceptance rate minus the overall rate */
  mean: number;
  n: number;
}

import type { TrafficSource } from "@/lib/traffic";

export { TRAFFIC_SOURCES, type TrafficSource } from "@/lib/traffic";

export interface ArticleBrief {
  slug: string;
  title: string;
  beat: string;
  topic: string;
  perf: number;
  views: number;
  readRate: number;
}

export type DeskPhase = "cold" | "warming" | "learning";

export interface DeskModel {
  computedAt: string | null;
  /** cold: too little reader data to act on · warming: some · learning: enough */
  phase: DeskPhase;
  /** 0–1: how much reader effects count in the score */
  confidence: number;
  /** published articles with at least a day of reader data */
  measured: number;
  medianViews: number;
  readRate: number;
  /** views by where readers came from, last 30 days */
  traffic: Record<TrafficSource, number>;
  reader: {
    beat: Record<string, Effect>;
    topic: Record<string, Effect>;
    source: Record<string, Effect>;
    hour: Record<string, Effect>;
  };
  /** editors' calls on desk drafts: published vs rejected */
  editor: {
    total: number;
    published: number;
    rejected: number;
    rate: number;
    beat: Record<string, Effect>;
    topic: Record<string, Effect>;
  };
  top: ArticleBrief[];
  bottom: ArticleBrief[];
}

export const EMPTY_DESK_MODEL: DeskModel = {
  computedAt: null,
  phase: "cold",
  confidence: 0,
  measured: 0,
  medianViews: 0,
  readRate: 0,
  traffic: { search: 0, social: 0, direct: 0, internal: 0, other: 0 },
  reader: { beat: {}, topic: {}, source: {}, hour: {} },
  editor: { total: 0, published: 0, rejected: 0, rate: 0, beat: {}, topic: {} },
  top: [],
  bottom: [],
};
