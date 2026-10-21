"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Beat } from "@/db/schema";
import { BEATS, BEAT_ORDER } from "@/lib/beats";
import { createFromIdea } from "@/server/actions/candidates";
import type { ActionState } from "@/server/actions/result";
import { btn, cx } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";
import { f } from "./shared";

const EXAMPLES: Array<{ beat: Beat; idea: string }> = [
  { beat: "economy", idea: "원화 스테이블코인 법안이 은행과 핀테크 중 누구에게 유리한지 3가지 시나리오로" },
  { beat: "ai", idea: "국산 오픈웨이트 모델 공개 한 달 — 기업 도입 사례와 실제 비용 절감 폭을 숫자로 정리" },
  { beat: "crypto", idea: "거래소 순유출이 3개월 최대인데 가격은 횡보 — 고래 지갑 흐름으로 읽는 다음 국면" },
  { beat: "tech", idea: "HBM 증설 경쟁, 장비·소재 국산화율이 어디까지 왔나 공급망 지도로" },
];

const MIN = 8;
const MAX = 1000;

export function IdeaForm({ defaultBeat }: { defaultBeat?: Beat }) {
  const router = useRouter();
  const [state, action] = useActionState<ActionState<{ id: string }>, FormData>(createFromIdea, null);
  const [idea, setIdea] = useState("");
  const [beat, setBeat] = useState<Beat>(defaultBeat ?? "economy");
  const handled = useRef<number | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  // On success open the editor, and leave a clean form behind (routes are kept hidden, not unmounted).
  useEffect(() => {
    if (!state?.ok || !state.data || handled.current === state.at) return;
    handled.current = state.at;
    router.push(`/admin/candidates/${state.data.id}`);
  }, [state, router]);

  useLayoutEffect(() => {
    return () => {
      if (handled.current != null) {
        setIdea("");
        handled.current = null;
      }
    };
  }, []);

  const len = idea.trim().length;
  const tooShort = len > 0 && len < MIN;
  const error = state && !state.ok ? state.error.replace(/^idea: /, "") : null;

  return (
    <form action={action} className="space-y-5" noValidate={false}>
      <div>
        <label htmlFor={`${id}-idea`} className={f.label}>
          기획 아이디어
          <span className={cx("tabular font-mono text-[10.5px] font-normal", len > MAX ? "text-bad" : "text-fg-4")}>
            {len}/{MAX}
          </span>
        </label>
        <textarea
          ref={textRef}
          id={`${id}-idea`}
          name="idea"
          required
          minLength={MIN}
          maxLength={MAX}
          rows={6}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="원화 스테이블코인 법안이 은행과 핀테크 중 누구에게 유리한지 3가지 시나리오로"
          aria-invalid={tooShort || undefined}
          aria-describedby={`${id}-idea-help`}
          className={cx(f.textarea, "min-h-[150px] text-[15px] leading-[1.7]")}
        />
        <p id={`${id}-idea-help`} className={cx(f.help, tooShort && "text-warn")}>
          {tooShort ? `${MIN}자 이상 적어주세요.` : "무엇을, 왜 지금, 어떤 형식으로(예: 숫자로·시나리오로·비교로) 다룰지 한두 문장으로 적습니다."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="kicker mr-1 text-fg-4">예시</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.idea}
              type="button"
              onClick={() => {
                setIdea(ex.idea);
                setBeat(ex.beat);
                textRef.current?.focus();
              }}
              title={ex.idea}
              className="max-w-full truncate rounded-md border border-line-2 px-2 py-1 text-left text-[12px] text-fg-3 transition-colors hover:border-line-3 hover:text-fg sm:max-w-[280px]"
            >
              <span className="mr-1 font-semibold text-fg-2">{BEATS[ex.beat].label}</span>
              {ex.idea}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
        <div>
          <label htmlFor={`${id}-beat`} className={f.label}>
            분야
          </label>
          <select id={`${id}-beat`} name="beat" value={beat} onChange={(e) => setBeat(e.target.value as Beat)} className={f.select}>
            {BEAT_ORDER.map((b) => (
              <option key={b} value={b}>
                {BEATS[b].label}
              </option>
            ))}
          </select>
          <p className={f.help}>{BEATS[beat].blurb}</p>
        </div>
        <div>
          <span className={f.label}>초안</span>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-2 bg-bg-1 px-3 py-2.5 hover:border-line-3">
            <input type="checkbox" name="draft" value="on" defaultChecked className={cx(f.check, "mt-0.5")} />
            <span>
              <span className="block text-[13.5px] font-semibold text-fg">AI 초안 바로 생성 (모의)</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-fg-3">
                아이디어를 바탕으로 시그널·왜 중요한가·다음 관전 포인트 뼈대를 채워 ‘작성중’으로 엽니다. 끄면 빈 초안으로 ‘신규’에 둡니다.
              </span>
            </span>
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-bad/40 bg-bad/[0.07] px-3 py-2 text-[12.5px] text-fg-2">
          <span className="font-semibold text-bad">만들지 못했습니다</span> — {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Submit disabled={len < MIN || len > MAX} />
        <p className="text-[12px] text-fg-3">만든 뒤 바로 편집기로 이동합니다. 담당자는 나로 지정됩니다.</p>
      </div>
    </form>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className={cx(btn.base, btn.primary, "h-9 px-4")}>
      {pending ? (
        <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      ) : (
        <Icon name="spark" size={14} />
      )}
      {pending ? "만드는 중…" : "후보 만들기"}
    </button>
  );
}
