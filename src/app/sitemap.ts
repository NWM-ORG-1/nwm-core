import type { MetadataRoute } from "next";
import { getSitemapEntries } from "@/data/public";
import { BEAT_ORDER, BEATS } from "@/lib/beats";
import { SITE } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { articles, stories } = await getSitemapEntries();
  return [
    { url: SITE.url, changeFrequency: "always", priority: 1 },
    ...BEAT_ORDER.map((b) => ({ url: `${SITE.url}${BEATS[b].path}`, changeFrequency: "hourly" as const, priority: 0.8 })),
    { url: `${SITE.url}/latest`, changeFrequency: "always", priority: 0.7 },
    ...stories.map((s) => ({ url: `${SITE.url}/s/${s.slug}`, lastModified: s.updatedAt ?? undefined, priority: 0.6 })),
    ...articles.map((a) => ({ url: `${SITE.url}/a/${a.slug}`, lastModified: a.updatedAt, priority: 0.5 })),
  ];
}
