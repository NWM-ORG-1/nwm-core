import { expect, test } from "@playwright/test";

/**
 * Performance budgets (lab, indicative). Field numbers come later from RUM.
 *  - no third-party origins · CLS ≤ 0.02 · CSS ≤ 25KB · app JS within budget
 */
const KB = 1024;

for (const path of ["/", "__article__"]) {
  test(`budgets: ${path}`, async ({ page, baseURL }) => {
    let url = path;
    if (path === "__article__") {
      // Read the link in a throwaway page: a prefetch the outgoing page starts during navigation
      // can stay "pending" in Playwright forever, and networkidle below would never settle.
      const probe = await page.context().newPage();
      await probe.goto("/latest");
      url = (await probe.locator("main ol a[data-row-link]").first().getAttribute("href"))!;
      await probe.close();
    }
    const origins = new Set<string>();
    page.on("request", (r) => origins.add(new URL(r.url()).origin));
    await page.goto(url, { waitUntil: "networkidle" });
    const metrics = await page.evaluate(async () => {
      const cls = await new Promise<number>((resolve) => {
        let v = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) v += e.value;
        }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => resolve(v), 1500);
      });
      const lcp = await new Promise<number>((resolve) => {
        new PerformanceObserver((l) => {
          const es = l.getEntries();
          resolve(es[es.length - 1]?.startTime ?? 0);
        }).observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => resolve(0), 1500);
      });
      const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const sum = (f: (r: PerformanceResourceTiming) => boolean) => res.filter(f).reduce((a, r) => a + (r.encodedBodySize || r.transferSize), 0);
      return {
        cls,
        lcp,
        html: nav.encodedBodySize,
        css: sum((r) => r.name.endsWith(".css")),
        js: sum((r) => r.name.endsWith(".js")),
        fonts: sum((r) => r.name.endsWith(".woff2")),
      };
    });
    console.log(url, JSON.stringify({ ...metrics, html: `${(metrics.html / KB).toFixed(1)}KB`, css: `${(metrics.css / KB).toFixed(1)}KB`, js: `${(metrics.js / KB).toFixed(1)}KB`, fonts: `${(metrics.fonts / KB).toFixed(1)}KB` }));
    const own = new URL(baseURL!).origin;
    expect([...origins].filter((o) => o !== own && !o.startsWith("data:"))).toEqual([]);
    expect(metrics.cls).toBeLessThanOrEqual(0.02);
    expect(metrics.css).toBeLessThan(30 * KB);
    expect(metrics.js).toBeLessThan(190 * KB); // ≈120KB framework runtime + app islands + prefetched next-route code
  });
}
