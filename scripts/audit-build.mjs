/**
 * Fails if any public route would render per request. Public pages must be
 * fully static (prerendered or ISR, no postponed dynamic holes) so they can be
 * served instantly and cached at a CDN. Run after `next build`.
 */
import { existsSync, readFileSync } from "node:fs";

const MUST_EXIST = ["/", "/ai", "/crypto", "/economy", "/tech", "/sentiment", "/latest", "/corrections", "/about", "/search", "/rss.xml", "/sitemap.xml", "/robots.txt", "/api/pulse", "/api/search-index"];
const ISR = ["/a/[slug]", "/s/[slug]", "/d/[date]", "/editors/[slug]", "/policy/[doc]"];

const manifestPath = ".next/prerender-manifest.json";
if (!existsSync(manifestPath)) {
  console.error("✗ run `next build` first");
  process.exit(1);
}
const prerender = JSON.parse(readFileSync(manifestPath, "utf8"));
const routes = Object.keys(prerender.routes ?? {});
const dynamic = new Set(Object.keys(prerender.dynamicRoutes ?? {}));
const problems = [];

for (const r of MUST_EXIST) if (!routes.includes(r)) problems.push(`not prerendered: ${r}`);
for (const d of ISR) if (!dynamic.has(d)) problems.push(`${d} is not an ISR route (generateStaticParams missing?)`);

// A postponed state in the .meta file means the page has request-time holes.
let checked = 0;
for (const r of routes) {
  if (r.startsWith("/admin") || r.startsWith("/_") || r.startsWith("/api/")) continue;
  const meta = `.next/server/app${r === "/" ? "/index" : r}.meta`;
  if (!existsSync(meta)) continue;
  checked++;
  const m = JSON.parse(readFileSync(meta, "utf8"));
  if ("postponed" in m) problems.push(`public route renders per request: ${r}`);
}

const articles = routes.filter((r) => r.startsWith("/a/")).length;
console.log(`public pages checked: ${checked} · articles prerendered: ${articles} · ISR: ${[...dynamic].join(", ")}`);
if (!articles) problems.push("no article pages were prerendered");
if (problems.length) {
  console.error("✗ build audit failed:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("✓ every public page is fully static");
