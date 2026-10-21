import { after, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { T } from "@/lib/cache-tags";
import { cdnPurge, invalidateFromRoute, refreshInBackground } from "@/server/invalidate";
import { publishDue } from "@/server/newsroom";
import { internalAuthorized } from "@/server/internal-auth";

/** Publishes scheduled candidates whose time has come. Called every minute by instrumentation.ts (or a Railway cron). */
export async function POST(req: NextRequest) {
  if (!internalAuthorized(req.headers.get("authorization"))) return new Response(null, { status: 401 });
  const results = await publishDue(db);
  if (results.length) {
    invalidateFromRoute(results.flatMap((r) => r.tags));
    refreshInBackground([T.rel]);
    after(() => cdnPurge(results.flatMap((r) => r.paths)));
  }
  return Response.json({ published: results.map((r) => r.slug) });
}
