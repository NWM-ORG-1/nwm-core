import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { isConfiguredLogin } from "@/server/credentials";
import { requestOriginAllowed } from "@/server/request-origin";
import { newsroomBotToken } from "@/server/telegram/api";
import { linkedEditor } from "@/server/telegram/links";
import { makeSession, SESSION_COOKIE, SESSION_SEC } from "@/server/telegram/session";
import { makeTicket, UUID, verifyInitData } from "@/server/telegram/webapp";

/**
 * The bot's Mini App pages post Telegram's signed launch data here — only an
 * active editor linked to the Telegram user who pressed the button gets in.
 * - preview (/tg/preview/[id]): a ticket for that one draft, read-only
 * - edit (/tg/edit/[id]): a newsroom session cookie for this Telegram
 *   app (HttpOnly, SameSite=Lax, /admin only, 12 hours), then the editor
 */
export async function POST(req: NextRequest) {
  const token = newsroomBotToken();
  const no = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
  if (!token) return no(404, "뉴스룸 봇이 설정되지 않았습니다.");
  if (!requestOriginAllowed(req.headers)) return no(403, "허용되지 않은 요청 출처입니다.");

  const body = (await req.json().catch(() => null)) as { initData?: unknown; candidateId?: unknown; mode?: unknown } | null;
  const candidateId = typeof body?.candidateId === "string" ? body.candidateId.toLowerCase() : "";
  if (!UUID.test(candidateId)) return no(400, "잘못된 요청입니다.");
  const user = verifyInitData(typeof body?.initData === "string" ? body.initData : "", token);
  if (!user) return no(401, "텔레그램 확인에 실패했습니다. 봇 카드의 버튼으로 다시 열어 주세요.");
  const linked = await linkedEditor(db, user.id);
  if (!linked) return no(403, "뉴스룸 계정과 연결된 텔레그램 계정이 아닙니다.");

  if (body?.mode !== "edit") {
    return NextResponse.json({ ticket: makeTicket({ tgUserId: user.id, staffId: linked.me.id, candidateId }, token) }, { headers: { "Cache-Control": "no-store" } });
  }
  // the newsroom itself: only for a login that may still sign in with its password
  if (!isConfiguredLogin(linked.me.login)) return no(403, "이 편집자 계정은 지금 뉴스룸에 로그인할 수 없습니다.");
  const res = NextResponse.json({ next: `/admin/candidates/${candidateId}` }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: makeSession({ tgUserId: user.id, staffId: linked.me.id }, token),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: SESSION_SEC,
  });
  return res;
}
