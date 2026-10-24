"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Telegram Mini App glue for the newsroom bot's preview, without Telegram's
 * script: the launch data arrives in the URL fragment, and events go to the
 * app the way telegram-web-app.js sends them.
 *
 * Nothing that opens a draft stays in the address: the launch data moves to
 * this tab's sessionStorage as soon as the page reads it, and the ticket is
 * taken off the address once the preview has loaded. A copied address opens
 * nothing; a reload in the same tab trades the stored launch data again.
 */

const INIT_KEY = "nwm.tg.init";
const TRIES_KEY = "nwm.tg.tries";

function postEvent(eventType: string, eventData: Record<string, unknown> = {}) {
  try {
    const w = window as Window & { TelegramWebviewProxy?: { postEvent(type: string, data: string): void } };
    if (w.TelegramWebviewProxy?.postEvent) w.TelegramWebviewProxy.postEvent(eventType, JSON.stringify(eventData));
    else if (window.parent !== window) window.parent.postMessage(JSON.stringify({ eventType, eventData }), "https://web.telegram.org");
  } catch {}
}

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Tells Telegram the page is ready, asks for the full height, and takes the ticket off the address. */
export function MiniAppReady() {
  useEffect(() => {
    postEvent("web_app_ready");
    postEvent("web_app_expand");
    session()?.removeItem(TRIES_KEY);
    history.replaceState(null, "", window.location.pathname);
  }, []);
  return null;
}

/** The launch data from the address (moved into this tab's storage) or from an earlier load in this tab. */
function takeInitData(): string | null {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData");
  const store = session();
  if (fromHash) {
    store?.setItem(INIT_KEY, fromHash);
    history.replaceState(null, "", window.location.pathname + window.location.search);
    return fromHash;
  }
  return store?.getItem(INIT_KEY) ?? null;
}

/** at most three trades a minute, so a page the server keeps refusing cannot reload itself in a loop */
function mayTry(): boolean {
  const store = session();
  if (!store) return true;
  const now = Date.now();
  let prev: { n: number; at: number } | null = null;
  try {
    prev = JSON.parse(store.getItem(TRIES_KEY) ?? "null") as { n: number; at: number } | null;
  } catch {}
  const tries = prev && now - prev.at < 60_000 ? { n: prev.n + 1, at: prev.at } : { n: 1, at: now };
  store.setItem(TRIES_KEY, JSON.stringify(tries));
  return tries.n <= 3;
}

type GateState = { kind: "checking" } | { kind: "message"; text: string; retry: boolean; newWindow?: boolean };
type Exchange = { go: string } | { text: string; retry: boolean; newWindow?: boolean };
export type MiniAppMode = "preview" | "edit";

const BUTTON: Record<MiniAppMode, string> = { preview: "미리보기", edit: "편집기" };

async function signIn(candidateId: string, mode: MiniAppMode, initData: string | null, auto: boolean): Promise<Exchange> {
  if (!initData) return { text: `로그인 없이 열려면 텔레그램 봇 카드의 ‘${BUTTON[mode]}’ 버튼으로 다시 열어 주세요.`, retry: false };
  // the newsroom refuses to be framed; Telegram Web shows Mini Apps in a frame
  if (mode === "edit" && window.top !== window.self) return { text: "텔레그램 웹에서는 편집기를 이 안에서 열 수 없습니다. 새 창에서 로그인해 여세요.", retry: false, newWindow: true };
  if (auto && !mayTry()) return { text: "확인이 거듭 실패했습니다. 잠시 뒤 다시 시도해 주세요.", retry: true };
  try {
    const res = await fetch("/api/telegram/webapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData, candidateId, mode }),
    });
    const j = (await res.json().catch(() => ({}))) as { ticket?: string; next?: string; error?: string };
    if (res.ok && mode === "preview" && j.ticket) return { go: `${window.location.pathname}?t=${encodeURIComponent(j.ticket)}` };
    if (res.ok && mode === "edit" && j.next?.startsWith("/admin/")) return { go: j.next };
    // refused launch data (too old, another bot) is of no further use
    if (res.status === 401) session()?.removeItem(INIT_KEY);
    return { text: j.error ?? "확인하지 못했습니다. 잠시 뒤 다시 열어 주세요.", retry: res.status >= 500 };
  } catch {
    return { text: "연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", retry: true };
  }
}

/**
 * Trades Telegram's signed launch data for a way in: a ticket that loads this
 * draft's preview, or (편집기) a newsroom session, then the editor.
 */
export function MiniAppGate({ candidateId, adminHref, mode = "preview" }: { candidateId: string; adminHref: string; mode?: MiniAppMode }) {
  const [state, setState] = useState<GateState>({ kind: "checking" });

  const settle = useCallback((r: Exchange) => {
    if ("go" in r) window.location.replace(r.go);
    else setState({ kind: "message", text: r.text, retry: r.retry, newWindow: r.newWindow });
  }, []);

  useEffect(() => {
    postEvent("web_app_ready");
    postEvent("web_app_expand");
    let live = true;
    void signIn(candidateId, mode, takeInitData(), true).then((r) => live && settle(r));
    return () => {
      live = false;
    };
  }, [candidateId, mode, settle]);

  const retry = async () => {
    setState({ kind: "checking" });
    settle(await signIn(candidateId, mode, takeInitData(), false));
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
            <a href={adminHref} {...(state.newWindow ? { target: "_blank", rel: "noreferrer" } : {})} className="text-[13px] font-semibold text-ice hover:underline">
              뉴스룸에서 열기 (로그인)
            </a>
          </div>
        </>
      )}
    </div>
  );
}
