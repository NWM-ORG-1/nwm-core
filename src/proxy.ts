import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured, verifyBasicAuth } from "@/server/credentials";
import { clientIp, WindowCounter } from "@/server/rate-limit";

/**
 * Basic Auth for the newsroom (/admin). With SITE_LOCK=1 the whole site is
 * locked the same way (until 인터넷신문 registration is complete).
 * Server Actions re-verify credentials themselves — this is not the only guard.
 */

const failures = new WindowCounter(5 * 60_000);
const MAX_FAILURES = 10;

function deny(status: 401 | 429 | 503, body: string) {
  return new Response(body, {
    status,
    headers: {
      ...(status === 401 ? { "WWW-Authenticate": 'Basic realm="NWM Newsroom", charset="UTF-8"' } : {}),
      ...(status !== 401 ? { "Retry-After": "30" } : {}),
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isAdmin = path === "/admin" || path.startsWith("/admin/");
  const siteLocked = process.env.SITE_LOCK === "1";
  if (!isAdmin && !siteLocked) return NextResponse.next();
  // Health checks, internal bearer routes and the bot webhook (Telegram's secret header) have their own auth.
  if (path === "/api/health" || path.startsWith("/api/internal/") || path === "/api/telegram") return NextResponse.next();

  if (!adminConfigured()) return deny(503, "ADMIN_USERS is not configured.");

  const ip = clientIp(req.headers);
  if (failures.count(ip) >= MAX_FAILURES) return deny(429, "Too many attempts. Try again later.");

  const login = await verifyBasicAuth(req.headers.get("authorization"));
  if (login === "busy") return deny(503, "Busy. Try again shortly.");
  if (!login) {
    if (req.headers.get("authorization")) failures.hit(ip);
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
