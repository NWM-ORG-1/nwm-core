import { getSearchIndex } from "@/data/public";

/** Compact search index, loaded only when the reader opens search. */
export async function GET() {
  return Response.json(await getSearchIndex(), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=600" },
  });
}
