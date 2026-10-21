import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { feedSources, siteSettings } from "@/db/schema";
import { validateConfig } from "../execute";
import { getAdapter } from "../registry";
import { CATALOG, type CatalogSource } from "./index";

/**
 * Inserts catalog sources the database has never seen. A slug is remembered
 * once inserted, so a source an editor deleted is not brought back.
 * `update` re-applies the catalog's technical fields to catalog-origin rows
 * (adapter, URL, config, interval, licence notes) — never status or review.
 */

const SEEN_KEY = "catalog.seen";

export interface SyncReport {
  inserted: string[];
  updated: string[];
  /** deleted by an editor earlier, or edited by hand (origin manual) */
  skipped: string[];
}

function rowValues(e: CatalogSource) {
  const adapter = getAdapter(e.adapter);
  if (!adapter) throw new Error(`catalog ${e.slug}: unknown adapter ${e.adapter}`);
  const v = validateConfig(e.adapter, e.config);
  if (!v.ok) throw new Error(`catalog ${e.slug}: ${v.message}`);
  return {
    name: e.name,
    kind: adapter.kind,
    url: e.url ?? null,
    beats: e.beats,
    lang: e.lang,
    adapter: e.adapter,
    config: e.config,
    auth: { envVars: (adapter.envVars ?? []).map((x) => x.name) },
    pollIntervalSec: e.pollIntervalSec ?? adapter.defaultPollSec,
    trustTier: e.trustTier,
    signalOnly: Boolean(e.signalOnly),
    licCommercialOk: e.license.commercialOk ?? null,
    licRedistributionOk: e.license.redistributionOk ?? null,
    licVerbatimOk: e.license.verbatimOk ?? null,
    licAttribution: e.license.attribution ?? null,
    licRetentionDays: e.license.retentionDays ?? null,
    licTermsUrl: e.license.termsUrl ?? null,
    notes: e.note ?? "",
  };
}

export async function syncCatalog(opts: { update?: boolean; dryRun?: boolean } = {}): Promise<SyncReport> {
  // validate everything before touching the database
  const planned = CATALOG.map((e) => ({ e, values: rowValues(e) }));
  const report: SyncReport = { inserted: [], updated: [], skipped: [] };

  await db.transaction(async (tx) => {
    const seenRow = await tx.query.siteSettings.findFirst({ where: eq(siteSettings.key, SEEN_KEY) });
    const seen = new Set(Array.isArray(seenRow?.value) ? (seenRow!.value as string[]) : []);
    const existing = new Map((await tx.select({ slug: feedSources.slug, origin: feedSources.origin }).from(feedSources)).map((r) => [r.slug, r.origin]));

    for (const { e, values } of planned) {
      const origin = existing.get(e.slug);
      if (origin === undefined) {
        if (seen.has(e.slug) && !opts.update) {
          report.skipped.push(e.slug);
          continue;
        }
        if (!opts.dryRun) await tx.insert(feedSources).values({ slug: e.slug, ...values, status: e.status ?? "active", origin: "catalog" });
        report.inserted.push(e.slug);
      } else if (opts.update && origin === "catalog") {
        if (!opts.dryRun) await tx.update(feedSources).set(values).where(eq(feedSources.slug, e.slug));
        report.updated.push(e.slug);
      } else if (opts.update) {
        report.skipped.push(e.slug);
      }
      seen.add(e.slug);
    }

    if (!opts.dryRun) {
      await tx
        .insert(siteSettings)
        .values({ key: SEEN_KEY, value: [...seen].sort() })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value: sql`excluded.value`, updatedAt: new Date() } });
    }
  });
  return report;
}
