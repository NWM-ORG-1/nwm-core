"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useId,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { Beat } from "@/db/schema";
import { BeatChip } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";
import { LocalTime } from "@/components/ui/LocalTime";
import { BEATS, BEAT_ORDER } from "@/lib/beats";
import { createStory } from "@/server/actions/candidates";
import { updateStory } from "@/server/actions/dashboard-extra";
import type { ActionState } from "@/server/actions/result";
import { ActionMessage } from "../client";
import { Badge, btn, cx } from "../ui";
import { STORY_STATUS } from "./labels";
import { field, small } from "./parts";

export type StoryStatus = "developing" | "settled";

export interface StoryView {
  id: string;
  slug: string;
  title: string;
  summary: string;
  beat: Beat;
  status: StoryStatus;
  articleCount: number;
  openCandidates: number;
  lastPublishedAt: string | null;
  isSample: boolean;
}

const TITLE_MAX = 80;
const SUMMARY_MAX = 300;

/* ───────────────────────────── list ───────────────────────────── */

type Filter = "all" | StoryStatus;

export function StoryList({ stories }: { stories: StoryView[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const counts = {
    all: stories.length,
    developing: stories.filter((s) => s.status === "developing").length,
    settled: stories.filter((s) => s.status === "settled").length,
  };
  const needle = q.trim().toLowerCase();
  const shown = stories.filter(
    (s) => (filter === "all" || s.status === filter) && (!needle || s.title.toLowerCase().includes(needle) || s.summary.toLowerCase().includes(needle)),
  );

  return (
    <section className="panel min-w-0 overflow-hidden" aria-labelledby="stories-title">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        <h2 id="stories-title" className="kicker mr-auto text-fg-2">
          스토리 목록
        </h2>
        <div role="group" aria-label="상태 필터" className="flex rounded-lg border border-line-2 p-0.5">
          {(["all", "developing", "settled"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cx(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-semibold transition-colors",
                filter === f ? "bg-bg-3 text-fg" : "text-fg-3 hover:text-fg",
              )}
            >
              {f === "all" ? "전체" : STORY_STATUS[f].label}
              <span className="tabular font-mono text-[11px] text-fg-3">{counts[f]}</span>
            </button>
          ))}
        </div>
        <label className="relative block w-full sm:w-52">
          <span className="sr-only">스토리 검색</span>
          <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="제목·요약 검색"
            className={field.search}
          />
        </label>
      </div>

      <div
        className="hidden grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_6.5rem_4.5rem_5.5rem] gap-3 border-b border-line px-4 py-2 text-[11.5px] font-semibold text-fg-3 md:grid"
        aria-hidden="true"
      >
        <span>스토리</span>
        <span>비트</span>
        <span className="text-right">기사</span>
        <span className="pl-2">최근 발행</span>
        <span>상태</span>
        <span />
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-14 text-center text-[13px] text-fg-3">
          {stories.length === 0 ? "아직 스토리가 없습니다. 오른쪽 양식으로 첫 스토리를 만드세요." : "조건에 맞는 스토리가 없습니다."}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((s) => (
            <StoryRow
              key={s.id}
              story={s}
              editing={editingId === s.id}
              onEdit={() => setEditingId(s.id)}
              onClose={() => setEditingId((cur) => (cur === s.id ? null : cur))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ───────────────────────────── row ───────────────────────────── */

interface Draft {
  title: string;
  summary: string;
  status: StoryStatus;
}

function StoryRow({ story, editing, onEdit, onClose }: { story: StoryView; editing: boolean; onEdit: () => void; onClose: () => void }) {
  const router = useRouter();
  const uid = useId();
  const editBtn = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<Draft>({ title: story.title, summary: story.summary, status: story.status });
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  // While the save is in flight, show the edited values in place and close the form.
  const [view, setView] = useOptimistic({ story, editing }, (cur, patch: { story: StoryView; editing: boolean }) => patch);

  const open = () => {
    setDraft({ title: story.title, summary: story.summary, status: story.status });
    setError(null);
    onEdit();
  };
  const cancel = () => {
    setError(null);
    onClose();
    requestAnimationFrame(() => editBtn.current?.focus());
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      setView({ story: { ...story, ...draft, title: draft.title.trim(), summary: draft.summary.trim() }, editing: false });
      const res = await updateStory({ id: story.id, ...draft });
      startTransition(() => {
        if (res?.ok) {
          onClose();
          router.refresh();
        } else {
          setError(res?.error ?? "저장하지 못했습니다.");
        }
      });
    });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  const s = view.story;
  const st = STORY_STATUS[s.status];

  if (view.editing) {
    const titleLeft = TITLE_MAX - draft.title.length;
    return (
      <li className="bg-bg-1/60 px-4 py-4">
        <form onSubmit={save} onKeyDown={onKeyDown} aria-label={`${story.title} 편집`} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
            <BeatChip beat={story.beat} />
            <span className="font-mono text-fg-4">/s/{story.slug}</span>
            <span className="text-fg-4">· 주소는 바뀌지 않습니다</span>
          </div>
          <div>
            <label htmlFor={`${uid}-title`} className="flex items-baseline justify-between">
              <span className={field.label}>제목</span>
              <span className={cx("tabular font-mono text-[11px]", titleLeft < 0 ? "text-bad" : "text-fg-4")}>
                {draft.title.length}/{TITLE_MAX}
              </span>
            </label>
            <input
              id={`${uid}-title`}
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              required
              minLength={2}
              maxLength={TITLE_MAX}
              autoFocus
              disabled={saving}
              className={cx(field.input, "font-semibold")}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-summary`} className="flex items-baseline justify-between">
              <span className={field.label}>요약</span>
              <span className="tabular font-mono text-[11px] text-fg-4">
                {draft.summary.length}/{SUMMARY_MAX}
              </span>
            </label>
            <textarea
              id={`${uid}-summary`}
              value={draft.summary}
              onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
              maxLength={SUMMARY_MAX}
              rows={3}
              disabled={saving}
              placeholder="스토리 페이지 상단에 표시되는 한두 문장 요약"
              className={field.textarea}
            />
          </div>
          <fieldset>
            <legend className={field.label}>상태</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["developing", "settled"] as const).map((v) => (
                <label
                  key={v}
                  className={cx(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[1.5px] has-[:focus-visible]:outline-ice",
                    draft.status === v ? "border-ice/50 bg-bg-2" : "border-line-2 hover:border-line-3",
                  )}
                >
                  <input
                    type="radio"
                    name={`${uid}-status`}
                    value={v}
                    checked={draft.status === v}
                    onChange={() => setDraft((d) => ({ ...d, status: v }))}
                    disabled={saving}
                    className="mt-0.5 accent-[var(--ice)]"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-fg">{STORY_STATUS[v].label}</span>
                    <span className="block text-[11.5px] leading-snug text-fg-3">{STORY_STATUS[v].hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" disabled={saving || draft.title.trim().length < 2} className={cx(btn.base, btn.primary)}>
              {saving && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
              저장
            </button>
            <button type="button" onClick={cancel} disabled={saving} className={cx(btn.base, btn.quiet)}>
              취소
            </button>
            <span className="hidden text-[11.5px] text-fg-4 sm:inline">Esc로 닫기</span>
            {error && (
              <p role="alert" className="ml-auto text-[12.5px] font-medium text-bad">
                {error}
              </p>
            )}
          </div>
        </form>
      </li>
    );
  }

  return (
    <li
      className={cx(
        "group grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-bg-2/50 md:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_6.5rem_4.5rem_5.5rem] md:items-center",
        saving && "opacity-70",
      )}
      aria-busy={saving || undefined}
    >
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 md:hidden">
          <BeatChip beat={s.beat} />
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <p className="flex items-center gap-2 text-[14px] font-semibold leading-snug text-fg">
          <span className="min-w-0 truncate">{s.title}</span>
          {s.isSample && <Badge title="샘플 데이터">샘플</Badge>}
        </p>
        {s.summary ? (
          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-3 md:line-clamp-1">{s.summary}</p>
        ) : (
          <p className="mt-0.5 text-[12.5px] italic text-fg-4">요약 없음</p>
        )}
        <p className="tabular mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-fg-3 md:hidden">
          <span>기사 {s.articleCount}건</span>
          {s.openCandidates > 0 && <span className="text-ice-2">작업 중 후보 {s.openCandidates}</span>}
          <span>최근 발행 {s.lastPublishedAt ? <LocalTime iso={s.lastPublishedAt} mode="full" /> : "—"}</span>
        </p>
        {s.openCandidates > 0 && <p className="tabular mt-1 hidden text-[11.5px] text-fg-3 md:block">작업 중 후보 {s.openCandidates}건</p>}
      </div>

      <span className="hidden md:block">
        <BeatChip beat={s.beat} />
      </span>
      <span className="tabular hidden text-right font-mono text-[13px] text-fg-2 md:block">{s.articleCount}</span>
      <span className="tabular hidden pl-2 text-[12px] text-fg-3 md:block">{s.lastPublishedAt ? <LocalTime iso={s.lastPublishedAt} /> : "—"}</span>
      <span className="hidden md:block">
        <Badge tone={st.tone}>{st.label}</Badge>
      </span>

      <div className="flex items-start justify-end gap-0.5 md:items-center">
        <button
          ref={editBtn}
          type="button"
          onClick={open}
          disabled={saving}
          aria-label={`${s.title} 편집`}
          className={small.text}
        >
          편집
        </button>
        <a
          href={`/s/${s.slug}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`${s.title} 공개 페이지 새 탭에서 열기`}
          title={`/s/${s.slug}`}
          className={small.icon}
        >
          <Icon name="external" size={14} />
        </a>
      </div>
    </li>
  );
}

/* ───────────────────────────── create ───────────────────────────── */

type CreateState = { res: ActionState<{ id: string; slug: string }>; key: number };

export function CreateStoryForm() {
  const uid = useId();
  const [expanded, setExpanded] = useState(false);
  const [{ res, key }, action, pending] = useActionState<CreateState, FormData>(
    async (prev, fd) => {
      const summary = String(fd.get("summary") ?? "").trim();
      const r = await createStory({ title: String(fd.get("title") ?? ""), beat: String(fd.get("beat") ?? ""), summary: summary || undefined });
      return { res: r, key: r?.ok ? prev.key + 1 : prev.key };
    },
    { res: null, key: 0 },
  );
  const [msgVisible, setMsgVisible] = useState(true);

  // Don't greet a returning editor with a stale "created" message.
  useLayoutEffect(() => {
    return () => setMsgVisible(false);
  }, []);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsgVisible(true);
    startTransition(() => action(fd));
  };

  return (
    <section className="panel overflow-hidden xl:sticky xl:top-6" aria-labelledby={`${uid}-h`}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 id={`${uid}-h`} className="kicker text-fg-2">
          새 스토리
        </h2>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`${uid}-form`}
          className={cx(small.text, "xl:hidden")}
        >
          {expanded ? "접기" : "열기"}
          <Icon name="chevronDown" size={14} className={cx("transition-transform", expanded && "rotate-180")} />
        </button>
      </div>
      <form id={`${uid}-form`} onSubmit={submit} className={cx("space-y-3.5 p-4", expanded ? "block" : "hidden", "xl:block")}>
        <div key={key} className="space-y-3.5">
          <div>
            <label htmlFor={`${uid}-title`} className={field.label}>
              제목
            </label>
            <input
              id={`${uid}-title`}
              name="title"
              required
              minLength={2}
              maxLength={TITLE_MAX}
              placeholder="예: 한빛반도체 차세대 HBM 공급전"
              className={field.input}
              disabled={pending}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-beat`} className={field.label}>
              비트
            </label>
            <select id={`${uid}-beat`} name="beat" defaultValue="ai" className={field.input} disabled={pending}>
              {BEAT_ORDER.map((b) => (
                <option key={b} value={b}>
                  {BEATS[b].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-summary`} className={field.label}>
              요약 <span className="font-normal text-fg-4">(선택)</span>
            </label>
            <textarea
              id={`${uid}-summary`}
              name="summary"
              maxLength={SUMMARY_MAX}
              rows={3}
              placeholder="무엇을 추적하는 스토리인지 한두 문장으로"
              className={field.textarea}
              disabled={pending}
            />
          </div>
        </div>
        <p className="text-[11.5px] leading-snug text-fg-3">새 스토리는 ‘진행중’으로 시작합니다. 후보 편집기에서 기사를 스토리에 연결하면 공개 스토리 페이지에 묶여 표시됩니다.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={cx(btn.base, btn.primary)}>
            {pending ? (
              <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
            ) : (
              <Icon name="plus" size={14} strokeWidth={2.2} />
            )}
            스토리 만들기
          </button>
          {msgVisible && <ActionMessage state={res} />}
        </div>
      </form>
    </section>
  );
}
