"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import type { Beat, CheckResult } from "@/db/schema";
import { blockSchema, draftSchema, sourceRefSchema, type Block, type BlockType, type Draft, type SourceRef } from "@/lib/content/blocks";
import { BEATS, BEAT_ORDER } from "@/lib/beats";
import { CANDIDATE_MODE_LABEL } from "@/lib/labels";
import { clockKST, dateKST } from "@/lib/format";
import { assignCandidate, createStory, publishNow, rejectCandidate, runCandidateChecks, saveDraft } from "@/server/actions/candidates";
import { peekCandidate } from "@/server/actions/candidates-extra";
import { btn, cx, ExperimentDot, ModeBadge, StatusBadge } from "@/components/admin/ui";
import { BeatChip } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";
import type { PreviewArticle } from "./ArticlePreview";
import { AssistPanel } from "./AssistPanel";
import { BlockList, commaList, lines, newKey, type KeyedBlock } from "./BlockEditor";
import { checkSummary, ChecklistPanel } from "./ChecklistPanel";
import { collectIssues, issuesUnder, type FieldIssue } from "./issues";
import { PreviewPanel } from "./PreviewPanel";
import { PublishPanel, type Publishing } from "./PublishPanel";
import { ReasonDialog } from "./ReasonDialog";
import { aiInvolvementOf, bylineOf, clockSecKST, f, SOURCE_KIND_KO, type CandidateBundle, type CheckLabels } from "./shared";

/* ───────────────────────────── model ───────────────────────────── */

type Meta = Omit<Draft, "blocks">;
interface Doc {
  meta: Meta;
  blocks: KeyedBlock[];
  beat: Beat;
  storyId: string | null;
  priority: number;
}
interface Saved {
  draft: Draft;
  beat: Beat;
  storyId: string | null;
  priority: number;
}
type Tab = "assist" | "checks" | "preview" | "publish";

function docFrom(draft: Draft, beat: Beat, storyId: string | null, priority: number): Doc {
  const { blocks, ...meta } = draft;
  return { meta, blocks: blocks.map((block) => ({ key: newKey(), block })), beat, storyId, priority };
}
const toDraft = (d: Doc): Draft => ({ ...d.meta, blocks: d.blocks.map((b) => b.block) });

/** Stable JSON (sorted keys, undefined dropped) — Postgres jsonb reorders keys. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}
const sameSaved = (a: Saved, b: Saved) => a.beat === b.beat && a.storyId === b.storyId && a.priority === b.priority && canon(a.draft) === canon(b.draft);

/** Local override of a server prop; falls back to the prop as soon as the server sends a new value. */
function useOverride<T>(prop: T) {
  const [o, setO] = useState<{ base: T; value: T } | null>(null);
  const value = o && Object.is(o.base, prop) ? o.value : prop;
  const set = useCallback((v: T) => setO({ base: prop, value: v }), [prop]);
  return [value, set] as const;
}

const SENTENCES = /(?<=[.!?。])\s+|(?<=다\.)\s*/;
const sentenceCount = (t: string) => t.split(SENTENCES).filter((s) => s.trim()).length;

/* ───────────────────────────── editor ───────────────────────────── */

