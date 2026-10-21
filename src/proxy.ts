import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured, verifyBasicAuth } from "@/server/credentials";

/**
 * Basic Auth for the newsroom (/admin). With SITE_LOCK=1 the whole site is
 * locked the same way (until 인터넷신문 registration is complete).
 * Server Actions re-verify credentials themselves — this is not the only guard.
 */

const failures = new Map<string, { n: number; reset: number }>();
const WINDOW = 5 * 60_000;
const MAX_FAILURES = 10;

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function deny(status: 401 | 429 | 503, body: string) {
  return new Response(body, {
    status,
    headers: {
      ...(status === 401 ? { "WWW-Authenticate": 'Basic realm="NWM Newsroom", charset="UTF-8"' } : {}),
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isAdmin = path === "/admin" || path.startsWith("/admin/");
  const siteLocked = process.env.SITE_LOCK === "1";
  if (!isAdmin && !siteLocked) return NextResponse.next();
  // Health checks and internal bearer routes have their own auth.
  if (path === "/api/health" || path.startsWith("/api/internal/")) return NextResponse.next();

  if (!adminConfigured()) return deny(503, "ADMIN_USERS is not configured.");

  const ip = clientIp(req);
  const now = Date.now();
  const f = failures.get(ip);
  if (f && f.reset > now && f.n >= MAX_FAILURES) return deny(429, "Too many attempts. Try again later.");

  const login = verifyBasicAuth(req.headers.get("authorization"));
  if (!login) {
    if (req.headers.get("authorization")) {
      const entry = f && f.reset > now ? f : { n: 0, reset: now + WINDOW };
      entry.n += 1;
      failures.set(ip, entry);
      if (failures.size > 10_000) failures.clear();
    }
    return deny(401, "Authentication required.");
  }
  failures.delete(ip);
  const res = NextResponse.next();
  if (isAdmin) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  // Static assets are never locked; everything else is checked in proxy() above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
