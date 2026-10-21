import type { z } from "zod";
import type { Beat, SourceKind } from "@/db/schema";
import type { Http } from "./http";

/**
 * Collector contract. An adapter turns one configured source into rows; the
 * runner owns scheduling, persistence, dedupe, scoring and health. Adapters
 * never touch the database, so they also run as a dry run from the newsroom
 * and from the CI probe.
 */

/** → feed_items (the editorial inbox) */
export interface IngestItem {
  /** stable per source: rcept_no, accession number, permalink, … */
  externalId: string;
  url?: string | null;
  title: string;
  summary?: string;
  lang?: string;
  publishedAt?: Date | null;
  payload?: Record<string, unknown>;
  entities?: string[];
  beatGuess?: Beat | null;
  /** adapter's own importance hint 0–1 (DART 주요사항보고, HN points, upvotes, …) */
  weight?: number;
  expiresAt?: Date | null;
}

/** → social_posts (sentiment only, never the inbox) */
export interface SocialPostIn {
  externalId: string;
  url?: string | null;
  author?: string | null;
  text: string;
  lang?: string;
  postedAt: Date;
  engagement?: { views?: number; likes?: number; comments?: number; shares?: number };
  assets?: string[];
}

/** → market_quotes (ticker, charts) */
export interface QuoteIn {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  currency: string;
  /** oldest → newest; omitted = keep the stored sparkline */
  spark?: number[];
  asOf: Date;
  /** provider id shown as attribution ("binance", "upbit", …) */
  source: string;
  /** only used when the symbol is new; editors own placement afterwards */
  sort?: number;
  inTicker?: boolean;
}

/** → market_metrics (time series behind the sentiment index) */
export interface MetricIn {
  metric: string;
  symbol: string;
  at: Date;
  value: number;
  /** provider id; series from different providers are kept apart */
  source: string;
}

export interface AdapterResult {
  items?: IngestItem[];
  posts?: SocialPostIn[];
  quotes?: QuoteIn[];
  metrics?: MetricIn[];
  /** replaces the stored cursor (adapters merge what they want to keep) */
  state?: Record<string, unknown>;
  /** every request answered 304 / nothing new upstream */
  notModified?: boolean;
  /** overrides the poll interval once (release calendars, market hours) */
  nextRunInSec?: number;
  /** a line for the run log */
  note?: string;
  /** paid API usage of this run, for budget caps */
  usage?: { unit: string; count: number; costUsd?: number };
}

export interface SourceView {
  id: string;
  slug: string;
  name: string;
  url: string | null;
  lang: string;
  beats: Beat[];
  trustTier: number;
  signalOnly: boolean;
  pollIntervalSec: number;
}

export interface AdapterContext<C> {
  source: SourceView;
  config: C;
  state: Record<string, unknown>;
  http: Http;
  /** credentials by env var name (only names the adapter declares) */
  secret(name: string): string | undefined;
  now: Date;
  signal: AbortSignal;
  log(msg: string): void;
}

export interface EnvVarSpec {
  name: string;
  required: boolean;
  help: string;
}

export interface Adapter<S extends z.ZodType = z.ZodType> {
  key: string;
  /** Korean label for the newsroom */
  label: string;
  description: string;
  kind: SourceKind;
  group: "official" | "market" | "social" | "generic";
  configSchema: S;
  /** shown as a template in the source form (input shape: defaults may be omitted) */
  configExample: z.input<S>;
  envVars?: EnvVarSpec[];
  defaultPollSec: number;
  /** hard ceiling for one run (default 90s) */
  timeoutMs?: number;
  run(ctx: AdapterContext<z.output<S>>): Promise<AdapterResult>;
}

/** Keeps `configSchema` and `run` agreeing on the config type at the definition site. */
export function defineAdapter<S extends z.ZodType>(a: Adapter<S>): Adapter<S> {
  return a;
}

/** Thrown for problems an editor must fix (bad config, missing key): no backoff spiral, clear message. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