export function CandidateEditor({ bundle, checkLabels, sources }: { bundle: CandidateBundle; checkLabels: CheckLabels; sources: ReactNode }) {
  const c = bundle.candidate;
  const id = c.id;
  const uid = useId();
  const router = useRouter();

  /* local working copy */
  const [st, setSt] = useState(() => ({ doc: docFrom(c.draft, c.beat, c.storyId, c.priority), rev: 0, gen: 0 }));
  const doc = st.doc;
  const edit = useCallback((fn: (d: Doc) => Doc) => setSt((s) => ({ ...s, doc: fn(s.doc), rev: s.rev + 1 })), []);
  const setMeta = useCallback((patch: Partial<Meta>) => edit((d) => ({ ...d, meta: { ...d.meta, ...patch } })), [edit]);

  const draft = useMemo(() => toDraft(doc), [doc]);
  const validation = useMemo(() => draftSchema.safeParse(draft), [draft]);
  const issues = useMemo(() => collectIssues(validation.success ? undefined : validation.error), [validation]);
  const invalid = !validation.success;

  /* server-backed state */
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const readOnly = c.status === "published" || publishedSlug != null;
  const [checks, setChecks] = useOverride<CheckResult[]>(c.checks);
  const [assignee, setAssignee] = useOverride<string | null>(c.assigneeId);
  const [usedAi, setUsedAi] = useState(false);
  const [extraStories, setExtraStories] = useState<Array<{ id: string; title: string; beat: Beat }>>([]);

  /* ───────── autosave ───────── */
  const lockRef = useRef(c.lockVersion);
  const savedRevRef = useRef(0);
  const lastSaved = useRef<Saved>({ draft: c.draft, beat: c.beat, storyId: c.storyId, priority: c.priority });
  const inflight = useRef<Promise<boolean> | null>(null);
  const latest = useRef(st);
  const readOnlyRef = useRef(readOnly);
  const conflictRef = useRef(false);
  // A content save voids the legal sign-off and un-schedules a scheduled piece on the
  // server; while either is in effect, pull the new server state after each save.
  const derivedRef = useRef(false);
  const [savedRev, setSavedRev] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string>(c.updatedAt);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const dirty = st.rev !== savedRev;

  useLayoutEffect(() => {
    latest.current = st;
    readOnlyRef.current = readOnly;
    derivedRef.current = c.status === "scheduled" || checks.some((x) => x.id === "legal" && x.ok);
  });

  const persist = useCallback(
    async (snap: { doc: Doc; rev: number }, payload: Saved): Promise<boolean> => {
      for (let attempt = 0; ; attempt++) {
        const res = await saveDraft({ id, lockVersion: lockRef.current, ...payload });
        if (res?.ok && res.data) {
          lockRef.current = res.data.lockVersion;
          lastSaved.current = payload;
          savedRevRef.current = snap.rev;
          setSavedRev(snap.rev);
          setSavedAt(res.data.savedAt);
          setSaveError(null);
          if (derivedRef.current) router.refresh();
          return true;
        }
        if (res && !res.ok && res.code === "conflict") {
          if (attempt === 0) {
            // The version moved. If the stored copy is still what we last saved
            // (a schedule / move / reject bumped it), adopt the new version and retry.
            const peek = await peekCandidate({ id });
            if (peek?.ok && peek.data && peek.data.status !== "published" && sameSaved(peek.data, lastSaved.current)) {
              lockRef.current = peek.data.lockVersion;
              continue;
            }
          }
          conflictRef.current = true;
          setConflict(true);
          return false;
        }
        setSaveError(res && !res.ok ? res.error : "저장하지 못했습니다.");
        return false;
      }
    },
    [id, router],
  );

  /** Save now if there are unsaved, valid changes. Resolves true when the server has the latest copy. */
  const flush = useCallback(async (): Promise<boolean> => {
    for (;;) {
      if (inflight.current) {
        await inflight.current;
        continue;
      }
      if (conflictRef.current || readOnlyRef.current) return false;
      const snap = latest.current;
      if (snap.rev === savedRevRef.current) return true;
      const parsed = draftSchema.safeParse(toDraft(snap.doc));
      if (!parsed.success) return false;
      const payload: Saved = { draft: parsed.data, beat: snap.doc.beat, storyId: snap.doc.storyId, priority: snap.doc.priority };
      const run = (async () => {
        setSaving(true);
        try {
          return await persist(snap, payload);
        } catch {
          setSaveError("네트워크 오류로 저장하지 못했습니다.");
          return false;
        } finally {
          setSaving(false);
        }
      })();
      inflight.current = run;
      const ok = await run;
      inflight.current = null;
      if (!ok) return false;
      if (latest.current.rev === snap.rev) return true;
      // more edits arrived while saving — go round again
    }
  }, [persist]);

  /**
   * Before publish / schedule: save, then confirm the stored copy is the one this
   * editor reviewed (a status-only version bump is adopted). Returns the version
   * to act on, or null (conflict / invalid / save failed).
   */
  const prepare = useCallback(async (): Promise<number | null> => {
    if (!(await flush())) return null;
    const peek = await peekCandidate({ id });
    if (!peek?.ok || !peek.data) return null;
    if (peek.data.lockVersion !== lockRef.current) {
      if (!sameSaved(peek.data, lastSaved.current)) {
        conflictRef.current = true;
        setConflict(true);
        return null;
      }
      lockRef.current = peek.data.lockVersion;
    }
    return lockRef.current;
  }, [flush, id]);

  // debounce 1.5s after the last edit
  useEffect(() => {
    if (!dirty || readOnly || conflict || invalid) return;
    const t = setTimeout(() => void flush(), 1500);
    return () => clearTimeout(t);
  }, [st.rev, dirty, readOnly, conflict, invalid, flush]);

  // leaving (unmount, or hidden by <Activity>): don't drop a pending save
  useEffect(() => () => void flush(), [flush]);

  // ⌘S / Ctrl+S
  const [showIssues, setShowIssues] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!validation.success) setShowIssues(true);
        void flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush, validation.success]);

  // warn before closing the tab with unsaved work
  useEffect(() => {
    if (!dirty || readOnly) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty, readOnly]);

  /* ───────── whole-draft replacements (AI) ───────── */
  const onRegenerated = (next: Draft, lockVersion: number) => {
    const s = latest.current;
    const rev = s.rev + 1;
    const metaSame = s.doc.beat === lastSaved.current.beat && s.doc.storyId === lastSaved.current.storyId && s.doc.priority === lastSaved.current.priority;
    lockRef.current = lockVersion;
    lastSaved.current = { ...lastSaved.current, draft: next };
    setSt({ doc: docFrom(next, s.doc.beat, s.doc.storyId, s.doc.priority), rev, gen: s.gen + 1 });
    savedRevRef.current = metaSame ? rev : rev - 1;
    setSavedRev(savedRevRef.current);
    setSavedAt(new Date().toISOString());
  };
  const onTighten = (dek: string, blocks: Block[]) => edit((d) => ({ ...d, meta: { ...d.meta, dek }, blocks: blocks.map((block) => ({ key: newKey(), block })) }));
  const onBlock = (b: Block, how: "replace" | "insert") =>
    edit((d) => {
      const item = { key: newKey(), block: b };
      const at = d.blocks.findIndex((x) => x.block.type === b.type);
      if (how === "replace" && at >= 0) return { ...d, blocks: d.blocks.map((x, i) => (i === at ? item : x)) };
      const list = [...d.blocks];
      let pos = list.length;
      if (b.type === "why") pos = 0;
      else if (b.type === "numbers") {
        const lastWhy = list.map((x) => x.block.type).lastIndexOf("why");
        pos = lastWhy + 1;
      } else if (b.type === "next") {
        const deeper = list.findIndex((x) => x.block.type === "deeper");
        pos = deeper >= 0 ? deeper : list.length;
      }
      list.splice(pos, 0, item);
      return { ...d, blocks: list };
    });
  // a remount key for fields that keep raw text (tags, sources…)
  const gen = st.gen;

  /* ───────── derived ───────── */
  const stories = useMemo(() => [...extraStories, ...bundle.stories.filter((s) => !extraStories.some((e) => e.id === s.id))], [bundle.stories, extraStories]);
  const storyTitle = stories.find((s) => s.id === doc.storyId)?.title ?? null;
  // the first assist call records a (non-template) generator on the server
  const ai = aiInvolvementOf(c.mode, c.generator?.id ?? (usedAi ? "assist" : null));
  const byline = bylineOf(ai, BEATS[doc.beat].label, bundle.me.name);
  const existing = useMemo(() => new Set<BlockType>(doc.blocks.map((b) => b.block.type)), [doc.blocks]);
  const sum = checkSummary(checks, checkLabels);

  const preview: PreviewArticle = useMemo(() => {
    const valid: Block[] = [];
    for (const b of draft.blocks) {
      const p = blockSchema.safeParse(b);
      if (p.success) valid.push(p.data);
    }
    const srcs: SourceRef[] = [];
    for (const s of draft.sources) {
      const p = sourceRefSchema.safeParse(s);
      if (p.success) srcs.push(p.data);
    }
    return {
      title: draft.title,
      dek: draft.dek,
      blocks: valid,
      skipped: draft.blocks.length - valid.length,
      sentiment: draft.sentiment,
      beat: doc.beat,
      isBreaking: draft.isBreaking,
      storyTitle,
      ai,
      editorName: bundle.me.name,
      byline,
      tickers: draft.tickers,
      tags: draft.tags,
      sources: srcs,
    };
  }, [draft, doc.beat, storyTitle, ai, bundle.me.name, byline]);

  /* ───────── tabs & top-bar actions ───────── */
  const [tab, setTab] = useState<Tab>(c.status === "new" || c.status === "drafting" ? "assist" : "publish");
  const rightRef = useRef<HTMLElement>(null);
  const scheduleRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const dekRef = useRef<HTMLTextAreaElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const blockEls = useRef(new Map<string, HTMLElement>());
  const registerBlock = useCallback((key: string, el: HTMLElement | null) => {
    if (el) blockEls.current.set(key, el);
    else blockEls.current.delete(key);
  }, []);

  const openTab = (t: Tab, focus?: () => HTMLElement | null | undefined) => {
    setTab(t);
    requestAnimationFrame(() => {
      if (!window.matchMedia("(min-width: 1280px)").matches) rightRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      focus?.()?.focus({ preventScroll: true });
    });
  };

  const jumpTo = (i: FieldIssue) => {
    const [head, idx] = i.path;
    let el: HTMLElement | null | undefined = null;
    if (head === "title") el = titleRef.current;
    else if (head === "dek") el = dekRef.current;
    else if (head === "blocks" && typeof idx === "number") el = blockEls.current.get(doc.blocks[idx]?.key ?? "");
    else el = metaRef.current;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    const target = el && (el.matches("input,textarea,select") ? el : el.querySelector<HTMLElement>("[aria-invalid=true], input, textarea, select"));
    target?.focus({ preventScroll: true });
  };

  /* reject */
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectPending, startReject] = useTransition();
  const reject = (reason: string) =>
    startReject(async () => {
      setRejectError(null);
      await flush();
      const res = await rejectCandidate({ id, reason });
      if (res?.ok) setRejectOpen(false);
      else setRejectError(res && !res.ok ? res.error : "반려하지 못했습니다.");
    });

  /* assignee */
  const [assignPending, startAssign] = useTransition();
  const [assignError, setAssignError] = useState<string | null>(null);
  const assign = (staffId: string | null) => {
    const before = assignee;
    setAssignee(staffId);
    startAssign(async () => {
      const res = await assignCandidate({ id, staffId });
      if (res?.ok) setAssignError(null);
      else {
        setAssignee(before);
        setAssignError(res && !res.ok ? res.error : "알 수 없는 오류");
      }
    });
  };

  /* publish — lives here so the top bar and the 발행 tab share one flow */
  const [pubBusy, setPubBusy] = useState<Publishing["busy"]>(null);
  const [pubError, setPubError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [, startPublish] = useTransition();
  const publish = (overrideReason?: string) => {
    if (pubBusy) return;
    setPubBusy(overrideReason ? "override" : "publish");
    setPubError(null);
    startPublish(async () => {
      const lockVersion = await prepare();
      if (lockVersion == null) {
        setPubBusy(null);
        setTab("publish");
        setPubError(
          conflictRef.current
            ? "다른 편집자가 초안을 바꿔 발행하지 않았습니다. 새로고침해 바뀐 내용을 검토하세요."
            : invalid
              ? "본문에 입력 오류가 있어 저장하지 못했습니다. 표시된 항목을 먼저 고치세요."
              : "최신 변경을 저장하지 못했습니다. 저장 상태를 확인하세요.",
        );
        return;
      }
      const res = await publishNow({ id, overrideReason, lockVersion });
      setPubBusy(null);
      if (res?.ok && res.data) {
        setBlocked(false);
        setPublishedSlug(res.data.slug);
        return;
      }
      setTab("publish");
      if (res && !res.ok && res.code === "conflict") {
        conflictRef.current = true;
        setConflict(true);
      }
      if (res && !res.ok && res.code === "blocked") {
        setBlocked(true);
        const r = await runCandidateChecks({ id });
        if (r?.ok && r.data) setChecks(r.data.checks);
        return;
      }
      setPubError(res && !res.ok ? res.error : "발행하지 못했습니다.");
    });
  };
  const publishing: Publishing = { busy: pubBusy, error: pubError, blocked, dismissBlocked: () => setBlocked(false), publish };
  const publishFromTopBar = () => {
    if (!window.confirm("지금 발행할까요?\n변경을 저장한 뒤 서버가 체크를 다시 실행하고, 통과하면 바로 공개됩니다.")) return;
    openTab("publish");
    publish();
  };

  const titleLen = draft.title.trim().length;
  const dekLen = draft.dek.trim().length;
  const dekSentences = sentenceCount(draft.dek);
  const titleIssue = issuesUnder(issues, ["title"])[0];
  const dekIssue = issuesUnder(issues, ["dek"])[0];
  const canAct = !readOnly && c.status !== "rejected";

  const topActions = () => (
    <>
      <label className="inline-flex min-w-0 items-center gap-1.5">
        <span className="kicker text-fg-4">담당</span>
        <select
          value={assignee ?? ""}
          disabled={assignPending || readOnly}
          onChange={(e) => assign(e.target.value || null)}
          aria-label="담당 편집자"
          className="h-8 max-w-[150px] rounded-lg border border-line-2 bg-bg-1 px-2 text-[12.5px] text-fg-2 hover:border-line-3 focus:border-ice focus:outline-none"
        >
          <option value="">미배정</option>
          {bundle.staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.id === bundle.me.id ? " (나)" : ""}
            </option>
          ))}
        </select>
      </label>
      {readOnly ? (
        (publishedSlug ?? c.article?.slug) && (
          <a href={`/a/${publishedSlug ?? c.article?.slug}`} target="_blank" rel="noreferrer" className={cx(btn.base, btn.primary, "ml-auto sm:ml-0")}>
            기사 보기 <span className="hidden font-mono text-[11.5px] font-normal opacity-80 md:inline">/a/{publishedSlug ?? c.article?.slug}</span>
            <Icon name="arrowUpRight" size={13} />
          </a>
        )
      ) : (
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          {canAct && (
            <button type="button" onClick={() => setRejectOpen(true)} className={cx(btn.base, "text-bad/90 hover:bg-bad/10 hover:text-bad")}>
              반려
            </button>
          )}
          {canAct && (
            <button type="button" onClick={() => openTab("publish", () => scheduleRef.current)} className={cx(btn.base, btn.ghost)}>
              <Icon name="clock" size={13} /> 예약
            </button>
          )}
          <button
            type="button"
            onClick={publishFromTopBar}
            disabled={!canAct || pubBusy != null}
            title={c.status === "rejected" ? "반려된 후보는 발행할 수 없습니다 — 발행 탭에서 되살리세요" : "저장 → 체크 → 발행"}
            className={cx(btn.base, btn.primary)}
          >
            {pubBusy ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : <Icon name="bolt" size={13} />} 지금 발행
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="min-w-0">
      <h1 className="sr-only">후보 편집 · {draft.title || "제목 없음"}</h1>

      {/* ───────── top bar ───────── */}
      {/* Phones: only the status row sticks (under the 48px admin bar); the actions row scrolls away. */}
      <div className="sticky top-12 z-30 border-b border-line bg-bg/90 backdrop-blur-md supports-[backdrop-filter]:bg-bg/75 lg:top-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
          <Link href="/admin/candidates" className="inline-flex h-8 items-center gap-1.5 rounded-lg pr-1 text-[13px] font-semibold text-fg-3 hover:text-fg">
            <Icon name="arrowLeft" size={14} /> <span className="hidden sm:inline">후보 보드</span>
            <span className="sr-only sm:hidden">후보 보드로</span>
          </Link>
          <span className="hidden h-5 w-px bg-line-2 sm:block" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={readOnly ? "published" : c.status} />
            <ModeBadge mode={c.mode} />
            <BeatChip beat={doc.beat} />
            {c.experiment && (
              <span title={`실험 ${c.experiment.code} · ${c.experiment.name}`}>
                <ExperimentDot code={c.experiment.code} colorSlot={c.experiment.colorSlot} />
              </span>
            )}
            {c.status === "scheduled" && c.scheduledAt && !readOnly && (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-fg-2" title="예약 발행 시각 (KST)">
                <Icon name="clock" size={12} className="text-ice" />
                <span className="tabular">
                  {dateKST(c.scheduledAt)} {clockKST(c.scheduledAt)}
                </span>
              </span>
            )}
          </div>
          <SaveStatus readOnly={readOnly} conflict={conflict} saving={saving} dirty={dirty} invalid={invalid} error={saveError} savedAt={savedAt} onRetry={() => void flush()} onShowIssues={() => setShowIssues(true)} />
          <div className="ml-auto hidden flex-wrap items-center gap-2 sm:flex">{topActions()}</div>
        </div>
        {assignError && (
          <p role="alert" className="px-4 pb-2 text-[12px] text-bad sm:px-6">
            담당자를 바꾸지 못했습니다 — {assignError}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 sm:hidden">{topActions()}</div>

      {/* ───────── banners ───────── */}
      {conflict && (
        <div role="alert" className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-bad/50 bg-bad/[0.08] px-4 py-3 sm:mx-6">
          <Icon name="alert" size={16} className="text-bad" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-fg">다른 편집자가 먼저 저장했습니다 — 새로고침</p>
            <p className="text-[12px] text-fg-3">자동 저장을 멈췄습니다. 새로고침하면 서버의 최신본을 불러옵니다. 내 변경은 먼저 복사해 두세요.</p>
          </div>
          <CopyDraft draft={draft} />
          <button type="button" onClick={() => window.location.reload()} className={cx(btn.base, btn.primary)}>
            새로고침
          </button>
        </div>
      )}
      {readOnly && (
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-good/30 bg-good/[0.05] px-4 py-2.5 text-[12.5px] leading-relaxed text-fg-2 sm:mx-6">
          <Icon name="check" size={14} className="mt-[3px] shrink-0 text-good" />
          <span className="min-w-0">발행된 후보입니다 — 읽기 전용. 수정과 정정은 ‘발행 기사’ 화면에서 합니다.</span>
        </div>
      )}
      {c.status === "scheduled" && !readOnly && !conflict && (
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-ice/30 bg-ice/[0.05] px-4 py-2.5 text-[12.5px] leading-relaxed text-fg-2 sm:mx-6">
          <Icon name="clock" size={14} className="mt-[3px] shrink-0 text-ice" />
          <span className="min-w-0">예약 발행 대기 중입니다. 본문을 고쳐 저장하면 예약이 풀리고 ‘검토’로 돌아갑니다 — 검토 후 다시 예약하세요.</span>
        </div>
      )}
      {invalid && (dirty || showIssues) && !readOnly && (
        <div role="status" className="mx-4 mt-4 rounded-xl border border-warn/40 bg-warn/[0.06] px-4 py-3 sm:mx-6">
          <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-fg">
            <Icon name="alert" size={14} className="text-warn" />
            자동 저장 보류 — 입력 확인이 필요한 항목 {issues.length}건
            <span className="text-[12px] font-normal text-fg-3">형식이 맞지 않는 초안은 서버로 보내지 않습니다.</span>
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {issues.slice(0, 6).map((i, k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => jumpTo(i)}
                  className="rounded-md border border-warn/30 bg-bg-1 px-2 py-0.5 text-left text-[12px] text-fg-2 hover:border-warn/60 hover:text-fg"
                >
                  <span className="font-semibold">{i.where}</span> · {i.message}
                </button>
              </li>
            ))}
            {issues.length > 6 && <li className="px-1 py-0.5 text-[12px] text-fg-3">외 {issues.length - 6}건</li>}
          </ul>
        </div>
      )}

      {/* ───────── columns ───────── */}
      <div className="grid gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[260px_minmax(0,1fr)_340px] xl:gap-5 2xl:grid-cols-[300px_minmax(0,1fr)_380px]">
        {/* left — source material */}
        <Collapsible title="원천 자료" count={bundle.items.length} defaultOpenBelowXl={false}>
          {sources}
        </Collapsible>

        {/* center — body */}
        <main className="min-w-0" aria-label="본문 편집">
          <fieldset disabled={readOnly} className="mx-auto min-w-0 max-w-[760px] space-y-5">
            <legend className="sr-only">본문</legend>
            <div>
              <label htmlFor={`${uid}-title`} className={f.label}>
                <span>제목</span>
                <span className={cx("tabular font-mono text-[10.5px] font-normal", titleLen > 120 ? "text-bad" : titleLen > 45 ? "text-warn" : "text-fg-4")}>
                  {titleLen}/45{titleLen > 45 ? " · 권장 초과" : ""}
                </span>
              </label>
              {/* a one-line field that wraps, so long headlines stay readable on phones */}
              <textarea
                ref={titleRef}
                id={`${uid}-title`}
                rows={2}
                value={doc.meta.title}
                maxLength={140}
                onChange={(e) => setMeta({ title: e.target.value.replace(/\s*\n+\s*/g, " ") })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) e.preventDefault();
                }}
                aria-invalid={titleIssue ? true : undefined}
                placeholder="45자 안팎, 핵심 사실 + 숫자"
                className="block w-full resize-none rounded-lg border border-line-2 bg-bg-1 px-3 py-2.5 text-[20px] font-bold leading-snug tracking-[-0.02em] text-fg field-sizing-content placeholder:font-semibold placeholder:text-fg-4 hover:border-line-3 focus:border-ice focus:shadow-[0_0_0_3px_var(--ice-glow)] focus:outline-none focus-visible:outline-none aria-[invalid=true]:border-bad/70 sm:text-[22px]"
              />
              {titleIssue && <p className={f.error}>{titleIssue.message}</p>}
            </div>
            <div>
              <label htmlFor={`${uid}-dek`} className={f.label}>
                <span>
                  시그널 <span className="font-normal text-fg-4">· 1–2문장</span>
                </span>
                <span className={cx("tabular font-mono text-[10.5px] font-normal", dekLen > 300 ? "text-bad" : dekLen > 120 || dekSentences > 2 ? "text-warn" : "text-fg-4")}>
                  {dekSentences}문장 · {dekLen}/120
                </span>
              </label>
              <textarea
                ref={dekRef}
                id={`${uid}-dek`}
                rows={3}
                value={doc.meta.dek}
                onChange={(e) => setMeta({ dek: e.target.value })}
                aria-invalid={dekIssue ? true : undefined}
                placeholder="무슨 일이 있었고 왜 중요한지, 1–2문장으로"
                className={cx(f.textarea, "text-[15px] leading-[1.7]")}
              />
              {dekIssue ? <p className={f.error}>{dekIssue.message}</p> : <p className={f.help}>기사 맨 위 ‘시그널’ 박스로 나갑니다. 120자 이내, 2문장 이하를 권장합니다.</p>}
            </div>

            <section aria-labelledby={`${uid}-blocks`}>
              <h2 id={`${uid}-blocks`} className="kicker mb-2 flex items-center justify-between text-fg-2">
                <span>본문 블록</span>
                <span className="tabular font-mono text-[10.5px] font-normal text-fg-4">{doc.blocks.length}/16 · 권장 8개 이하</span>
              </h2>
              <BlockList
                key={gen}
                blocks={doc.blocks}
                onChange={(blocks) => edit((d) => ({ ...d, blocks }))}
                issues={issues}
                disabled={readOnly}
                sentiment={draft.sentiment}
                registerBlock={registerBlock}
              />
            </section>

            <div ref={metaRef}>
              <MetaFields
                key={gen}
                doc={doc}
                issues={issues}
                stories={stories}
                readOnly={readOnly}
                onMeta={setMeta}
                onDoc={(patch) => edit((d) => ({ ...d, ...patch }))}
                onStoryCreated={(s) => {
                  setExtraStories((list) => [s, ...list]);
                  edit((d) => ({ ...d, storyId: s.id }));
                }}
              />
            </div>
          </fieldset>
        </main>

        {/* right — tools */}
        <aside ref={rightRef} aria-label="도구" className="min-w-0 scroll-mt-28 xl:sticky xl:top-[60px] xl:max-h-[calc(100dvh-76px)] xl:self-start xl:overflow-y-auto xl:overscroll-contain">
          <div className="panel overflow-hidden">
            <Tabs
              idBase={uid}
              tab={tab}
              onTab={(t) => setTab(t)}
              badges={{
                checks: sum.ran
                  ? sum.failing.length
                    ? { text: String(sum.failing.length), tone: "bad", label: `필수 체크 ${sum.failing.length}건 미통과` }
                    : sum.missing.length
                      ? { text: "!", tone: "warn", label: `필수 체크 ${sum.missing.length}건 미실행` }
                      : { text: "✓", tone: "good", label: "필수 체크 통과" }
                  : undefined,
              }}
            />
            {/* every panel stays mounted (hidden by <Activity>) so suggestions and inputs survive tab switches */}
            <Panel idBase={uid} id="assist" tab={tab}>
              <AssistPanel
                candidateId={id}
                draft={validation.success ? validation.data : draft}
                invalid={invalid}
                readOnly={readOnly}
                existing={existing}
                beforeRegenerate={flush}
                onTitle={(t) => setMeta({ title: t })}
                onTighten={onTighten}
                onBlock={onBlock}
                onRegenerated={onRegenerated}
                onUsedAi={() => setUsedAi(true)}
              />
            </Panel>
            <Panel idBase={uid} id="checks" tab={tab}>
              <ChecklistPanel candidateId={id} checks={checks} labels={checkLabels} readOnly={readOnly} dirty={dirty} flush={flush} onChecks={setChecks} />
            </Panel>
            <Panel idBase={uid} id="preview" tab={tab}>
              <PreviewPanel article={preview} previewHref={`/admin/candidates/${id}/preview`} dirty={dirty && !readOnly} beforeOpen={flush} />
            </Panel>
            <Panel idBase={uid} id="publish" tab={tab}>
              <PublishPanel
                candidateId={id}
                status={c.status}
                published={readOnly}
                scheduledAt={c.scheduledAt}
                ai={ai}
                editorName={bundle.me.name}
                editorPlaceholder={bundle.me.placeholder}
                byline={byline}
                storyTitle={storyTitle}
                checks={checks}
                labels={checkLabels}
                articleSlug={publishedSlug ?? c.article?.slug ?? null}
                invalid={invalid}
                publishing={publishing}
                flush={flush}
                prepare={prepare}
                onChecks={setChecks}
                onReject={() => setRejectOpen(true)}
                onOpenChecks={() => setTab("checks")}
                scheduleRef={scheduleRef}
              />
            </Panel>
          </div>
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-fg-4">
            <kbd className="rounded border border-line-2 bg-bg-2 px-1 font-mono text-[10px] text-fg-3">⌘S</kbd> 즉시 저장 · 입력을 멈추면 1.5초 뒤 자동 저장 · 모드 {CANDIDATE_MODE_LABEL[c.mode].label}
          </p>
        </aside>
      </div>

      <ReasonDialog
        open={rejectOpen}
        title="후보 반려"
        description="사유는 활동 로그와 보드 카드에 남습니다. 반려한 후보는 보드에서 되살릴 수 있습니다."
        placeholder="예: 1차 출처 확인 불가 — 커뮤니티발 루머"
        confirmLabel="반려"
        pending={rejectPending}
        error={rejectError}
        onCancel={() => setRejectOpen(false)}
        onConfirm={reject}
      />
    </div>
  );
}

