"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import type { Beat } from "@/db/schema";
import { BEATS } from "@/lib/beats";
import { ActionButton, ActionMessage } from "@/components/admin/client";
import { btn, cx } from "@/components/admin/ui";
import { attachStory, republishArticle, setFeatured, unpublishArticle } from "@/server/actions/articles";
import type { ActionState } from "@/server/actions/result";
import { PublishState } from "./bits";
import { dateTimeKST, untilLabel } from "./labels";

const HOURS = [6, 12, 24] as const;

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const run = (fn: () => Promise<ActionState>) =>
    start(async () => {
      const res = await fn();
      setState(res);
      if (res?.ok) router.refresh();
    });
  return { pending, state, run };
}

/** 공개 상태 · Top 지정 · 스토리 연결 — the right-rail management panel. */
export function PublishControls({
  id,
  status,
  featuredUntil,
  now,
  story,
  stories,
  unpublishReason,
}: {
  id: string;
  status: "published" | "unpublished";
  featuredUntil: string | null;
  now: number;
  story: { id: string; title: string; slug: string } | null;
  stories: Array<{ id: string; title: string; beat: Beat }>;
  unpublishReason: string | null;
}) {
  const uid = useId();
  const feature = useRun();
  const link = useRun();
  const current = story?.id ?? "";
  const [storyId, setStoryId] = useState(current);
  // Follow the server value when it changes (after a save here or elsewhere).
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setStoryId(current);
  }
  const featured = featuredUntil && new Date(featuredUntil).getTime() > now ? featuredUntil : null;
  const hoursLeft = featured ? Math.max(1, Math.round((new Date(featured).getTime() - now) / 3_600_000)) : 0;
  const options = story && !stories.some((s) => s.id === story.id) ? [{ id: story.id, title: story.title, beat: null }, ...stories] : stories;

  return (
    <div className="divide-y divide-line">
      {/* 공개 상태 */}
      <div className="pb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="kicker text-fg-3">공개 상태</h3>
          <PublishState status={status} />
        </div>
        {status === "published" ? (
          <>
            <p className="mb-2.5 text-[12.5px] leading-relaxed text-fg-3">
              비공개로 돌리면 기사 페이지·목록·검색에서 즉시 내려갑니다. 버전과 정정 이력은 보존됩니다.
            </p>
            <ActionButton
              action={unpublishArticle}
              args={{ id }}
              variant="danger"
              className="w-full"
              prompt={{ message: "비공개 전환 사유를 적어 주세요 (활동 로그에 남습니다).", key: "reason" }}
            >
              비공개 전환
            </ActionButton>
          </>
        ) : (
          <>
            <p className="mb-2.5 text-[12.5px] leading-relaxed text-fg-3">
              {unpublishReason ? (
                <>
                  비공개 사유: <span className="text-fg-2">{unpublishReason}</span>
                </>
              ) : (
                "독자 화면에서 내려가 있습니다."
              )}
            </p>
            <ActionButton
              action={republishArticle}
              args={{ id }}
              variant="primary"
              className="w-full"
              confirm="이 기사를 다시 공개할까요? 원래 발행 시각 그대로 목록에 돌아갑니다."
            >
              다시 공개
            </ActionButton>
          </>
        )}
      </div>

      {/* Top 지정 */}
      <div className="py-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id={`${uid}-top`} className="kicker text-fg-3">
            홈 Top 지정
          </h3>
          {featured ? (
            <span className="tabular text-[12px] font-semibold text-ice-2" title={dateTimeKST(featured)}>
              ~{untilLabel(featured, now)} · {hoursLeft}시간 남음
            </span>
          ) : (
            <span className="text-[12px] text-fg-4">지정 안 됨</span>
          )}
        </div>
        <div role="group" aria-labelledby={`${uid}-top`} className="grid grid-cols-4 gap-1.5">
          {HOURS.map((h) => (
            <button
              key={h}
              type="button"
              disabled={feature.pending || status !== "published"}
              onClick={() => feature.run(() => setFeatured({ id, hours: h }))}
              className={cx(btn.base, btn.ghost, "h-8 gap-0 whitespace-nowrap px-0 text-[12.5px]")}
              aria-label={`지금부터 ${h}시간 Top 지정`}
            >
              <span className="tabular">{h}시간</span>
            </button>
          ))}
          <button
            type="button"
            disabled={feature.pending || !featured}
            onClick={() => feature.run(() => setFeatured({ id, hours: null }))}
            className={cx(btn.base, btn.quiet, "h-8 px-0 text-[12.5px]")}
          >
            해제
          </button>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-fg-3">
          {status === "published" ? "지정 시점부터 계산합니다. 다시 누르면 기한이 새로 잡힙니다." : "비공개 기사는 Top에 올릴 수 없습니다."}
        </p>
        <ActionMessage state={feature.state} className="mt-1.5" />
      </div>

      {/* 스토리 */}
      <form
        className="pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          link.run(() => attachStory({ id, storyId: storyId || null }));
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <label htmlFor={`${uid}-story`} className="kicker text-fg-3">
            스토리 연결
          </label>
          {story && (
            <a href={`/s/${story.slug}`} target="_blank" rel="noreferrer" className="text-[12px] text-ice hover:underline">
              스토리 보기 <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
        <div className="flex gap-1.5">
          <select
            id={`${uid}-story`}
            value={storyId}
            onChange={(e) => setStoryId(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line-2 bg-bg-1 px-2 text-[12.5px] text-fg transition-colors hover:border-line-3 focus:border-ice focus:shadow-[0_0_0_3px_var(--ice-glow)] focus:outline-none focus-visible:outline-none"
          >
            <option value="">없음</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.beat ? `[${BEATS[s.beat].label}] ` : ""}
                {s.title}
              </option>
            ))}
          </select>
          <button type="submit" disabled={link.pending || storyId === current} className={cx(btn.base, btn.ghost, "h-8 shrink-0")}>
            {link.pending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
            {story && !storyId ? "해제" : story ? "변경" : "연결"}
          </button>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-fg-3">
          {story ? (
            <>
              현재: <span className="text-fg-2">{story.title}</span>
            </>
          ) : (
            "같은 사안을 이어 보도하면 스토리 타임라인에 묶여 독자가 흐름을 따라갑니다."
          )}
        </p>
        <ActionMessage state={link.state} className="mt-1.5" />
      </form>
    </div>
  );
}
