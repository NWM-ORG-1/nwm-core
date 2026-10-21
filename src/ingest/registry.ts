import type { Adapter } from "./types";
import { officialAdapters } from "./adapters/official";
import { marketAdapters } from "./adapters/market";
import { socialAdapters } from "./adapters/social";

/** Every collector the worker knows, by key (feed_sources.adapter). */
const ALL: Adapter[] = [...officialAdapters, ...marketAdapters, ...socialAdapters];

const BY_KEY = new Map<string, Adapter>();
for (const a of ALL) {
  if (BY_KEY.has(a.key)) throw new Error(`duplicate adapter key ${a.key}`);
  BY_KEY.set(a.key, a);
}

export function getAdapter(key: string): Adapter | undefined {
  return BY_KEY.get(key);
}

/** Metadata for the newsroom's source form (no functions). */
export function adapterCatalog() {
  return ALL.map((a) => ({
    key: a.key,
    label: a.label,
    description: a.description,
    kind: a.kind,
    group: a.group,
    defaultPollSec: a.defaultPollSec,
    envVars: a.envVars ?? [],
    configExample: a.configExample as unknown,
  }));
}

export type AdapterMeta = ReturnType<typeof adapterCatalog>[number];