/* ───────────────────────────── top-bar pieces ───────────────────────────── */

function SaveStatus({
  readOnly,
  conflict,
  saving,
  dirty,
  invalid,
  error,
  savedAt,
  onRetry,
  onShowIssues,
}: {
  readOnly: boolean;
  conflict: boolean;
  saving: boolean;
  dirty: boolean;
  invalid: boolean;
  error: string | null;
  savedAt: string;
  onRetry: () => void;
  onShowIssues: () => void;
}) {
  let body: ReactNode;
  if (readOnly) body = <span className="text-fg-3">읽기 전용</span>;
  else if (conflict)
    body = (
      <span className="inline-flex items-center gap-1.5 font-semibold text-bad">
        <Icon name="alert" size={12} /> 저장 충돌
      </span>
    );
  else if (saving)
    body = (
      <span className="inline-flex items-center gap-1.5 text-fg-2">
        <span className="size-2.5 animate-spin rounded-full border-[1.5px] border-ice border-t-transparent" aria-hidden="true" /> 저장 중…
      </span>
    );
  else if (error)
    body = (
      <span role="alert" className="inline-flex items-center gap-1.5 text-bad">
        <Icon name="alert" size={12} /> 저장 실패
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2 hover:text-fg">
          다시 시도
        </button>
      </span>
    );
  else if (dirty && invalid)
    body = (
      <button type="button" onClick={onShowIssues} className="inline-flex items-center gap-1.5 text-warn hover:underline">
        <Icon name="alert" size={12} /> 저장 보류 · 입력 확인
      </button>
    );
  else if (dirty)
    body = (
      <span className="inline-flex items-center gap-1.5 text-fg-3">
        <span className="size-1.5 rounded-full bg-warn" aria-hidden="true" /> 변경됨
      </span>
    );
  else
    body = (
      <span className="inline-flex items-center gap-1.5 text-fg-3">
        <Icon name="check" size={12} className="text-good" /> 저장됨 <span className="tabular font-mono">{clockSecKST(savedAt)}</span>
      </span>
    );
  return (
    <p className="text-[12px]" title={error ?? undefined}>
      {body}
    </p>
  );
}

