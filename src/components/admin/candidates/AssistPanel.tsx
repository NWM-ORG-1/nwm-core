"use client";

import { useRef, useState, useTransition } from "react";
import type { Block, BlockType, Draft } from "@/lib/content/blocks";
import { plainText } from "@/lib/content/meta";
import { assistDraft, regenerateDraft } from "@/server/actions/candidates";
import type { AssistAction, AssistResult } from "@/server/generator/types";
import { Badge, btn, cx } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";
import { blockTitle } from "./issues";
import { clockSecKST } from "./shared";

const ACTIONS: Array<{ id: AssistAction; label: string; hint: string }> = [
  { id: "headlines", label: "제목 후보", hint: "45자 안팎 제목 3개" },
  { id: "tighten", label: "간결하게", hint: "시그널·단락을 첫 문장 중심으로" },
  { id: "why", label: "왜 중요한가", hint: "이유 블록 제안" },
  { id: "numbers", label: "숫자로 보면", hint: "원문 수치 추출" },
  { id: "next", label: "다음 관전 포인트", hint: "후속 체크 포인트" },
];

interface Suggestion {
  uid: number;
  at: string;
  result: AssistResult;
  applied: string | null;
}

export function AssistPanel({
  candidateId,
  draft,
  invalid,
  readOnly,
  existing,
  beforeRegenerate,
  onTitle,
  onTighten,
  onBlock,
  onRegenerated,
  onUsedAi,
}: {
  candidateId: string;
  draft: Draft;
  invalid: boolean;
  readOnly: boolean;
  existing: ReadonlySet<BlockType>;
  /** settles autosave first, so the regenerated copy and its lockVersion are not raced by a late save */
  beforeRegenerate: () => Promise<unknown>;
  onTitle: (t: string) => void;
  onTighten: (dek: string, blocks: Block[]) => void;
  onBlock: (b: Block, how: "replace" | "insert") => void;
  onRegenerated: (draft: Draft, lockVersion: number) => void;
  onUsedAi: () => void;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState<AssistAction | "regenerate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const uid = useRef(0);

  const ask = (action: AssistAction) => {
    setError(null);
    setBusy(action);
    start(async () => {
      const res = await assistDraft({ id: candidateId, draft, action });
      setBusy(null);
      if (res?.ok && res.data) {
        const result = res.data;
        onUsedAi();
        uid.current += 1;
        const next: Suggestion = { uid: uid.current, at: new Date().toISOString(), result, applied: null };
        setItems((list) => [next, ...list].slice(0, 8));
      } else setError(res && !res.ok ? res.error : "제안을 받지 못했습니다.");
    });
  };

  const regenerate = () => {
    if (!window.confirm("초안 전체를 원천 자료로 다시 생성합니다.\n지금 편집한 제목·시그널·본문 블록이 모두 대체됩니다. 계속할까요?")) return;
    setError(null);
    setBusy("regenerate");
    start(async () => {
      await beforeRegenerate();
      const res = await regenerateDraft({ id: candidateId });
      setBusy(null);
      if (res?.ok && res.data) {
        onUsedAi();
        onRegenerated(res.data.draft, res.data.lockVersion);
        setItems([]);
      } else setError(res && !res.ok ? res.error : "초안을 다시 만들지 못했습니다.");
    });
  };

  const mark = (uid: number, label: string) => setItems((list) => list.map((s) => (s.uid === uid ? { ...s, applied: label } : s)));
  const dismiss = (uid: number) => setItems((list) => list.filter((s) => s.uid !== uid));
  const disabled = readOnly || invalid || busy != null;

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/[0.05] px-3 py-2 text-[12px] leading-relaxed text-fg-2">
        <Badge tone="warn">모의</Badge>
        <span>모의 생성 — 3단계에서 실제 AI로 교체됩니다. 제안은 ‘적용’을 누르기 전까지 초안에 반영되지 않습니다.</span>
      </p>

      {readOnly ? (
        <p className="text-[12.5px] text-fg-3">발행된 후보에는 어시스트를 쓸 수 없습니다.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={disabled}
                onClick={() => ask(a.id)}
                className="flex flex-col items-start gap-0.5 rounded-lg border border-line-2 bg-bg-1 px-2.5 py-2 text-left transition-colors hover:border-ice/50 hover:bg-ice/[0.04] disabled:opacity-45 disabled:hover:border-line-2 disabled:hover:bg-bg-1"
              >
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
                  {busy === a.id ? (
                    <span className="size-3 animate-spin rounded-full border-2 border-ice border-t-transparent" aria-hidden="true" />
                  ) : (
                    <Icon name="spark" size={12} className="text-ice" />
                  )}
                  {a.label}
                </span>
                <span className="text-[11px] leading-snug text-fg-3">{a.hint}</span>
              </button>
            ))}
            <button
              type="button"
              disabled={disabled}
              onClick={regenerate}
              className="flex flex-col items-start gap-0.5 rounded-lg border border-dashed border-line-2 px-2.5 py-2 text-left transition-colors hover:border-warn/50 hover:bg-warn/[0.04] disabled:opacity-45"
            >
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
                {busy === "regenerate" ? (
                  <span className="size-3 animate-spin rounded-full border-2 border-warn border-t-transparent" aria-hidden="true" />
                ) : (
                  <Icon name="bolt" size={12} className="text-warn" />
                )}
                초안 다시 생성
              </span>
              <span className="text-[11px] leading-snug text-fg-3">현재 초안을 대체합니다</span>
            </button>
          </div>
          {invalid && <p className="text-[12px] text-warn">본문 입력 오류를 먼저 고치면 어시스트를 쓸 수 있습니다.</p>}
        </>
      )}

      {error && (
        <p role="alert" className="text-[12.5px] text-bad">
          {error}
        </p>
      )}

      <div aria-live="polite" className="space-y-3">
        {items.length === 0 && !readOnly && (
          <p className="rounded-xl border border-dashed border-line-2 px-4 py-6 text-center text-[12px] leading-relaxed text-fg-4">
            위 버튼으로 제안을 받으면 여기에 쌓입니다. 원문 대조와 사실 확인은 편집자 몫입니다.
          </p>
        )}
        {items.map((s) => (
          <SuggestionCard
            key={s.uid}
            s={s}
            draft={draft}
            existing={existing}
            readOnly={readOnly}
            onDismiss={() => dismiss(s.uid)}
            onTitle={(t) => {
              onTitle(t);
              mark(s.uid, `제목 적용: ${t}`);
            }}
            onTighten={(dek, blocks) => {
              onTighten(dek, blocks);
              mark(s.uid, "간결화 적용");
            }}
            onBlock={(b, how) => {
              onBlock(b, how);
              mark(s.uid, how === "replace" ? "블록 교체" : "블록 추가");
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({
  s,
  draft,
  existing,
  readOnly,
  onDismiss,
  onTitle,
  onTighten,
  onBlock,
}: {
  s: Suggestion;
  draft: Draft;
  existing: ReadonlySet<BlockType>;
  readOnly: boolean;
  onDismiss: () => void;
  onTitle: (t: string) => void;
  onTighten: (dek: string, blocks: Block[]) => void;
  onBlock: (b: Block, how: "replace" | "insert") => void;
}) {
  const r = s.result;
  const title = ACTIONS.find((a) => a.id === r.action)?.label ?? r.action;
  return (
    <article className={cx("rounded-xl border bg-bg-1", s.applied ? "border-good/30" : "border-line-2")}>
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Icon name="spark" size={12} className="text-ice" />
        <h3 className="text-[12.5px] font-semibold text-fg">{title}</h3>
        <span className="tabular font-mono text-[10.5px] text-fg-4">{clockSecKST(s.at)}</span>
        <button type="button" onClick={onDismiss} aria-label="제안 닫기" className="ml-auto grid size-6 place-items-center rounded text-fg-4 hover:bg-bg-3 hover:text-fg">
          <Icon name="close" size={12} />
        </button>
      </header>
      <div className="space-y-2.5 px-3 py-2.5">
        {r.action === "headlines" && (
          <ul className="space-y-1.5">
            {r.titles.map((t) => (
              <li key={t} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
                <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-fg">{t}</span>
                <span className={cx("tabular shrink-0 font-mono text-[10.5px]", t.length > 45 ? "text-warn" : "text-fg-4")}>{t.length}자</span>
                {!readOnly && (
                  <button type="button" onClick={() => onTitle(t)} disabled={draft.title === t} className={cx(btn.base, btn.ghost, "h-7 shrink-0 px-2 text-[12px]")}>
                    {draft.title === t ? "적용됨" : "적용"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {r.action === "tighten" && <TightenDiff draft={draft} dek={r.dek} blocks={r.blocks} />}
        {(r.action === "why" || r.action === "numbers" || r.action === "next") && <BlockGlimpse block={r.block} />}

        <p className="text-[11.5px] leading-relaxed text-fg-3">{r.note}</p>

        {!readOnly && r.action === "tighten" && (
          <button type="button" onClick={() => onTighten(r.dek, r.blocks)} className={cx(btn.base, btn.ghost, "h-7 px-2.5 text-[12px]")}>
            시그널·본문에 적용
          </button>
        )}
        {!readOnly && (r.action === "why" || r.action === "numbers" || r.action === "next") && (
          <div className="flex flex-wrap gap-1.5">
            {existing.has(r.block.type) ? (
              <>
                <button type="button" onClick={() => onBlock(r.block, "replace")} className={cx(btn.base, btn.ghost, "h-7 px-2.5 text-[12px]")}>
                  기존 ‘{blockTitle(r.block)}’ 교체
                </button>
                <button type="button" onClick={() => onBlock(r.block, "insert")} className={cx(btn.base, btn.quiet, "h-7 px-2.5 text-[12px]")}>
                  새 블록으로 추가
                </button>
              </>
            ) : (
              <button type="button" onClick={() => onBlock(r.block, "insert")} className={cx(btn.base, btn.ghost, "h-7 px-2.5 text-[12px]")}>
                블록 삽입
              </button>
            )}
          </div>
        )}
        {s.applied && (
          <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-good">
            <Icon name="check" size={12} /> {s.applied}
          </p>
        )}
      </div>
    </article>
  );
}

function TightenDiff({ draft, dek, blocks }: { draft: Draft; dek: string; blocks: Block[] }) {
  const before = plainText("", draft.dek, draft.blocks).replace(/\s+/g, "").length;
  const after = plainText("", dek, blocks).replace(/\s+/g, "").length;
  const pct = before ? Math.round(((after - before) / before) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-line px-2.5 py-2">
        <p className="kicker mb-1 text-fg-4">시그널</p>
        <p className="text-[12.5px] leading-relaxed text-fg-2">{dek}</p>
      </div>
      <p className="tabular flex items-center gap-2 font-mono text-[11.5px] text-fg-3">
        본문 {before.toLocaleString("ko-KR")}자 → {after.toLocaleString("ko-KR")}자
        <span className={pct < 0 ? "text-good" : "text-fg-4"}>{pct <= 0 ? `${pct}%` : `+${pct}%`}</span>
      </p>
    </div>
  );
}

function BlockGlimpse({ block }: { block: Block }) {
  if (block.type === "numbers") {
    return (
      <dl className="grid grid-cols-2 gap-1.5">
        {block.items.map((n, i) => (
          <div key={i} className="rounded-lg border border-line px-2.5 py-1.5">
            <dd className="tabular text-[15px] font-bold text-fg">{n.value}</dd>
            <dt className="text-[11.5px] text-fg-3">{n.label}</dt>
          </div>
        ))}
      </dl>
    );
  }
  if (block.type === "why" || block.type === "next") {
    return (
      <ul className="space-y-1">
        {block.items.map((t, i) => (
          <li key={i} className="relative pl-3.5 text-[12.5px] leading-relaxed text-fg-2">
            <span className="absolute left-0 top-[0.65em] size-1 rounded-full bg-ice/70" aria-hidden="true" />
            {t}
          </li>
        ))}
      </ul>
    );
  }
  return null;
}
