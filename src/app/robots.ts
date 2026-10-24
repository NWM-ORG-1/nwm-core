import type { MetadataRoute } from "next";
import { getSiteFlags } from "@/data/public";
import { SITE } from "@/lib/site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { demo } = await getSiteFlags();
  if (demo || process.env.SITE_LOCK === "1") return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/tg/"] }],
    sitemap: [`${SITE.url}/sitemap.xml`, `${SITE.url}/news-sitemap.xml`],
  };
}
