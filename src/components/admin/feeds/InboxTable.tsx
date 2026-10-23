"use client";

import Link from "next/link";
import {
  Fragment,
  startTransition,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import type { getInbox } from "@/data/admin";
import { Badge, btn, cx, ExperimentDot, LicenseIcons, ScoreBar, TrustBadge } from "@/components/admin/ui";
import { BeatChip } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";
import { dateTimeKST } from "@/lib/format";
import { SOURCE_KIND_LABEL } from "@/lib/labels";
import type { SourceKind } from "@/db/schema";
import { dismissItems, promoteItems, restoreItems } from "@/server/actions/feeds";
import { Kbd, th } from "./bits";
import { DISMISS_PRESETS, LANG_LABEL, PROMOTE_MODE_LABEL, type InboxStatus, type PromoteMode } from "./labels";
import { Stamp } from "./time";

export type InboxItem = Awaited<ReturnType<typeof getInbox>>["items"][number];

type Result =
  | { tone: "ok"; kind: "promote"; message: string; candidateIds: string[] }
  | { tone: "ok"; kind: "dismiss"; message: string; ids: string[] }
  | { tone: "ok"; kind: "restore"; message: string }
  | { tone: "error"; message: string };

const MAX_BATCH = 50;
const NO_IDS: ReadonlySet<string> = new Set();

function isTypingTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !["checkbox", "radio", "button", "submit", "reset"].includes((t as HTMLInputElement).type);
  return false;
}

