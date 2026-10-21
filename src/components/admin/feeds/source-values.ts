import type { Beat, feedSources } from "@/db/schema";
import type { SourceFormValues, Tri } from "./SourceForm";

type SourceRow = typeof feedSources.$inferSelect;

const tri = (v: boolean | null): Tri => (v === true ? "yes" : v === false ? "no" : "unknown");

/** Drizzle row → serializable form defaults. `null` → defaults for a new source. */
export function toSourceFormValues(s: SourceRow | null, defaults?: { experimentId?: string }): SourceFormValues {
  if (!s) {
    return {
      id: null,
      name: "",
      slug: "",
      kind: "rss",
      url: "",
      lang: "ko",
      beats: [],
      experimentId: defaults?.experimentId ?? "",
      adapter: "manual",
      pollIntervalSec: 600,
      trustTier: 2,
      signalOnly: false,
      licCommercialOk: "unknown",
      licRedistributionOk: "unknown",
      licVerbatimOk: "unknown",
      licAttribution: "",
      licRetentionDays: "",
      licTermsUrl: "",
      licReviewed: false,
      reviewedAt: null,
      reviewedBy: null,
      configJson: "",
    };
  }
  const config = s.config && Object.keys(s.config).length ? JSON.stringify(s.config, null, 2) : "";
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    kind: s.kind,
    url: s.url ?? "",
    lang: s.lang,
    beats: s.beats as Beat[],
    experimentId: s.experimentId ?? "",
    adapter: s.adapter,
    pollIntervalSec: s.pollIntervalSec,
    trustTier: s.trustTier,
    signalOnly: s.signalOnly,
    licCommercialOk: tri(s.licCommercialOk),
    licRedistributionOk: tri(s.licRedistributionOk),
    licVerbatimOk: tri(s.licVerbatimOk),
    licAttribution: s.licAttribution ?? "",
    licRetentionDays: s.licRetentionDays == null ? "" : String(s.licRetentionDays),
    licTermsUrl: s.licTermsUrl ?? "",
    licReviewed: s.licReviewedAt != null,
    reviewedAt: s.licReviewedAt ? s.licReviewedAt.toISOString() : null,
    reviewedBy: s.licReviewedBy,
    configJson: config,
  };
}
