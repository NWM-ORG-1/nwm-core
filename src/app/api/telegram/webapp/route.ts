import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { requestOriginAllowed } from "@/server/request-origin";
import { newsroomBotToken } from "@/server/telegram/api";
import { linkedEditor } from "@/server/telegram/links";
import { makeTicket, UUID, verifyInitData } from "@/server/telegram/webapp";

/**
 * The bot's Mini App page (/tg/preview/[id]) posts Telegram's signed launch
 * data here and gets a ticket for that one draft — only for an active editor
 * linked to the Telegram user who pressed the button.
 */
export async function POST(req: NextRequest) {
  const token = newsroomBotToken();
  const no = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
  if (!token) return no(404, "뉴스룸 봇이 설정되지 않았습니다.");
  if (!requestOriginAllowed(req.headers)) return no(403, "허용되지 않은 요청 출처입니다.");

  const body = (await req.json().catch(() => null)) as { initData?: unknown; candidateId?: unknown } | null;
  const candidateId = typeof body?.candidateId === "string" ? body.candidateId.toLowerCase() : "";
  if (!UUID.test(candidateId)) return no(400, "잘못된 요청입니다.");
  const user = verifyInitData(typeof body?.initData === "string" ? body.initData : "", token);
  if (!user) return no(401, "텔레그램 확인에 실패했습니다. 봇 카드의 버튼으로 다시 열어 주세요.");
  const linked = await linkedEditor(db, user.id);
  if (!linked) return no(403, "뉴스룸 계정과 연결된 텔레그램 계정이 아닙니다.");

  return Response.json({ ticket: makeTicket({ tgUserId: user.id, staffId: linked.me.id, candidateId }, token) }, { headers: { "Cache-Control": "no-store" } });
}
