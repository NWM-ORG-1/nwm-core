import { getLatest } from "@/data/public";
import { BEATS } from "@/lib/beats";
import { AI_DISCLOSURE, AI_LABEL } from "@/lib/labels";
import { SITE } from "@/lib/site";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET() {
  const items = await getLatest(50);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(SITE.name)}</title>
<link>${SITE.url}</link>
<description>${esc(SITE.description)}</description>
<language>ko-KR</language>
<atom:link href="${SITE.url}/rss.xml" rel="self" type="application/rss+xml"/>
${items
  .map(
    (a) => `<item>
<title>${esc(a.title)}</title>
<link>${SITE.url}/a/${a.slug}</link>
<guid isPermaLink="true">${SITE.url}/a/${a.slug}</guid>
<pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
<category>${esc(BEATS[a.beat].label)}</category>
<description>${esc(AI_DISCLOSURE ? `${a.dek} [${AI_LABEL[a.aiInvolvement].short}]` : a.dek)}</description>
</item>`,
  )
  .join("\n")}
</channel>
</rss>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=600" },
  });
}
