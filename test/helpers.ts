import { readFileSync } from "node:fs";
import { join } from "node:path";
import { executeAdapter, type SourceInput } from "@/ingest/execute";
import { HostLimiter } from "@/ingest/http";

export const fixture = (name: string) => readFileSync(join(process.cwd(), "test/fixtures", name), "utf8");

export interface Route {
  match: RegExp;
  status?: number;
  body: string | ((url: string, init?: RequestInit) => string);
  headers?: Record<string, string>;
}

/** fetch() stand-in: first matching route answers; unmatched URLs fail loudly. */
export function fakeFetch(routes: Route[], calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const r = routes.find((x) => x.match.test(url));
    if (!r) throw new TypeError(`fetch failed: no route for ${url}`);
    const body = typeof r.body === "function" ? r.body(url, init) : r.body;
    return new Response(r.status === 304 ? null : body, { status: r.status ?? 200, headers: { "content-type": "application/json; charset=utf-8", ...r.headers } });
  }) as typeof fetch;
}

export function source(over: Partial<SourceInput> & Pick<SourceInput, "adapter" | "config">): SourceInput {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "test",
    name: "test",
    url: null,
    lang: "ko",
    beats: [],
    trustTier: 2,
    signalOnly: false,
    pollIntervalSec: 600,
    auth: {},
    state: {},
    ...over,
  };
}

export const NOW = new Date("2026-10-21T18:00:00Z");

export function run(src: SourceInput, routes: Route[], opts: { env?: Record<string, string>; now?: Date; calls?: string[] } = {}) {
  return executeAdapter(src, { limiter: new HostLimiter(() => 0), fetchImpl: fakeFetch(routes, opts.calls), env: opts.env ?? {}, now: opts.now ?? NOW });
}