function CopyDraft({ draft }: { draft: Draft }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
          setDone(true);
        } catch {
          setDone(false);
        }
      }}
      className={cx(btn.base, btn.ghost)}
    >
      {done ? "복사됨" : "내 변경 복사"}
    </button>
  );
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "assist", label: "AI 어시스트" },
  { id: "checks", label: "체크리스트" },
  { id: "preview", label: "미리보기" },
  { id: "publish", label: "발행" },
];

function Panel({ idBase, id, tab, children }: { idBase: string; id: Tab; tab: Tab; children: ReactNode }) {
  const on = id === tab;
  return (
    <Activity mode={on ? "visible" : "hidden"}>
      <div className="p-3.5" role="tabpanel" id={`${idBase}-panel-${id}`} aria-labelledby={`${idBase}-tab-${id}`}>
        {children}
      </div>
    </Activity>
  );
}

function Tabs({
  idBase,
  tab,
  onTab,
  badges,
}: {
  idBase: string;
  tab: Tab;
  onTab: (t: Tab) => void;
  badges: Partial<Record<Tab, { text: string; tone: "good" | "warn" | "bad"; label: string }>>;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let j = -1;
    if (e.key === "ArrowRight") j = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = TABS.length - 1;
    if (j < 0) return;
    e.preventDefault();
    onTab(TABS[j].id);
    refs.current[j]?.focus();
  };
  return (
    <div role="tablist" aria-label="편집 도구" className="no-scrollbar flex overflow-x-auto border-b border-line">
      {TABS.map((t, i) => {
        const on = t.id === tab;
        const b = badges[t.id];
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${idBase}-tab-${t.id}`}
            role="tab"
            aria-controls={`${idBase}-panel-${t.id}`}
            type="button"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onTab(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              "relative flex h-10 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-[12.5px] font-semibold transition-colors",
              on ? "text-fg" : "text-fg-3 hover:text-fg",
            )}
          >
            {t.label}
            {t.id === "assist" && (
              <span className="rounded border border-warn/40 px-1 text-[10px] font-semibold leading-[14px] text-warn" title="모의 생성 — 3단계에서 실제 AI로 교체">
                모의
              </span>
            )}
            {b && (
              <span
                title={b.label}
                className={cx("tabular rounded px-1 font-mono text-[10px]", b.tone === "bad" ? "bg-bad/15 text-bad" : b.tone === "warn" ? "bg-warn/15 text-warn" : "bg-good/15 text-good")}
              >
                <span aria-hidden="true">{b.text}</span>
                <span className="sr-only">{b.label}</span>
              </span>
            )}
            {on && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-ice" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── left column ───────────────────────────── */

function Collapsible({ title, count, children, defaultOpenBelowXl }: { title: string; count: number; children: ReactNode; defaultOpenBelowXl: boolean }) {
  const [open, setOpen] = useState(defaultOpenBelowXl);
  const id = useId();
  return (
    <aside aria-label={title} className="min-w-0 xl:sticky xl:top-[60px] xl:max-h-[calc(100dvh-76px)] xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:pr-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl border border-line-2 bg-bg-1 px-3.5 py-2.5 text-left xl:hidden"
      >
        <Icon name="chevronRight" size={14} className={cx("text-fg-3 transition-transform", open && "rotate-90")} />
        <span className="text-[13.5px] font-semibold text-fg">{title}</span>
        <span className="tabular font-mono text-[11.5px] text-fg-3">{count}</span>
        <span className="ml-auto text-[11.5px] text-fg-4">{open ? "접기" : "펼치기"}</span>
      </button>
      <h2 className="kicker mb-2.5 hidden items-center gap-2 text-fg-2 xl:flex">
        {title} <span className="tabular font-mono text-[11px] font-normal text-fg-4">{count}</span>
      </h2>
      <div id={id} className={cx("mt-3 xl:mt-0 xl:block", open ? "block" : "hidden")}>
        {children}
      </div>
    </aside>
  );
}

/* ───────────────────────────── meta fields ───────────────────────────── */

const KIND_FROM_KO: Record<string, SourceRef["kind"]> = Object.fromEntries(Object.entries(SOURCE_KIND_KO).map(([k, v]) => [v, k as SourceRef["kind"]]));

function parseSources(s: string): SourceRef[] {
  return lines(s).map((l) => {
    const [name = "", url = "", kind = ""] = l.split("|").map((x) => x.trim());
    const ref: SourceRef = { name };
    if (url && url !== "-") ref.url = url;
    if (kind) ref.kind = (KIND_FROM_KO[kind] ?? kind) as SourceRef["kind"];
    return ref;
  });
}
const sourcesText = (list: SourceRef[]) => list.map((s) => [s.name, s.url ?? "-", s.kind ? (SOURCE_KIND_KO[s.kind] ?? s.kind) : ""].join(" | ").replace(/ \| $/, "")).join("\n");

function MetaFields({
  doc,
  issues,
  stories,
  readOnly,
  onMeta,
  onDoc,
  onStoryCreated,
}: {
  doc: Doc;
  issues: FieldIssue[];
  stories: Array<{ id: string; title: string; beat: Beat }>;
  readOnly: boolean;
  onMeta: (p: Partial<Meta>) => void;
  onDoc: (p: Partial<Pick<Doc, "beat" | "storyId" | "priority">>) => void;
  onStoryCreated: (s: { id: string; title: string; beat: Beat }) => void;
}) {
  const id = useId();
  const [tags, setTags] = useState(doc.meta.tags.join(", "));
  const [tickers, setTickers] = useState(doc.meta.tickers.join(", "));
  const [srcs, setSrcs] = useState(sourcesText(doc.meta.sources));
  const [newStory, setNewStory] = useState<string | null>(null);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [storyPending, startStory] = useTransition();
  const tagIssues = issuesUnder(issues, ["tags"]);
  const tickerIssues = issuesUnder(issues, ["tickers"]);
  const srcIssues = issuesUnder(issues, ["sources"]);
  const same = stories.filter((s) => s.beat === doc.beat);
  const other = stories.filter((s) => s.beat !== doc.beat);

  const makeStory = () => {
    const title = (newStory ?? "").trim();
    if (title.length < 2) return setStoryError("2자 이상 입력하세요.");
    startStory(async () => {
      const res = await createStory({ title, beat: doc.beat });
      if (res?.ok && res.data) {
        onStoryCreated({ id: res.data.id, title, beat: doc.beat });
        setNewStory(null);
        setStoryError(null);
      } else setStoryError(res && !res.ok ? res.error : "스토리를 만들지 못했습니다.");
    });
  };

  return (
    <section aria-labelledby={`${id}-h`} className="rounded-xl border border-line-2 bg-bg-1 p-4">
      <h2 id={`${id}-h`} className="kicker mb-3 text-fg-2">
        분류 · 메타
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-beat`} className={f.label}>
            분야
          </label>
          <select id={`${id}-beat`} value={doc.beat} onChange={(e) => onDoc({ beat: e.target.value as Beat })} className={f.select}>
            {BEAT_ORDER.map((b) => (
              <option key={b} value={b}>
                {BEATS[b].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-story`} className={f.label}>
            <span>스토리</span>
            {!readOnly && newStory == null && (
              <button type="button" onClick={() => setNewStory("")} className="text-[11.5px] font-semibold text-ice hover:underline">
                ＋ 새 스토리
              </button>
            )}
          </label>
          {newStory == null ? (
            <select id={`${id}-story`} value={doc.storyId ?? ""} onChange={(e) => onDoc({ storyId: e.target.value || null })} className={f.select}>
              <option value="">스토리 없음 (단독 기사)</option>
              {same.length > 0 && (
                <optgroup label={`${BEATS[doc.beat].label} 스토리`}>
                  {same.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </optgroup>
              )}
              {other.length > 0 && (
                <optgroup label="다른 분야">
                  {other.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} · {BEATS[s.beat].label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          ) : (
            <div className="flex gap-1.5">
              <input
                id={`${id}-story`}
                autoFocus
                value={newStory}
                maxLength={80}
                onChange={(e) => setNewStory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    makeStory();
                  } else if (e.key === "Escape") setNewStory(null);
                }}
                placeholder={`새 ${BEATS[doc.beat].label} 스토리 제목`}
                className={cx(f.input, "min-w-0 flex-1")}
              />
              <button type="button" onClick={makeStory} disabled={storyPending} className={cx(btn.base, btn.ghost, "h-9 shrink-0")}>
                {storyPending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
                만들기
              </button>
              <button type="button" onClick={() => setNewStory(null)} aria-label="새 스토리 취소" className={cx(btn.base, btn.quiet, "h-9 shrink-0 px-2")}>
                <Icon name="close" size={13} />
              </button>
            </div>
          )}
          {storyError ? <p className={f.error}>{storyError}</p> : <p className={f.help}>같은 사건의 후속 기사를 한 타임라인으로 묶습니다.</p>}
        </div>

        <div>
          <label htmlFor={`${id}-pri`} className={f.label}>
            <span>우선순위</span>
            <span className="tabular font-mono text-[12px] font-semibold text-fg">{doc.priority}</span>
          </label>
          <input
            id={`${id}-pri`}
            type="range"
            min={0}
            max={100}
            step={1}
            value={doc.priority}
            onChange={(e) => onDoc({ priority: Number(e.target.value) })}
            aria-valuetext={`${doc.priority}점`}
            className="h-9 w-full accent-[var(--ice)]"
          />
          <p className={f.help}>보드 정렬 기준. 70 이상은 데스크 우선 검토.</p>
        </div>
        <div>
          <span className={f.label}>속보</span>
          <label className="flex h-9 cursor-pointer items-center gap-2.5 rounded-lg border border-line-2 px-3 hover:border-line-3">
            <input type="checkbox" checked={Boolean(doc.meta.isBreaking)} onChange={(e) => onMeta({ isBreaking: e.target.checked || undefined })} className="peer sr-only" />
            <span
              className="relative h-5 w-9 shrink-0 rounded-full bg-bg-3 transition-colors peer-checked:bg-live/80 peer-focus-visible:outline peer-focus-visible:outline-[1.5px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ice after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-fg after:transition-transform peer-checked:after:translate-x-4"
              aria-hidden="true"
            />
            <span className="text-[13px] text-fg-2">
              속보로 표시 <span className="hud ml-1 text-live">BREAKING</span>
            </span>
          </label>
        </div>

        <div>
          <label htmlFor={`${id}-tags`} className={f.label}>
            <span>태그 (쉼표로 구분)</span>
            <span className="tabular font-mono text-[10.5px] font-normal text-fg-4">{doc.meta.tags.length}/8</span>
          </label>
          <input
            id={`${id}-tags`}
            value={tags}
            aria-invalid={tagIssues.length ? true : undefined}
            onChange={(e) => {
              setTags(e.target.value);
              onMeta({ tags: commaList(e.target.value) });
            }}
            placeholder="스테이블코인, 금융위원회"
            className={f.input}
          />
          {tagIssues[0] && <p className={f.error}>{tagIssues[0].where} {tagIssues[0].message}</p>}
        </div>
        <div>
          <label htmlFor={`${id}-tickers`} className={f.label}>
            <span>종목 (쉼표로 구분)</span>
            <span className="tabular font-mono text-[10.5px] font-normal text-fg-4">{doc.meta.tickers.length}/6</span>
          </label>
          <input
            id={`${id}-tickers`}
            value={tickers}
            aria-invalid={tickerIssues.length ? true : undefined}
            onChange={(e) => {
              const v = e.target.value.toUpperCase();
              setTickers(v);
              onMeta({ tickers: commaList(v) });
            }}
            placeholder="BTC, 005930"
            className={cx(f.input, "font-mono uppercase")}
          />
          {tickerIssues[0] && <p className={f.error}>{tickerIssues[0].where} {tickerIssues[0].message}</p>}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`${id}-src`} className={f.label}>
            <span>출처 — 한 줄에 하나: 이름 | URL | 종류</span>
            <span className="tabular font-mono text-[10.5px] font-normal text-fg-4">{doc.meta.sources.length}/10</span>
          </label>
          <textarea
            id={`${id}-src`}
            rows={Math.min(8, Math.max(2, doc.meta.sources.length + 1))}
            value={srcs}
            aria-invalid={srcIssues.length ? true : undefined}
            onChange={(e) => {
              setSrcs(e.target.value);
              onMeta({ sources: parseSources(e.target.value) });
            }}
            placeholder={"금융위원회 보도자료 | https://www.fsc.go.kr/… | 보도자료\nDART 공시 | - | 공시"}
            className={cx(f.textarea, "text-[12.5px]")}
          />
          {srcIssues[0] ? (
            <p className={f.error}>
              {srcIssues[0].where} {srcIssues[0].message}
            </p>
          ) : (
            <p className={f.help}>종류: {Object.values(SOURCE_KIND_KO).join(" · ")}. 공시·보도자료·데이터·리포트·논문은 ‘1차 출처’ 체크를 통과시킵니다. URL이 없으면 -.</p>
          )}
        </div>
      </div>
    </section>
  );
}
