"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TelegramPanelData } from "@/data/admin-telegram";
import { createTelegramLink, sendTelegramTest, setMyTelegramNotify, unlinkMyTelegram } from "@/server/actions/telegram";
import type { ActionState } from "@/server/actions/result";
import { ActionMessage } from "../client";
import { Badge, btn, cx } from "../ui";
import { Ago } from "../feeds/time";

/**
 * 설정 → 텔레그램: link this editor's Telegram to the newsroom bot. The bot
 * sends a card for each draft that reaches 검토; publishing, editing and
 * rejecting from Telegram run as this editor.
 */
export function TelegramPanel({ data }: { data: TelegramPanelData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState<unknown>>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);

  const run = (fn: () => Promise<ActionState<unknown>>, after?: (s: ActionState<unknown>) => void) =>
    start(async () => {
      const s = await fn();
      setState(s);
      after?.(s);
      if (s?.ok) router.refresh();
    });

  return (
    <section className="panel overflow-hidden" aria-labelledby="telegram-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 id="telegram-title" className="kicker text-fg-2">
          텔레그램 {data.bot && <span className="hud ml-1 text-fg-3">@{data.bot}</span>}
        </h2>
        {!data.configured ? <Badge tone="warn">봇 설정 필요</Badge> : data.link ? <Badge tone="good">연결됨</Badge> : <Badge>연결 전</Badge>}
      </div>
      <p className="border-b border-line px-4 py-3 text-[12.5px] leading-relaxed text-fg-3">
        AI 데스크나 자동 기사가 ‘검토’에 초안을 올리면 텔레그램으로 카드를 보냅니다. 카드에서 바로 발행(법률 검토 확인 포함)하거나, 답장으로 고치거나, 사유를 골라 반려할 수 있습니다. 모든
        작업은 연결한 편집자 이름으로 기록됩니다.
      </p>

      <div className="space-y-3 p-4 text-[13px]">
        {!data.configured ? (
          <ol className="list-decimal space-y-1.5 pl-5 text-fg-2">
            <li>
              텔레그램에서 <span className="font-mono">@BotFather</span>를 열고 <span className="font-mono">/newbot</span>으로 봇을 만듭니다(이름, 그리고 _bot으로 끝나는 아이디).
            </li>
            <li>
              BotFather가 준 토큰을 Railway → <span className="font-mono">nwm-core</span> 서비스 → Variables에{" "}
              <code className="rounded border border-line-2 bg-bg-1 px-1 font-mono text-[12px]">NEWSROOM_TELEGRAM_BOT_TOKEN</code> 으로 넣습니다. 토큰은 채팅이나 다른 곳에 붙여넣지 마세요.
            </li>
            <li>재배포가 끝나면 이 화면에서 ‘연결 링크 만들기’를 누릅니다.</li>
          </ol>
        ) : (
          <>
            {data.webhook && !data.webhook.ok && data.link && (
              <p className="text-[12.5px] text-warn">웹훅이 이 사이트를 가리키고 있지 않습니다. ‘연결 링크 만들기’를 한 번 누르면 다시 맞춥니다.</p>
            )}
            {data.webhook?.lastError && (
              <p className="text-[12.5px] text-warn">
                텔레그램이 마지막으로 보고한 오류: {data.webhook.lastError}
                {data.webhook.lastErrorAt && (
                  <>
                    {" "}
                    (<Ago iso={data.webhook.lastErrorAt} />)
                  </>
                )}
              </p>
            )}

            {data.link ? (
              <div className="space-y-3">
                <p className="text-fg-2">
                  {data.link.username ? `@${data.link.username}` : "텔레그램 계정"}과 연결됨 · <Ago iso={data.link.linkedAt} />
                </p>
                <label className="flex items-center gap-2 text-fg-2">
                  <input
                    type="checkbox"
                    checked={data.link.notify}
                    disabled={pending}
                    onChange={(e) => run(() => setMyTelegramNotify({ on: e.target.checked }))}
                    className="size-4 accent-[var(--ice)]"
                  />
                  새 초안 카드 받기
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={pending} onClick={() => run(sendTelegramTest)} className={cx(btn.base, btn.ghost)}>
                    테스트 메시지
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => window.confirm("텔레그램 연결을 끊을까요? 더는 카드가 오지 않고, 텔레그램에서 발행할 수 없습니다.") && run(unlinkMyTelegram)}
                    className={cx(btn.base, btn.danger)}
                  >
                    연결 끊기
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(createTelegramLink as () => Promise<ActionState<unknown>>, (s) => {
                      if (s?.ok) setLink((s as { data?: { url: string; expiresAt: string } }).data ?? null);
                    })
                  }
                  className={cx(btn.base, btn.primary)}
                >
                  {pending ? "만드는 중…" : "연결 링크 만들기"}
                </button>
                {link && (
                  <div className="space-y-1.5 rounded-lg border border-line-2 bg-bg-1/60 p-3">
                    <a href={link.url} target="_blank" rel="noreferrer" className="font-semibold text-ice underline-offset-2 hover:underline">
                      텔레그램에서 열기 ↗
                    </a>
                    <p className="text-[12px] text-fg-3">
                      열리면 ‘시작(Start)’을 누르세요. 링크는 한 번만, 15분 동안 쓸 수 있습니다. 연결되면 이 화면을 새로고침하세요.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <ActionMessage state={state} />
      </div>
    </section>
  );
}
