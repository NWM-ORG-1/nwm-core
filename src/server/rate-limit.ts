/**
 * Client address and fixed-window counters for the in-memory rate limits
 * (proxy login failures, reading beacon). One replica, so memory is enough.
 */

const HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1);

/**
 * The leftmost X-Forwarded-For entry is whatever the client sent. Only the hops our own
 * proxies append can be trusted, so count TRUSTED_PROXY_HOPS entries back from the right
 * (Railway's edge appends one; add one per CDN placed in front). IPv6 is grouped by /64
 * so one host can't rotate addresses within its prefix.
 */
export function clientIp(headers: Headers): string {
  const xff = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = xff[Math.max(0, xff.length - HOPS)] ?? headers.get("x-real-ip") ?? "local";
  return ip.includes(":") ? `${ip.split(":").slice(0, 4).join(":")}::/64` : ip;
}

/** Fixed-window counter with bounded memory: a flood of new keys evicts the oldest, never resets everyone. */
export class WindowCounter {
  private m = new Map<string, { n: number; reset: number }>();
  constructor(
    private windowMs: number,
    private maxKeys = 10_000,
  ) {}

  count(key: string, now = Date.now()): number {
    const e = this.m.get(key);
    return e && e.reset > now ? e.n : 0;
  }

  hit(key: string, now = Date.now()): number {
    let e = this.m.get(key);
    if (!e || e.reset <= now) {
      this.m.delete(key);
      e = { n: 0, reset: now + this.windowMs };
    }
    e.n += 1;
    this.m.set(key, e);
    if (this.m.size > this.maxKeys) this.evict(now);
    return e.n;
  }

  delete(key: string) {
    this.m.delete(key);
  }

  private evict(now: number) {
    for (const [k, v] of this.m) if (v.reset <= now) this.m.delete(k);
    // Map iterates in insertion order: drop the oldest keys first.
    for (const k of this.m.keys()) {
      if (this.m.size <= this.maxKeys) break;
      this.m.delete(k);
    }
  }
}
