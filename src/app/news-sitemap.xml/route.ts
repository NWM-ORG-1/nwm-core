import { getNewsSitemapEntries } from "@/data/public";
import { SITE } from "@/lib/site";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Google News sitemap (last 48h). */
export async function GET() {
  const items = await getNewsSitemapEntries();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${items
  .map(
    (a) => `<url><loc>${SITE.url}/a/${a.slug}</loc><news:news><news:publication><news:name>NWM 뉴웹미디어</news:name><news:language>ko</news:language></news:publication><news:publication_date>${a.publishedAt}</news:publication_date><news:title>${esc(a.title)}</news:title></news:news></url>`,
  )
  .join("\n")}
</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
