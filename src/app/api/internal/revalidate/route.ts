import type { NextRequest } from "next/server";
import { z } from "zod";
import { invalidateFromRoute } from "@/server/invalidate";
import { internalAuthorized } from "@/server/internal-auth";

/** Tag invalidation for ops and phase-2 feed workers: POST { "tags": ["feed", "quotes"] } */
export async function POST(req: NextRequest) {
  if (!internalAuthorized(req.headers.get("authorization"))) return new Response(null, { status: 401 });
  const parsed = z.object({ tags: z.array(z.string().min(1).max(200)).min(1).max(64) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  invalidateFromRoute(parsed.data.tags);
  return Response.json({ ok: true, tags: parsed.data.tags });
}
