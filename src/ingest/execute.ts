import type { Beat } from "@/db/schema";
import { HostLimiter, Http } from "./http";
import { getAdapter } from "./registry";
import { ConfigError, type AdapterResult } from "./types";

/**
 * Runs one source's adapter without touching the database: config validation,
 * credential lookup, timeouts and conditional-request memory. Shared by the
 * worker, the newsroom's test button and the CI probe.
 */

export interface SourceInput {
  id: string;
  slug: string;
  name: string;
  url: string | null;
  lang: string;
  beats: Beat[];
  trustTier: number;
  signalOnly: boolean;
  pollIntervalSec: number;
  adapter: string;
  config: Record<string, unknown>;
  auth: { envVars?: string[] };
  state: Record<string, unknown>;
}

export interface ExecuteOptions {
  limiter: HostLimiter;
  now?: Date;
  signal?: AbortSignal;
  log?: (msg: string) => void;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

export interface Executed {
  result: AdapterResult;
  /** cursor to store: the adapter's state plus conditional-request validators */
  state: Record<string, unknown>;
  httpStatus?: number;
  requests: number;
  durationMs: number;
}

const HTTP_STATE = "__http";

/** Which credentials a source may read, and which of them are missing. */
export function credentialStatus(src: Pick<SourceInput, "adapter" | "auth">, env: Record<string, string | undefined> = process.env) {
  const adapter = getAdapter(src.adapter);
  const specs = new Map((adapter?.envVars ?? []).map((v) => [v.name, v]));
  for (const name of src.auth.envVars ?? []) if (!specs.has(name)) specs.set(name, { name, required: false, help: "" });
  return [...specs.values()].map((v) => ({ ...v, present: Boolean(env[v.name]?.trim()) }));
}

export function validateConfig(adapterKey: string, config: unknown): { ok: true; config: unknown } | { ok: false; message: string } {
  const adapter = getAdapter(adapterKey);
  if (!adapter) return { ok: false, message: `알 수 없는 어댑터: ${adapterKey}` };
  const parsed = adapter.configSchema.safeParse(config ?? {});
  if (parsed.success) return { ok: true, config: parsed.data };
  const msg = parsed.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(설정)"}: ${i.message}`)
    .join(" · ");
  return { ok: false, message: msg };
}

export async function executeAdapter(src: SourceInput, opts: ExecuteOptions): Promise<Executed> {
  const started = Date.now();
  const adapter = getAdapter(src.adapter);
  if (!adapter) throw new ConfigError(`알 수 없는 어댑터: ${src.adapter}`);
  const v = validateConfig(src.adapter, src.config);
  if (!v.ok) throw new ConfigError(`설정 오류 — ${v.message}`);

  const env = opts.env ?? process.env;
  const creds = credentialStatus(src, env);
  const missing = creds.filter((c) => c.required && !c.present).map((c) => c.name);
  if (missing.length) throw new ConfigError(`키 필요: ${missing.join(", ")}`);
  const allowed = new Set(creds.map((c) => c.name));

  const signal = AbortSignal.any([AbortSignal.timeout(adapter.timeoutMs ?? 90_000), ...(opts.signal ? [opts.signal] : [])]);
  const { [HTTP_STATE]: validators, ...state } = src.state ?? {};
  const http = new Http({
    limiter: opts.limiter,
    signal,
    validators: (validators as ConstructorParameters<typeof Http>[0]["validators"]) ?? {},
    fetchImpl: opts.fetchImpl,
  });

  const result = await adapter.run({
    source: {
      id: src.id,
      slug: src.slug,
      name: src.name,
      url: src.url,
      lang: src.lang,
      beats: src.beats,
      trustTier: src.trustTier,
      signalOnly: src.signalOnly,
      pollIntervalSec: src.pollIntervalSec,
    },
    config: v.config,
    state,
    http,
    secret: (name) => (allowed.has(name) ? env[name]?.trim() || undefined : undefined),
    now: opts.now ?? new Date(),
    signal,
    log: opts.log ?? (() => {}),
  });

  return {
    result,
    state: { ...(result.state ?? state), [HTTP_STATE]: http.validators },
    httpStatus: http.lastStatus,
    requests: http.requests,
    durationMs: Date.now() - started,
  };
}
