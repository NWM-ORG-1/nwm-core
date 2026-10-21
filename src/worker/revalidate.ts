/**
 * Tells the web service which cached data changed (POST /api/internal/revalidate).
 * Tags are batched per tick; a failed call keeps them for the next one.
 */
export class Revalidator {
  private pending = new Set<string>();
  private failures = 0;

  constructor(private readonly log: (m: string) => void) {}

  queue(tags: Iterable<string>) {
    for (const t of tags) this.pending.add(t);
  }

  async flush(): Promise<void> {
    if (!this.pending.size) return;
    const base = process.env.REVALIDATE_URL || process.env.NEXT_PUBLIC_SITE_URL;
    const secret = process.env.INTERNAL_API_SECRET;
    if (!base || !secret) {
      if (this.failures++ === 0) this.log("revalidate: REVALIDATE_URL/NEXT_PUBLIC_SITE_URL or INTERNAL_API_SECRET missing — pages refresh on their own window");
      this.pending.clear();
      return;
    }
    const tags = [...this.pending].slice(0, 64);
    try {
      const res = await fetch(new URL("/api/internal/revalidate", base), {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      for (const t of tags) this.pending.delete(t);
      this.failures = 0;
    } catch (err) {
      this.failures++;
      if (this.failures === 1 || this.failures % 20 === 0) this.log(`revalidate failed (${this.failures}×): ${(err as Error).message}`);
      if (this.failures > 60) this.pending.clear();
    }
  }
}
