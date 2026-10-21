"use client";

import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useState, useTransition, type DragEvent } from "react";
import type { Beat, CandidateMode, CandidateStatus } from "@/db/schema";
import { BEAT_ORDER } from "@/lib/beats";
import { CANDIDATE_MODE_LABEL, CANDIDATE_STATUS_LABEL } from "@/lib/labels";
import { clockKST, dateKST } from "@/lib/format";
import { moveCandidate, rejectCandidate } from "@/server/actions/candidates";
import { BeatChip } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";
import { cx, ExperimentDot, ModeBadge } from "@/components/admin/ui";
import { ReasonDialog } from "./ReasonDialog";
import { BOARD_COLUMNS, MODE_CODE, type BoardCard, type MoveTarget } from "./shared";
import { Ago } from "./time";

const DRAG_TYPE = "application/x-nwm-candidate";
const MODES: CandidateMode[] = ["feed_draft", "data_auto", "editor_idea"];
const MOVE_OPTIONS: MoveTarget[] = ["new", "drafting", "review", "rejected"];

type Notice = { tone: "good" | "bad" | "info"; text: string; href?: string; hrefLabel?: string } | null;
type Move = { id: string; status: CandidateStatus };

export function KanbanBoard({ cards }: { cards: BoardCard[] }) {
  const [optimistic, applyMove] = useOptimistic(cards, (state: BoardCard[], m: Move) =>
    state.map((c) => (c.id === m.id ? { ...c, status: m.status, scheduledAt: m.status === "scheduled" ? c.scheduledAt : null } : c)),
  );
  const [, startTransition] = useTransition();
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [beats, setBeats] = useState<ReadonlySet<Beat>>(new Set());
  const [modes, setModes] = useState<ReadonlySet<CandidateMode>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [rejecting, setRejecting] = useState<BoardCard | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectPending, setRejectPending] = useState(false);

  // success notices fade; errors stay until replaced
  useEffect(() => {
    if (!notice || notice.tone === "bad") return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const visible = useMemo(
    () => optimistic.filter((c) => (beats.size === 0 || beats.has(c.beat)) && (modes.size === 0 || modes.has(c.mode))),
    [optimistic, beats, modes],
  );
  const filtering = beats.size > 0 || modes.size > 0;
  const byStatus = (s: CandidateStatus, list: BoardCard[]) => list.filter((c) => c.status === s);

  const setPending = (id: string, on: boolean) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const run = (card: BoardCard, status: MoveTarget, reason?: string) =>
    new Promise<boolean>((resolve) => {
      startTransition(async () => {
        applyMove({ id: card.id, status });
        setPending(card.id, true);
        const res = status === "rejected" ? await rejectCandidate({ id: card.id, reason: reason ?? "" }) : await moveCandidate({ id: card.id, status });
        setPending(card.id, false);
        if (res?.ok) {
          setNotice({ tone: "good", text: `‘${short(card.title)}’ → ${CANDIDATE_STATUS_LABEL[status]}` });
          resolve(true);
        } else {
          setNotice({ tone: "bad", text: `이동하지 못했습니다 — ${res?.error ?? "알 수 없는 오류"}` });
          resolve(false);
        }
      });
    });

  const requestMove = (card: BoardCard, status: CandidateStatus) => {
    if (status === card.status || card.status === "published") return;
    if (status === "scheduled") {
      setNotice({ tone: "info", text: "예약은 편집기에서 설정합니다 — 체크를 통과해야 예약할 수 있습니다.", href: `/admin/candidates/${card.id}`, hrefLabel: "편집기 열기" });
      return;
    }
    if (status === "published") return;
    if (status === "rejected") {
      setRejectError(null);
      setRejecting(card);
      return;
    }
    if (card.status === "scheduled" && !window.confirm(`예약을 취소하고 ‘${CANDIDATE_STATUS_LABEL[status]}’로 옮길까요?`)) return;
    void run(card, status);
  };

  const confirmReject = async (reason: string) => {
    if (!rejecting) return;
    setRejectPending(true);
    const card = rejecting;
    const ok = await run(card, "rejected", reason);
    setRejectPending(false);
    if (ok) setRejecting(null);
    else setRejectError("반려하지 못했습니다. 다시 시도하세요.");
  };

  /* ───────── drag & drop ───────── */

  const findCard = (id: string | null) => (id ? optimistic.find((c) => c.id === id) : undefined);

  const onDragStart = (e: DragEvent, card: BoardCard) => {
    e.dataTransfer.setData(DRAG_TYPE, card.id);
    e.dataTransfer.setData("text/plain", card.title);
    e.dataTransfer.effectAllowed = "move";
    setDragId(card.id);
  };
  const onDragEnd = () => {
    setDragId(null);
    setOver(null);
  };
  const dropProps = (target: CandidateStatus) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (over !== target) setOver(target);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === target ? null : o));
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const card = findCard(e.dataTransfer.getData(DRAG_TYPE));
      setOver(null);
      setDragId(null);
      if (card) requestMove(card, target);
    },
  });

  const dragging = findCard(dragId);
  const rejected = byStatus("rejected", visible);
  const published = byStatus("published", visible);

  const toggle = <T,>(set: ReadonlySet<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  return (
    <div className="space-y-4">
      {/* filters */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <FilterGroup label="분야">
          {BEAT_ORDER.map((b) => (
            <Chip key={b} on={beats.has(b)} onClick={() => setBeats((s) => toggle(s, b))} count={optimistic.filter((c) => c.beat === b && isOpen(c.status)).length}>
              <BeatChip beat={b} />
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label="방식">
          {MODES.map((m) => (
            <Chip key={m} on={modes.has(m)} onClick={() => setModes((s) => toggle(s, m))} count={optimistic.filter((c) => c.mode === m && isOpen(c.status)).length}>
              <span className="font-mono text-[11px] font-bold text-fg-3">{MODE_CODE[m]}</span>
              <span>{CANDIDATE_MODE_LABEL[m].short}</span>
            </Chip>
          ))}
        </FilterGroup>
        {filtering && (
          <button
            type="button"
            onClick={() => {
              setBeats(new Set());
              setModes(new Set());
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-fg-3 hover:bg-bg-2 hover:text-fg"
          >
            <Icon name="close" size={12} /> 필터 해제
          </button>
        )}
        <p className="ml-auto hidden items-center gap-1.5 text-[11.5px] text-fg-4 lg:flex">
          <Icon name="info" size={13} /> 카드를 끌어 단계를 옮기거나, 각 카드의 ‘이동’ 메뉴를 쓰세요.
        </p>
      </div>

      {/* fixed toast: a notice must never shift the cards under the pointer */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex justify-center sm:inset-x-auto sm:right-5 sm:bottom-5 sm:justify-end">
        {notice && (
          <p
            role={notice.tone === "bad" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex w-full max-w-md flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-bg-1 px-3.5 py-2.5 text-[12.5px] text-fg-2 shadow-[var(--shadow-pop)] animate-rise",
              notice.tone === "good" && "border-good/40",
              notice.tone === "bad" && "border-bad/50",
              notice.tone === "info" && "border-ice/40",
              dragId && "opacity-0",
            )}
          >
            <Icon name={notice.tone === "bad" ? "alert" : notice.tone === "good" ? "check" : "info"} size={14} className={notice.tone === "bad" ? "text-bad" : notice.tone === "good" ? "text-good" : "text-ice"} />
            <span className="min-w-0 flex-1">{notice.text}</span>
            {notice.href && (
              <Link href={notice.href} className="font-semibold text-ice hover:underline">
                {notice.hrefLabel} →
              </Link>
            )}
            <button type="button" onClick={() => setNotice(null)} aria-label="알림 닫기" className="grid size-6 place-items-center rounded text-fg-3 hover:bg-bg-2 hover:text-fg">
              <Icon name="close" size={12} />
            </button>
          </p>
        )}
      </div>

      {/* columns */}
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 xl:mx-0 xl:grid xl:grid-cols-4 xl:overflow-visible xl:px-0 xl:pb-0">
        {BOARD_COLUMNS.map((col) => {
          const list = byStatus(col.key, visible);
          const total = byStatus(col.key, optimistic).length;
          const isOver = over === col.key;
          const scheduleHint = col.key === "scheduled" && isOver;
          return (
            <section
              key={col.key}
              aria-labelledby={`col-${col.key}`}
              className="flex w-[min(300px,82vw)] shrink-0 snap-start flex-col xl:w-auto"
            >
              <header className="mb-2 flex items-baseline justify-between gap-2 px-1">
                <h2 id={`col-${col.key}`} className="flex items-baseline gap-2 text-[13.5px] font-bold text-fg">
                  {col.label}
                  <span className="tabular font-mono text-[11.5px] font-medium text-fg-3">
                    {filtering ? `${list.length}/${total}` : total}
                  </span>
                </h2>
                <span className="truncate text-[11px] text-fg-4">{col.hint}</span>
              </header>
              <div
                {...dropProps(col.key)}
                className={cx(
                  "relative flex min-h-[180px] flex-1 flex-col gap-2 rounded-[var(--radius)] border p-2 transition-colors",
                  isOver && col.key !== "scheduled" ? "border-ice/60 bg-ice/[0.05]" : "border-line bg-bg-1/40",
                  scheduleHint && "border-dashed border-warn/50 bg-warn/[0.04]",
                )}
              >
                {list.map((c) => (
                  <CandidateCard
                    key={c.id}
                    card={c}
                    pending={pendingIds.has(c.id)}
                    dragging={dragId === c.id}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onMove={requestMove}
                  />
                ))}
                {list.length === 0 && (
                  <p className="grid flex-1 place-items-center px-3 py-6 text-center text-[12px] leading-relaxed text-fg-4">
                    {filtering && total > 0 ? "필터에 맞는 후보가 없습니다" : col.key === "scheduled" ? "예약된 후보 없음" : "후보 없음"}
                  </p>
                )}
                {scheduleHint && (
                  <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-bg/80 p-4 text-center text-[12.5px] font-medium text-warn backdrop-blur-[1px]">
                    예약은 편집기에서 설정
                    <span className="mt-1 block text-[11.5px] font-normal text-fg-3">발행 시각과 체크를 확인한 뒤 예약합니다</span>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* closed lanes */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Lane title="반려 · 최근 24시간" count={rejected.length} hint="반려 사유는 카드에 남습니다. ‘이동’으로 되살릴 수 있습니다." empty="반려된 후보가 없습니다">
          {rejected.map((c) => (
            <CandidateCard key={c.id} card={c} pending={pendingIds.has(c.id)} dragging={dragId === c.id} onDragStart={onDragStart} onDragEnd={onDragEnd} onMove={requestMove} compact />
          ))}
        </Lane>
        <Lane title="발행 · 최근 24시간" count={published.length} hint="발행된 후보는 편집기에서 읽기 전용으로 열립니다." empty="최근 24시간 동안 발행된 후보가 없습니다">
          {published.map((c) => (
            <CandidateCard key={c.id} card={c} pending={false} dragging={false} onDragStart={onDragStart} onDragEnd={onDragEnd} onMove={requestMove} compact />
          ))}
        </Lane>
      </div>

      {/* reject drop target — appears while dragging */}
      {dragging && dragging.status !== "published" && dragging.status !== "rejected" && (
        <div
          {...dropProps("rejected")}
          className={cx(
            "fixed inset-x-4 bottom-5 z-50 mx-auto flex h-16 max-w-md items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-[13.5px] font-semibold shadow-[var(--shadow-pop)] backdrop-blur-md transition-colors animate-rise",
            over === "rejected" ? "border-bad bg-bad/20 text-bad" : "border-bad/50 bg-bg-1/90 text-bad/90",
          )}
        >
          <Icon name="close" size={16} /> 여기에 놓으면 반려 — 사유를 묻습니다
        </div>
      )}

      <ReasonDialog
        open={rejecting != null}
        title="후보 반려"
        description={rejecting ? `‘${short(rejecting.title, 40)}’ — 사유는 활동 로그와 카드에 남습니다.` : undefined}
        placeholder="예: 72시간 내 같은 내용 기사가 이미 발행됨"
        confirmLabel="반려"
        pending={rejectPending}
        error={rejectError}
        onCancel={() => {
          if (!rejectPending) setRejecting(null);
        }}
        onConfirm={confirmReject}
      />
    </div>
  );
}

const isOpen = (s: CandidateStatus) => s === "new" || s === "drafting" || s === "review" || s === "scheduled";
const short = (t: string, n = 28) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={`${label} 필터`} className="flex flex-wrap items-center gap-1.5">
      <span className="kicker mr-1 text-fg-4">{label}</span>
      {children}
    </div>
  );
}

function Chip({ on, onClick, count, children }: { on: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
        on ? "border-ice/60 bg-ice/10 text-fg" : "border-line-2 text-fg-3 hover:border-line-3 hover:text-fg",
      )}
    >
      {children}
      <span className="tabular font-mono text-[10.5px] text-fg-4">{count}</span>
    </button>
  );
}

function Lane({ title, count, hint, empty, children }: { title: string; count: number; hint: string; empty: string; children: React.ReactNode }) {
  return (
    <details className="group panel overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 hover:bg-bg-2/50 [&::-webkit-details-marker]:hidden">
        <Icon name="chevronRight" size={14} className="text-fg-3 transition-transform group-open:rotate-90" />
        <span className="text-[13.5px] font-bold text-fg">{title}</span>
        <span className="tabular font-mono text-[11.5px] text-fg-3">{count}</span>
        <span className="ml-auto hidden truncate text-[11.5px] text-fg-4 sm:block">{hint}</span>
      </summary>
      <div className="grid gap-2 border-t border-line p-2 sm:grid-cols-2">
        {count === 0 ? <p className="px-2 py-4 text-[12px] text-fg-4 sm:col-span-2">{empty}</p> : children}
      </div>
    </details>
  );
}

function CandidateCard({
  card: c,
  pending,
  dragging,
  compact = false,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  card: BoardCard;
  pending: boolean;
  dragging: boolean;
  compact?: boolean;
  onDragStart: (e: DragEvent, c: BoardCard) => void;
  onDragEnd: () => void;
  onMove: (c: BoardCard, s: CandidateStatus) => void;
}) {
  const movable = c.status !== "published";
  const wasRejected = c.aiNote?.startsWith("반려: ") ?? false;
  const rejectReason = c.status === "rejected" && wasRejected ? c.aiNote!.slice(4) : null;
  const note = c.status === "rejected" ? null : c.aiNote;
  const noteLabel = wasRejected ? "이전 반려 사유" : "AI 메모";
  const pr = Math.max(0, Math.min(100, c.priority));

  return (
    <article
      draggable={movable && !pending}
      onDragStart={(e) => onDragStart(e, c)}
      onDragEnd={onDragEnd}
      aria-busy={pending || undefined}
      className={cx(
        "group/card relative rounded-xl border bg-bg-1 px-3 pb-2.5 pt-3 transition-[border-color,opacity,background-color]",
        "border-line-2 hover:border-line-3 hover:bg-bg-2/60 focus-within:border-line-3",
        movable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
        pending && "opacity-70",
      )}
    >
      {/* row 1: mode · beat · flags · priority */}
      <div className="flex items-center gap-2">
        <ModeBadge mode={c.mode} />
        <BeatChip beat={c.beat} />
        {note && (
          <span className="group/note relative z-10 inline-flex" tabIndex={0} aria-label={`${noteLabel}: ${note}`}>
            <Icon name={wasRejected ? "info" : "alert"} size={14} className={wasRejected ? "text-fg-3" : "text-warn"} />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 hidden w-60 -translate-x-1/2 rounded-lg border border-line-2 bg-bg-1 px-2.5 py-2 text-[11.5px] leading-relaxed text-fg-2 shadow-[var(--shadow-pop)] group-hover/note:block group-focus/note:block"
            >
              <span className={cx("kicker mb-0.5 block", wasRejected ? "text-fg-3" : "text-warn")}>{noteLabel}</span>
              {wasRejected ? note.slice(4) : note}
            </span>
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5" title={`우선순위 ${c.priority}`}>
          <span className="relative h-[3px] w-7 overflow-hidden rounded-full bg-bg-3" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 rounded-full bg-ice" style={{ width: `${Math.max(6, pr)}%`, opacity: 0.35 + pr / 160 }} />
          </span>
          <span className="tabular font-mono text-[11px] text-fg-3">
            <span className="sr-only">우선순위 </span>
            {c.priority}
          </span>
        </span>
      </div>

      {/* title — stretched link covers the card */}
      <h3 className="mt-2 text-[14px] font-semibold leading-snug tracking-[-0.01em] text-fg">
        <Link
          href={`/admin/candidates/${c.id}`}
          draggable={false}
          className="line-clamp-2 outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:outline focus-visible:after:outline-[1.5px] focus-visible:after:outline-offset-2 focus-visible:after:outline-ice"
        >
          {c.title}
        </Link>
      </h3>
      {c.storyTitle && <p className="mt-1 truncate text-[11.5px] text-fg-3">스토리 · {c.storyTitle}</p>}
      {rejectReason && <p className="mt-1 line-clamp-2 text-[11.5px] text-bad">반려 사유 · {rejectReason}</p>}

      {c.status === "scheduled" && c.scheduledAt && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-ice/30 bg-ice/[0.06] px-2 py-0.5 text-[11.5px] font-medium text-fg-2">
          <Icon name="clock" size={12} className="text-ice" />
          예약 <span className="tabular">{dateKST(c.scheduledAt)} {clockKST(c.scheduledAt)}</span>
        </p>
      )}

      {/* row: checks · items · experiment */}
      {!compact && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-3">
          {c.checks.total === 0 ? (
            <span className="text-fg-4">체크 전</span>
          ) : (
            <span className="inline-flex items-center gap-1" title={`체크 ${c.checks.passed}/${c.checks.total} 통과`}>
              <Icon name="check" size={12} className={c.checks.passed === c.checks.total ? "text-good" : "text-fg-3"} />
              <span className="tabular font-mono">
                {c.checks.passed}/{c.checks.total}
              </span>
              {c.checks.blocking > 0 && <span className="font-semibold text-bad">· 필수 {c.checks.blocking}건 미통과</span>}
            </span>
          )}
          <span className="inline-flex items-center gap-1" title="연결된 원천 자료">
            <Icon name="layers" size={12} />
            <span className="tabular">자료 {c.itemCount}</span>
          </span>
          {c.experiment && <ExperimentDot code={c.experiment.code} colorSlot={c.experiment.colorSlot} />}
        </div>
      )}

      {/* footer: assignee · age · move */}
      <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2 text-[11.5px] text-fg-3">
        <span className={cx("truncate", c.assignee ? "text-fg-2" : "text-fg-4")}>{c.assignee ?? "미배정"}</span>
        <span aria-hidden="true" className="text-fg-4">
          ·
        </span>
        <Ago iso={c.createdAt} className="tabular shrink-0" />
        {c.status === "published" && c.articleSlug ? (
          <a
            href={`/a/${c.articleSlug}`}
            target="_blank"
            rel="noreferrer"
            className="relative z-10 ml-auto inline-flex items-center gap-1 font-semibold text-ice hover:underline"
          >
            기사 보기 <Icon name="arrowUpRight" size={12} />
          </a>
        ) : movable ? (
          <label className="relative z-10 ml-auto inline-flex items-center gap-1">
            <span className="sr-only">‘{c.title}’ 단계 이동</span>
            <span aria-hidden="true" className="kicker text-fg-4">
              이동
            </span>
            <select
              value={c.status}
              disabled={pending}
              onChange={(e) => onMove(c, e.target.value as CandidateStatus)}
              className="h-6 cursor-pointer rounded-md border border-line-2 bg-bg-1 pl-1.5 pr-1 text-[11.5px] text-fg-2 hover:border-line-3 focus:border-ice focus:outline-none disabled:opacity-50"
            >
              {c.status === "scheduled" && <option value="scheduled">예약됨</option>}
              {MOVE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === "rejected" && s !== c.status ? "반려…" : CANDIDATE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {pending && <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-ice border-t-transparent" aria-label="이동 중" />}
      </div>
    </article>
  );
}
