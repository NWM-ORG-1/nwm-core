import { getPulse } from "@/data/public";

/** Live data for static pages (ticker, new-article pill, sentiment). Cached ~30s, CDN-friendly. */
export async function GET() {
  const pulse = await getPulse();
  return Response.json(pulse, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30" },
  });
}
