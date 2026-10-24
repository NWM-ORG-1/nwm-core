"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Telegram Mini App glue for the newsroom bot's preview, without Telegram's
 * script: the launch data arrives in the URL fragment, and events go to the
 * app the way telegram-web-app.js sends them.
 */

function postEvent(eventType: string, eventData: Record<string, unknown> = {}) {
  try {
    const w = window as Window & { TelegramWebviewProxy?: { postEvent(type: string, data: string): void } };
    if (w.TelegramWebviewProxy?.postEvent) w.TelegramWebviewProxy.postEvent(eventType, JSON.stringify(eventData));
    else if (window.parent !== window) window.parent.postMessage(JSON.stringify({ eventType, eventData }), "https://web.telegram.org");
  } catch {}
}

/** Tells Telegram the page is ready and asks for the full height. */
export function MiniAppReady() {
  useEffect(() => {
    postEvent("web_app_ready");
    postEvent("web_app_expand");
  }, []);
  return null;
}

type GateState = { kind: "checking" } | { kind: "message"; text: string; retry: boolean };
type Exchange = { ticket: string } | { text: string; retry: boolean };

async function ticketFor(candidateId: string): Promise<Exchange> {
  const initData = new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData");
  if (!initData) return { text: "텔레그램 봇 카드의 ‘미리보기’ 버튼으로 열어야 로그인 없이 볼 수 있습니다.", retry: false };
  try {
    const res = await fetch("/api/telegram/webapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData, candidateId }),
    });
    const j = (await res.json().catch(() => ({}))) as { ticket?: string; error?: string };
    if (res.ok && j.ticket) return { ticket: j.ticket };
    return { text: j.error ?? "확인하지 못했습니다. 잠시 뒤 다시 열어 주세요.", retry: res.status >= 500 };
  } catch {
    return { text: "연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", retry: true };
  }
}

/**
 * Trades Telegram's signed launch data for a ticket to this draft, then loads
 * the preview with it. An expired ticket waits for a tap, so a page that keeps
 * failing never reloads itself in a loop.
 */
export function MiniAppGate({ candidateId, adminHref, expired }: { candidateId: string; adminHref: string; expired: boolean }) {
  const [state, setState] = useState<GateState>(expired ? { kind: "message", text: "미리보기를 연 지 한 시간이 지나 다시 확인해야 합니다.", retry: true } : { kind: "checking" });

  const settle = useCallback((r: Exchange) => {
    if ("ticket" in r) window.location.replace(`${window.location.pathname}?t=${encodeURIComponent(r.ticket)}${window.location.hash}`);
    else setState({ kind: "message", text: r.text, retry: r.retry });
  }, []);

  useEffect(() => {
    postEvent("web_app_ready");
    postEvent("web_app_expand");
    if (expired) return;
    let live = true;
    void ticketFor(candidateId).then((r) => live && settle(r));
    return () => {
      live = false;
    };
  }, [candidateId, expired, settle]);

  const retry = async () => {
    setState({ kind: "checking" });
    settle(await ticketFor(candidateId));
  };

  return (
    <div className="mx-auto max-w-[28rem] px-5 pt-16 text-center" aria-live="polite">
      {state.kind === "checking" ? (
        <p className="text-[15px] text-fg-3">텔레그램 계정을 확인하는 중…</p>
      ) : (
        <>
          <p className="text-[15px] leading-relaxed text-fg-2">{state.text}</p>
          <div className="mt-6 flex flex-col items-center gap-3">
            {state.retry && (
              <button type="button" onClick={() => void retry()} className="rounded-full border border-line-2 px-5 py-2 text-[14px] font-semibold text-fg hover:border-ice">
                다시 확인
              </button>
            )}
            <a href={adminHref} className="text-[13px] font-semibold text-ice hover:underline">
              뉴스룸에서 열기 (로그인)
            </a>
          </div>
        </>
      )}
    </div>
  );
}