/** Layout-independent letter (works with the Korean IME on). */
function letter(e: KeyboardEvent) {
  if (e.code?.startsWith("Key")) return e.code.slice(3).toLowerCase();
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

export function InboxTable({ items, tab }: { items: InboxItem[]; tab: InboxStatus }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_IDS);
  const [cursor, setCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(NO_IDS);
  const [mode, setMode] = useState<PromoteMode>("feed_draft");
  const [dismissOpen, setDismissOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const [processing, markProcessing] = useOptimistic<ReadonlySet<string>, string[]>(NO_IDS, (cur, ids) => new Set([...cur, ...ids]));

  const uid = useId(); // detail-row ids stay unique when Activity keeps another inbox view mounted
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<string | null>(null);
  const shiftRef = useRef(false);
  const titleRefs = useRef(new Map<string, HTMLButtonElement>());

  // Transient UI closes when Activity hides this route; stale results are cleared.
  useLayoutEffect(() => {
    return () => {
      setDismissOpen(false);
      setResult(null);
    };
  }, []);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const selectable = (i: InboxItem) => i.status !== "promoted";
  const sel = useMemo(() => items.filter((i) => selected.has(i.id) && i.status !== "promoted"), [items, selected]);
  const selNew = sel.filter((i) => i.status === "new");
  const selDismissed = sel.filter((i) => i.status === "dismissed");
  const signalOnly = selNew.filter((i) => i.source.signalOnly);
  const unreviewed = selNew.filter((i) => !i.source.signalOnly && !i.source.licReviewed);
  const selectableIds = items.filter(selectable).map((i) => i.id);
  const allOn = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someOn = sel.length > 0;

  /* ─────────────── selection ─────────────── */

  function toggle(id: string, range: boolean) {
    const anchor = anchorRef.current;
    setSelected((prev) => {
      const next = new Set(prev);
      const turnOn = !prev.has(id);
      if (range && anchor && anchor !== id && byId.has(anchor)) {
        const a = items.findIndex((i) => i.id === anchor);
        const b = items.findIndex((i) => i.id === id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        for (const it of items.slice(lo, hi + 1)) {
          if (!selectable(it)) continue;
          if (turnOn) next.add(it.id);
          else next.delete(it.id);
        }
      } else if (turnOn) next.add(id);
      else next.delete(id);
      return next;
    });
    anchorRef.current = id;
  }

  function toggleAll() {
    setSelected(allOn ? NO_IDS : new Set(selectableIds));
  }

  function clearSelection() {
    setSelected(NO_IDS);
    setDismissOpen(false);
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function moveCursor(delta: number) {
    if (!items.length) return;
    const idx = cursor ? items.findIndex((i) => i.id === cursor) : -1;
    const nextIdx = idx < 0 ? (delta > 0 ? 0 : items.length - 1) : Math.max(0, Math.min(items.length - 1, idx + delta));
    const id = items[nextIdx].id;
    setCursor(id);
    const el = titleRefs.current.get(id);
    if (el) {
      el.focus({ preventScroll: true });
      el.closest("tr")?.scrollIntoView({ block: "nearest" });
    }
  }

  /* ─────────────── actions ─────────────── */

  function promote(merge: boolean, ids: string[] = selNew.map((i) => i.id)) {
    if (!ids.length || pending) return;
    if (ids.length > MAX_BATCH) {
      setResult({ tone: "error", message: `한 번에 ${MAX_BATCH}건까지 승격할 수 있습니다.` });
      return;
    }
    start(async () => {
      markProcessing(ids);
      const res = await promoteItems({ ids, merge, mode, draft: true });
      startTransition(() => {
        if (res?.ok) {
          setSelected(NO_IDS);
          setDismissOpen(false);
          setResult({ tone: "ok", kind: "promote", message: res.message ?? "승격했습니다.", candidateIds: res.data?.candidateIds ?? [] });
        } else setResult({ tone: "error", message: res?.error ?? "승격하지 못했습니다." });
      });
    });
  }

  function dismiss(why: string) {
    const r = why.trim();
    const ids = selNew.map((i) => i.id);
    if (!r || !ids.length || pending) return;
    start(async () => {
      markProcessing(ids);
      const res = await dismissItems({ ids, reason: r.slice(0, 120) });
      startTransition(() => {
        if (res?.ok) {
          setSelected(NO_IDS);
          setDismissOpen(false);
          setReason("");
          setResult({ tone: "ok", kind: "dismiss", message: `${ids.length}건을 기각했습니다 — ${r}`, ids });
        } else setResult({ tone: "error", message: res?.error ?? "기각하지 못했습니다." });
      });
    });
  }

  function restore(ids: string[]) {
    if (!ids.length || pending) return;
    start(async () => {
      markProcessing(ids);
      const res = await restoreItems({ ids });
      startTransition(() => {
        if (res?.ok) {
          setSelected(NO_IDS);
          setResult({ tone: "ok", kind: "restore", message: `${ids.length}건을 인박스로 되돌렸습니다.` });
        } else setResult({ tone: "error", message: res?.error ?? "되돌리지 못했습니다." });
      });
    });
  }

  function openDismiss(forId?: string) {
    if (forId) {
      setSelected(new Set([forId]));
      anchorRef.current = forId;
    }
    setDismissOpen(true);
  }

  /* ─────────────── keyboard ─────────────── */

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;
    const root = rootRef.current;
    if (!root || root.offsetParent === null) return; // hidden route copy
    const k = letter(e);
    const cur = cursor ? byId.get(cursor) : undefined;

    if (k === "Escape") {
      if (dismissOpen) setDismissOpen(false);
      else if (someOn) clearSelection();
      else return;
      e.preventDefault();
      return;
    }
    if (e.shiftKey) return;
    switch (k) {
      case "j":
        e.preventDefault();
        moveCursor(1);
        break;
      case "k":
        e.preventDefault();
        moveCursor(-1);
        break;
      case "x":
        e.preventDefault();
        if (!cur) moveCursor(1);
        else if (selectable(cur)) toggle(cur.id, false);
        break;
      case "p": {
        e.preventDefault();
        if (selNew.length) promote(false);
        else if (cur?.status === "new") promote(false, [cur.id]);
        break;
      }
      case "d":
        e.preventDefault();
        if (selNew.length) openDismiss();
        else if (cur?.status === "new") openDismiss(cur.id);
        break;
      case "Enter": {
        // Buttons and links keep their native Enter.
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "BUTTON" || t.tagName === "A")) return;
        if (cur) {
          e.preventDefault();
          toggleExpanded(cur.id);
        }
        break;
      }
    }
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* ─────────────── render ─────────────── */

  const showBar = someOn || result != null;

  return (
    <div ref={rootRef}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 pb-2.5">
        <p className="text-[12.5px] text-fg-3">
          <span className="tabular font-semibold text-fg-2">{items.length}</span>건 표시
          {items.length >= 150 && <span className="ml-1.5 text-warn">· 최근 150건까지만 보여줍니다. 필터를 좁혀 보세요.</span>}
        </p>
        <p className="hidden items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-3 md:flex md:flex-wrap" aria-label="키보드 단축키">
          <span className="inline-flex items-center gap-1">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd> 이동
          </span>
          {tab !== "promoted" && (
            <>
              <span className="inline-flex items-center gap-1">
                <Kbd>X</Kbd> 선택
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>⇧</Kbd>+클릭 범위
              </span>
            </>
          )}
          {(tab === "new" || tab === "all") && (
            <>
              <span className="inline-flex items-center gap-1">
                <Kbd>P</Kbd> 승격
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>D</Kbd> 기각
              </span>
            </>
          )}
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd> 펼치기
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Esc</Kbd> 해제
          </span>
        </p>
      </div>

      <div className="panel relative overflow-hidden">
        <table className="w-full border-collapse text-left text-[13px]">
          <caption className="sr-only">피드 항목 목록. J와 K로 이동하고 X로 선택합니다.</caption>
          <thead className="bg-bg-1/40">
            <tr>
              <th scope="col" className={cx(th, "w-10 pr-0")}>
                <input
                  type="checkbox"
                  aria-label={allOn ? "전체 선택 해제" : "표시된 항목 전체 선택"}
                  className="size-4 accent-[var(--ice)]"
                  checked={allOn}
                  disabled={!selectableIds.length}
                  ref={(el) => {
                    if (el) el.indeterminate = someOn && !allOn;
                  }}
                  onChange={toggleAll}
                />
              </th>
              <th scope="col" className={cx(th, "hidden w-[92px] lg:table-cell")}>
                점수
              </th>
              <th scope="col" className={cx(th, "hidden w-[210px] md:table-cell")}>
                소스
              </th>
              <th scope="col" className={th}>
                항목
              </th>
              <th scope="col" className={cx(th, "hidden w-[84px] lg:table-cell")}>
                비트
              </th>
              <th scope="col" className={cx(th, "hidden w-[108px] md:table-cell")}>
                수집
              </th>
              <th scope="col" className={cx(th, "hidden w-[150px] md:table-cell")}>
                상태
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const isSel = selected.has(it.id) && selectable(it);
              const isCur = cursor === it.id;
              const isOpen = expanded.has(it.id);
              const busy = processing.has(it.id);
              const detailId = `${uid}-detail-${it.id}`;
              return (
                <Fragment key={it.id}>
                  <tr
                    onClick={() => setCursor(it.id)}
                    data-selected={isSel || undefined}
                    className={cx(
                      "scroll-mt-4 scroll-mb-32 transition-[background-color,opacity]",
                      isSel ? "bg-ice/[0.07]" : "hover:bg-bg-2/60",
                      busy && "pointer-events-none opacity-45",
                    )}
                  >
                    <td className={cx("w-10 select-none border-b border-line py-3 pl-3 pr-0 align-top", isCur && "shadow-[inset_2px_0_0_var(--ice)]")}>
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-[var(--ice)] disabled:opacity-30"
                        checked={isSel}
                        disabled={!selectable(it)}
                        aria-label={`선택: ${it.title}`}
                        onClick={(e) => {
                          shiftRef.current = e.shiftKey;
                        }}
                        onChange={() => {
                          toggle(it.id, shiftRef.current);
                          shiftRef.current = false;
                        }}
                      />
                    </td>
                    <td className="hidden border-b border-line px-3 py-3 align-top lg:table-cell">
                      <ScoreBar score={it.score} />
                    </td>
                    <td className="hidden border-b border-line px-3 py-3 align-top md:table-cell">
                      <SourceCell item={it} />
                    </td>
                    <td className="border-b border-line px-3 py-3 align-top">
                      <button
                        type="button"
                        ref={(el) => {
                          if (!el) return;
                          titleRefs.current.set(it.id, el);
                          return () => {
                            titleRefs.current.delete(it.id);
                          };
                        }}
                        onFocus={() => setCursor(it.id)}
                        onClick={() => toggleExpanded(it.id)}
                        aria-expanded={isOpen}
                        aria-controls={isOpen ? detailId : undefined}
                        className="group flex w-full items-start gap-1.5 rounded-md text-left"
                      >
                        <Icon
                          name="chevronRight"
                          size={14}
                          className={cx("mt-[3px] shrink-0 text-fg-4 transition-transform group-hover:text-fg-2", isOpen && "rotate-90 text-fg-2")}
                        />
                        <span className="text-[14px] font-semibold leading-snug text-fg group-hover:text-ice-2">{it.title}</span>
                      </button>
                      {it.summary && <p className="mt-1 line-clamp-1 pl-5 text-[12.5px] leading-relaxed text-fg-3">{it.summary}</p>}
                      {it.entities.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1 pl-5" aria-label="엔티티">
                          {it.entities.slice(0, 5).map((e) => (
                            <li key={e} className="rounded-md bg-bg-2 px-1.5 py-[1px] text-[11px] font-medium text-fg-2">
                              {e}
                            </li>
                          ))}
                          {it.entities.length > 5 && <li className="px-1 text-[11px] text-fg-3">+{it.entities.length - 5}</li>}
                        </ul>
                      )}
                      {/* compact meta for narrow screens */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pl-5 text-[11.5px] text-fg-3 md:hidden">
                        <ScoreBar score={it.score} />
                        <span className="font-semibold text-fg-2">{it.source.name}</span>
                        {it.experiment && <ExperimentDot code={it.experiment.code} colorSlot={it.experiment.colorSlot} />}
                        {it.beatGuess && <BeatChip beat={it.beatGuess} />}
                        {(it.source.signalOnly || !it.source.licReviewed) && (
                          <LicenseIcons
                            commercialOk={it.source.licCommercialOk}
                            redistributionOk={it.source.licRedistributionOk}
                            verbatimOk={it.source.licVerbatimOk}
                            reviewed={it.source.licReviewed}
                            signalOnly={it.source.signalOnly}
                          />
                        )}
                        <Stamp iso={it.fetchedAt} inline />
                        {(tab !== "new" || it.status !== "new") && <StatusCell item={it} compact />}
                      </div>
                    </td>
                    <td className="hidden border-b border-line px-3 py-3 align-top lg:table-cell">
                      {it.beatGuess ? <BeatChip beat={it.beatGuess} /> : <span className="text-[11.5px] text-fg-4">미분류</span>}
                    </td>
                    <td className="hidden border-b border-line px-3 py-3 align-top md:table-cell">
                      <Stamp iso={it.fetchedAt} />
                    </td>
                    <td className="hidden border-b border-line px-3 py-3 align-top md:table-cell">
                      <StatusCell item={it} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr id={detailId} className="bg-bg-1/70">
                      <td colSpan={7} className={cx("border-b border-line px-4 py-4 md:pl-[52px]", isCur && "shadow-[inset_2px_0_0_var(--ice)]")}>
                        <ItemDetail
                          item={it}
                          busy={pending}
                          onPromote={() => promote(false, [it.id])}
                          onDismiss={() => openDismiss(it.id)}
                          onRestore={() => restore([it.id])}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {showBar && (
        <div className="sticky bottom-3 z-20 mt-3">
          <div
            role="region"
            aria-label="선택한 항목 작업"
            className="rounded-xl border border-line-2 bg-bg-1/95 px-3 py-2.5 shadow-[var(--shadow-pop)] backdrop-blur-md"
          >
            {someOn && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-[13px] font-semibold text-fg">
                  <span className="tabular">{sel.length}</span>건 선택
                  {selDismissed.length > 0 && selNew.length > 0 && (
                    <span className="ml-1.5 text-[12px] font-normal text-fg-3">
                      (새 항목 {selNew.length} · 기각 {selDismissed.length})
                    </span>
                  )}
                </p>

                {(signalOnly.length > 0 || unreviewed.length > 0) && (
                  <p className="flex flex-wrap items-center gap-1.5 text-[12px]" role="note">
                    {signalOnly.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-warn/10 px-1.5 py-0.5 font-medium text-warn">
                        <Icon name="alert" size={13} />
                        신호 전용 소스는 재작성·인용 금지 ({signalOnly.length})
                      </span>
                    )}
                    {unreviewed.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-bad/10 px-1.5 py-0.5 font-medium text-bad">
                        <Icon name="alert" size={13} />
                        라이선스 미검토 소스 포함 — 발행 전 1차 자료 확인 ({unreviewed.length})
                      </span>
                    )}
                  </p>
                )}

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {selNew.length > 0 && (
                    <>
                      <label className="inline-flex items-center gap-1.5 text-[12px] text-fg-3">
                        작성 모드
                        <select
                          value={mode}
                          onChange={(e) => setMode(e.target.value as PromoteMode)}
                          className="h-8 rounded-lg border border-line-2 bg-bg-1 px-2 text-[12.5px] font-medium text-fg focus:border-ice focus:shadow-[0_0_0_3px_var(--ice-glow)] focus-visible:outline-none"
                        >
                          {(Object.keys(PROMOTE_MODE_LABEL) as PromoteMode[]).map((m) => (
                            <option key={m} value={m}>
                              {PROMOTE_MODE_LABEL[m]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="button" className={cx(btn.base, btn.primary)} disabled={pending} onClick={() => promote(false)}>
                        {pending ? <Spinner /> : null}
                        개별 승격 <span className="tabular">{selNew.length}</span>
                      </button>
                      <button
                        type="button"
                        className={cx(btn.base, btn.ghost)}
                        disabled={pending || selNew.length < 2}
                        title={selNew.length < 2 ? "두 건 이상 선택해야 묶을 수 있습니다" : "첫 번째 항목을 주 자료로 1건의 후보를 만듭니다"}
                        onClick={() => promote(true)}
                      >
                        <Icon name="layers" size={14} />
                        묶어서 1건으로 승격
                      </button>
                      <button
                        type="button"
                        className={cx(btn.base, btn.danger)}
                        disabled={pending}
                        aria-expanded={dismissOpen}
                        onClick={() => setDismissOpen((o) => !o)}
                      >
                        기각…
                      </button>
                    </>
                  )}
                  {selDismissed.length > 0 && (
                    <button type="button" className={cx(btn.base, btn.ghost)} disabled={pending} onClick={() => restore(selDismissed.map((i) => i.id))}>
                      {pending ? <Spinner /> : <Icon name="arrowLeft" size={14} />}
                      인박스로 되돌리기 <span className="tabular">{selDismissed.length}</span>
                    </button>
                  )}
                  <button type="button" className={cx(btn.base, btn.quiet, "px-2")} onClick={clearSelection} aria-label="선택 해제">
                    <Icon name="close" size={15} />
                  </button>
                </div>
              </div>
            )}

            {someOn && dismissOpen && selNew.length > 0 && (
              <form
                className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  dismiss(reason);
                }}
              >
                <span className="kicker text-fg-3">기각 사유</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="자주 쓰는 사유">
                  {DISMISS_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={pending}
                      onClick={() => dismiss(p)}
                      className="h-7 rounded-full border border-line-2 px-2.5 text-[12px] font-medium text-fg-2 transition-colors hover:border-bad/50 hover:text-bad disabled:opacity-40"
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <label className="flex min-w-[200px] flex-1 items-center">
                  <span className="sr-only">직접 입력한 기각 사유</span>
                  <input
                    autoFocus
                    value={reason}
                    maxLength={120}
                    onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setDismissOpen(false);
                      }
                    }}
                    placeholder="직접 입력 (예: 이미 보도됨)"
                    className="h-8 w-full rounded-lg border border-line-2 bg-bg px-2.5 text-[12.5px] text-fg placeholder:text-fg-4 focus:border-ice focus:shadow-[0_0_0_3px_var(--ice-glow)] focus-visible:outline-none"
                  />
                </label>
                <button type="submit" disabled={pending || !reason.trim()} className={cx(btn.base, btn.danger)}>
                  {pending ? <Spinner /> : null}
                  <span>
                    <span className="tabular">{selNew.length}</span>건 기각
                  </span>
                </button>
                <button type="button" className={cx(btn.base, btn.quiet)} onClick={() => setDismissOpen(false)}>
                  취소
                </button>
              </form>
            )}

            {result && (
              <div
                role={result.tone === "ok" ? "status" : "alert"}
                className={cx("flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]", someOn && "mt-2.5 border-t border-line pt-2.5")}
              >
                <span className={cx("inline-flex items-center gap-1.5 font-semibold", result.tone === "ok" ? "text-good" : "text-bad")}>
                  <Icon name={result.tone === "ok" ? "check" : "alert"} size={14} />
                  {result.message}
                </span>
                {result.tone === "ok" && result.kind === "promote" && result.candidateIds.length > 0 && (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {result.candidateIds.slice(0, 6).map((cid, n) => (
                      <Link
                        key={cid}
                        href={`/admin/candidates/${cid}`}
                        className="inline-flex h-6 items-center gap-1 rounded-md border border-ice/30 px-1.5 font-mono text-[11.5px] text-fg-2 hover:border-ice hover:text-fg"
                      >
                        후보 {result.candidateIds.length > 1 ? n + 1 : ""}
                        <span className="text-fg-3">#{cid.slice(0, 6)}</span>
                        <Icon name="arrowRight" size={12} />
                      </Link>
                    ))}
                    {result.candidateIds.length > 6 && <span className="text-fg-3">외 {result.candidateIds.length - 6}건</span>}
                    <Link href="/admin/candidates" className="ml-1 text-fg-3 underline-offset-2 hover:text-fg hover:underline">
                      후보 보드
                    </Link>
                  </span>
                )}
                {result.tone === "ok" && result.kind === "dismiss" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => restore(result.ids)}
                    className="font-semibold text-fg-2 underline underline-offset-2 hover:text-fg disabled:opacity-40"
                  >
                    실행 취소
                  </button>
                )}
                <button type="button" onClick={() => setResult(null)} className={cx(btn.base, btn.quiet, "ml-auto h-7 px-1.5")} aria-label="알림 닫기">
                  <Icon name="close" size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "new" && !showBar && items.length > 0 && (
        <p className="mt-3 px-1 text-[12px] text-fg-4">항목을 선택하면 승격·기각 작업 바가 나타납니다.</p>
      )}
    </div>
  );
}

function Spinner() {
  return <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />;
}

function SourceCell({ item }: { item: InboxItem }) {
  const s = item.source;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[12.5px] font-semibold text-fg-2" title={s.name}>
          {s.name}
        </span>
        {item.experiment && (
          <span className="shrink-0 whitespace-nowrap">
            <ExperimentDot code={item.experiment.code} colorSlot={item.experiment.colorSlot} />
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <TrustBadge tier={s.trustTier} />
        <LicenseIcons
          commercialOk={s.licCommercialOk}
          redistributionOk={s.licRedistributionOk}
          verbatimOk={s.licVerbatimOk}
          reviewed={s.licReviewed}
          signalOnly={s.signalOnly}
        />
      </div>
    </div>
  );
}

/** The AI desk's call on this item, with its reason on hover. */
function DeskTag({ desk }: { desk: NonNullable<InboxItem["desk"]> }) {
  const [text, tone] =
    desk.decision === "draft"
      ? desk.drafted
        ? ([`AI 초안 ${desk.score}`, "good"] as const)
        : ([`AI 대기 ${desk.score}`, "ice"] as const)
      : desk.decision === "hold"
        ? (["AI 보류", "warn"] as const)
        : (["AI 제외", "neutral"] as const);
  return (
    <Badge tone={tone} title={`AI 데스크: ${desk.reason}`}>
      {text}
    </Badge>
  );
}

function StatusCell({ item, compact = false }: { item: InboxItem; compact?: boolean }) {
  const desk = item.desk ? <DeskTag desk={item.desk} /> : null;
  if (item.status === "promoted") {
    return (
      <span className={cx("inline-flex gap-1.5", compact ? "items-center" : "flex-col items-start")}>
        <Badge tone="good">승격됨</Badge>
        {desk}
        {item.candidateId && (
          <Link
            href={`/admin/candidates/${item.candidateId}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-fg-2 underline-offset-2 hover:text-fg hover:underline"
          >
            후보 열기
            <Icon name="arrowRight" size={12} />
          </Link>
        )}
      </span>
    );
  }
  if (item.status === "dismissed") {
    return (
      <span className={cx("inline-flex gap-1", compact ? "items-center" : "flex-col items-start")}>
        <Badge>기각</Badge>
        {item.dismissedReason && <span className="text-[12px] leading-snug text-fg-3">{item.dismissedReason}</span>}
      </span>
    );
  }
  return (
    <span className={cx("inline-flex gap-1.5", compact ? "items-center" : "flex-col items-start")}>
      <Badge tone="ice">새 항목</Badge>
      {desk}
    </span>
  );
}

function ItemDetail({
  item,
  busy,
  onPromote,
  onDismiss,
  onRestore,
}: {
  item: InboxItem;
  busy: boolean;
  onPromote: () => void;
  onDismiss: () => void;
  onRestore: () => void;
}) {
  const s = item.source;
  const payload = JSON.stringify(item.payload ?? {}, null, 2);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <section>
          <h3 className="kicker mb-1.5 text-fg-3">요약 전문</h3>
          <p className="text-[13.5px] leading-relaxed text-fg-2">{item.summary || "요약 없음"}</p>
        </section>
        {item.entities.length > 0 && (
          <section>
            <h3 className="kicker mb-1.5 text-fg-3">엔티티</h3>
            <ul className="flex flex-wrap gap-1">
              {item.entities.map((e) => (
                <li key={e} className="rounded-md border border-line-2 px-1.5 py-[1px] text-[11.5px] font-medium text-fg-2">
                  {e}
                </li>
              ))}
            </ul>
          </section>
        )}
        <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12.5px]">
          <dt className="text-fg-3">원문</dt>
          <dd className="min-w-0">
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1 text-fg-2 underline-offset-2 hover:text-fg hover:underline">
                <span className="truncate font-mono text-[12px]">{item.url}</span>
                <Icon name="external" size={12} className="shrink-0" />
              </a>
            ) : (
              <span className="text-fg-4">링크 없음 (데이터 피드)</span>
            )}
          </dd>
          <dt className="text-fg-3">소스</dt>
          <dd className="text-fg-2">
            {s.name} · {SOURCE_KIND_LABEL[s.kind as SourceKind] ?? s.kind}
          </dd>
          <dt className="text-fg-3">게시</dt>
          <dd className="tabular text-fg-2">{item.publishedAt ? dateTimeKST(item.publishedAt) : "—"}</dd>
          <dt className="text-fg-3">수집</dt>
          <dd className="tabular text-fg-2">{dateTimeKST(item.fetchedAt)}</dd>
          <dt className="text-fg-3">언어</dt>
          <dd className="text-fg-2">{LANG_LABEL[item.lang] ?? item.lang}</dd>
          <dt className="text-fg-3">이용 조건</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <LicenseIcons
              commercialOk={s.licCommercialOk}
              redistributionOk={s.licRedistributionOk}
              verbatimOk={s.licVerbatimOk}
              reviewed={s.licReviewed}
              signalOnly={s.signalOnly}
            />
            {s.licRetentionDays != null && <span className="text-[12px] text-fg-3">보관 {s.licRetentionDays}일</span>}
          </dd>
        </dl>
        {s.signalOnly && (
          <p className="flex gap-2 rounded-lg border border-warn/30 bg-warn/[0.06] px-3 py-2 text-[12.5px] leading-relaxed text-fg-2">
            <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-warn" />
            신호 전용 소스입니다. 문장을 재작성하거나 인용하지 말고, 1차 자료를 직접 확인하는 단서로만 쓰세요.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {item.status === "new" && (
            <>
              <button type="button" className={cx(btn.base, btn.primary)} disabled={busy} onClick={onPromote}>
                이 항목만 승격
              </button>
              <button type="button" className={cx(btn.base, btn.danger)} disabled={busy} onClick={onDismiss}>
                기각…
              </button>
            </>
          )}
          {item.status === "dismissed" && (
            <button type="button" className={cx(btn.base, btn.ghost)} disabled={busy} onClick={onRestore}>
              인박스로 되돌리기
            </button>
          )}
          {item.status === "promoted" && item.candidateId && (
            <Link href={`/admin/candidates/${item.candidateId}`} className={cx(btn.base, btn.ghost)}>
              후보 열기 <Icon name="arrowRight" size={13} />
            </Link>
          )}
        </div>
      </div>
      <section className="min-w-0">
        <h3 className="mb-1.5 flex items-center justify-between">
          <span className="kicker text-fg-3">페이로드</span>
          <span className="hud text-fg-4">JSON</span>
        </h3>
        <pre className="max-h-80 overflow-auto rounded-lg border border-line bg-bg-2/70 p-3 font-mono text-[11.5px] leading-relaxed text-fg-2">
          {payload}
        </pre>
        <p className="mt-1.5 font-mono text-[10.5px] text-fg-4">id {item.id}</p>
      </section>
    </div>
  );
}
