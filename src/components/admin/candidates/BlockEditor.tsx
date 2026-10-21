"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Block, BlockType, KeyNumber, SentimentSnapshot } from "@/lib/content/blocks";
import { SECTION_LABELS, SECTION_LABEL_KO } from "@/lib/content/meta";
import { sentimentLabel } from "@/lib/labels";
import { btn, cx } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";
import { Sparkline } from "@/components/ui/Sparkline";
import { blockTitle, type FieldIssue } from "./issues";
import { BLOCK_HINT_KO, BLOCK_LABEL_KO, f } from "./shared";

export interface KeyedBlock {
  key: string;
  block: Block;
}

type Of<T extends BlockType> = Extract<Block, { type: T }>;

let seq = 0;
export const newKey = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

export const lines = (s: string) =>
  s
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
export const commaList = (s: string) =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

const ADD_ORDER: BlockType[] = ["why", "numbers", "section", "quote", "chart", "table", "sentiment", "next", "deeper"];

export function emptyBlock(type: BlockType): Block {
  switch (type) {
    case "why":
    case "next":
      return { type, items: [] };
    case "numbers":
      return { type, items: [{ value: "", label: "" }] };
    case "section":
      return { type, label: "big_picture" };
    case "quote":
      return { type, text: "", attribution: "" };
    case "chart":
      return { type, title: "", points: [] };
    case "table":
      return { type, caption: "", columns: ["항목", "값"], rows: [["", ""]] };
    case "sentiment":
      return { type };
    case "deeper":
      return { type, links: [] };
  }
}

/* ───────────────────────────── list ───────────────────────────── */

export function BlockList({
  blocks,
  onChange,
  issues,
  disabled,
  sentiment,
  registerBlock,
}: {
  blocks: KeyedBlock[];
  onChange: (next: KeyedBlock[]) => void;
  issues: FieldIssue[];
  disabled: boolean;
  sentiment?: SentimentSnapshot | null;
  registerBlock: (key: string, el: HTMLElement | null) => void;
}) {
  const [undo, setUndo] = useState<{ item: KeyedBlock; index: number } | null>(null);
  const els = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i: number) => {
    setUndo({ item: blocks[i], index: i });
    onChange(blocks.filter((_, k) => k !== i));
  };
  const update = (i: number, block: Block) => onChange(blocks.map((b, k) => (k === i ? { ...b, block } : b)));
  const add = (type: BlockType) => {
    const key = newKey();
    onChange([...blocks, { key, block: emptyBlock(type) }]);
    // focus the new block's first field once it renders
    requestAnimationFrame(() => {
      const el = els.current.get(key);
      el?.querySelector<HTMLElement>("input,textarea,select")?.focus();
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  return (
    <div className="space-y-3">
      {blocks.length === 0 && (
        <p className="rounded-xl border border-dashed border-line-2 px-4 py-8 text-center text-[13px] leading-relaxed text-fg-3">
          본문 블록이 없습니다. ‘왜 중요한가’부터 추가해 보세요 — 시그널 아래 1–3개 이유가 기본 구조입니다.
        </p>
      )}
      {blocks.map((kb, i) => {
        const own = issues.filter((x) => x.path[0] === "blocks" && x.path[1] === i);
        return (
          <section
            key={kb.key}
            ref={(el) => {
              if (el) els.current.set(kb.key, el);
              else els.current.delete(kb.key);
              registerBlock(kb.key, el);
            }}
            aria-label={`블록 ${i + 1} · ${blockTitle(kb.block)}`}
            className={cx("rounded-xl border bg-bg-1 transition-colors", own.length ? "border-bad/40" : "border-line-2 focus-within:border-line-3")}
          >
            <header className="flex items-center gap-2 border-b border-line px-3 py-2">
              <span className="tabular font-mono text-[10.5px] text-fg-4">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="kicker text-ice">{blockTitle(kb.block)}</h3>
              <span className="hidden truncate text-[11.5px] text-fg-4 sm:inline">{kb.block.type === "section" ? "섹션" : BLOCK_HINT_KO[kb.block.type]}</span>
              {!disabled && (
                <div className="ml-auto flex items-center gap-0.5">
                  <IconBtn label="위로 이동" onClick={() => move(i, -1)} disabled={i === 0}>
                    <Icon name="chevronDown" size={14} className="rotate-180" />
                  </IconBtn>
                  <IconBtn label="아래로 이동" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>
                    <Icon name="chevronDown" size={14} />
                  </IconBtn>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="ml-1 inline-flex h-7 items-center rounded-md px-2 text-[12px] font-medium text-fg-3 transition-colors hover:bg-bad/10 hover:text-bad"
                  >
                    삭제
                  </button>
                </div>
              )}
            </header>
            <div className="p-3">
              <BlockBody block={kb.block} onChange={(b) => update(i, b)} issues={own} sentiment={sentiment} />
              {own.length > 0 && (
                <ul className="mt-2.5 space-y-0.5" aria-label="입력 확인">
                  {own.map((x, k) => (
                    <li key={k} className="flex gap-1.5 text-[11.5px] text-bad">
                      <Icon name="alert" size={12} className="mt-[2px] shrink-0" />
                      <span>
                        {whereRel(x)} {x.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      })}

      {undo && (
        <p role="status" className="flex items-center gap-3 rounded-lg border border-line-2 bg-bg-2 px-3 py-2 text-[12.5px] text-fg-2">
          ‘{blockTitle(undo.item.block)}’ 블록을 삭제했습니다.
          <button
            type="button"
            onClick={() => {
              const next = [...blocks];
              next.splice(Math.min(undo.index, next.length), 0, undo.item);
              onChange(next);
              setUndo(null);
            }}
            className="font-semibold text-ice hover:underline"
          >
            되돌리기
          </button>
        </p>
      )}

      {!disabled && <AddBlockMenu onAdd={add} hasSentiment={Boolean(sentiment)} count={blocks.length} />}
    </div>
  );
}

function whereRel(x: FieldIssue) {
  // drop the leading "본문 블록 n" — the card already says which block
  const w = x.where.replace(/^본문 블록 \d+\s*/, "");
  return w ? `${w}:` : "";
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/* ───────────────────────────── add menu ───────────────────────────── */

function AddBlockMenu({ onAdd, hasSentiment, count }: { onAdd: (t: BlockType) => void; hasSentiment: boolean; count: number }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const full = count >= 16;

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // transient: never come back to an open menu after the route was hidden
  useLayoutEffect(() => () => setOpen(false), []);

  const onKey = (e: React.KeyboardEvent) => {
    const list = items.current.filter(Boolean) as HTMLButtonElement[];
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(at + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(at - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        disabled={full}
        onClick={() => setOpen((o) => !o)}
        className={cx(btn.base, "h-10 w-full border border-dashed border-line-2 text-fg-2 hover:border-ice/50 hover:bg-ice/[0.04] hover:text-fg")}
      >
        <Icon name="plus" size={14} strokeWidth={2.2} /> 블록 추가
        {full && <span className="text-[11.5px] font-normal text-fg-4">(최대 16개)</span>}
      </button>
      {open && (
        <div
          id={`${id}-menu`}
          role="menu"
          aria-label="블록 종류"
          onKeyDown={onKey}
          className="absolute inset-x-0 bottom-full z-30 mb-2 grid gap-0.5 rounded-xl border border-line-2 bg-bg-1 p-1.5 shadow-[var(--shadow-pop)] animate-fade-in sm:grid-cols-2"
        >
          {ADD_ORDER.map((t, k) => (
            <button
              key={t}
              ref={(el) => {
                items.current[k] = el;
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                onAdd(t);
                setOpen(false);
              }}
              className="flex flex-col items-start rounded-lg px-3 py-2 text-left transition-colors hover:bg-bg-3 focus:bg-bg-3 focus:outline-none"
            >
              <span className="text-[13px] font-semibold text-fg">{BLOCK_LABEL_KO[t]}</span>
              <span className="text-[11.5px] leading-snug text-fg-3">
                {t === "sentiment" && !hasSentiment ? "센티먼트 스냅샷이 없으면 표시되지 않습니다" : BLOCK_HINT_KO[t]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── typed editors ───────────────────────────── */

function BlockBody({ block, onChange, issues, sentiment }: { block: Block; onChange: (b: Block) => void; issues: FieldIssue[]; sentiment?: SentimentSnapshot | null }) {
  const bad = (field: string) => issues.some((x) => x.path[2] === field);
  switch (block.type) {
    case "why":
    case "next":
      return <ItemsEditor block={block} onChange={onChange} invalid={bad("items")} />;
    case "numbers":
      return <NumbersEditor block={block} onChange={onChange} issues={issues} />;
    case "section":
      return <SectionEditor block={block} onChange={onChange} bad={bad} />;
    case "quote":
      return <QuoteEditor block={block} onChange={onChange} bad={bad} />;
    case "chart":
      return <ChartEditor block={block} onChange={onChange} bad={bad} />;
    case "table":
      return <TableEditor block={block} onChange={onChange} bad={bad} />;
    case "sentiment":
      return <SentimentNote sentiment={sentiment} />;
    case "deeper":
      return <DeeperEditor block={block} onChange={onChange} invalid={bad("links")} />;
  }
}

function Row({ label, htmlFor, aside, help, children, className }: { label: string; htmlFor: string; aside?: ReactNode; help?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={htmlFor} className={f.label}>
        <span>{label}</span>
        {aside}
      </label>
      {children}
      {help && <p className={f.help}>{help}</p>}
    </div>
  );
}

function Count({ n, max, warnAt }: { n: number; max: number; warnAt?: number }) {
  return <span className={cx("tabular font-mono text-[10.5px] font-normal", n > max ? "text-bad" : warnAt != null && n > warnAt ? "text-warn" : "text-fg-4")}>{`${n}/${max}`}</span>;
}

function ItemsEditor({ block, onChange, invalid }: { block: Of<"why"> | Of<"next">; onChange: (b: Block) => void; invalid: boolean }) {
  const id = useId();
  const [text, setText] = useState(block.items.join("\n"));
  const n = lines(text).length;
  return (
    <Row label="한 줄에 하나씩 (최대 3개)" htmlFor={id} aside={<Count n={n} max={3} />} help="**굵게**만 지원합니다. 한 항목은 한 문장으로.">
      <textarea
        id={id}
        rows={Math.min(8, Math.max(3, n + 1))}
        value={text}
        aria-invalid={invalid || undefined}
        placeholder={block.type === "why" ? "독자가 지금 이 소식을 알아야 하는 이유" : "다음에 지켜볼 일정·지표·발표"}
        onChange={(e) => {
          setText(e.target.value);
          onChange({ ...block, items: lines(e.target.value) });
        }}
        className={f.textarea}
      />
    </Row>
  );
}

const TRENDS: Array<{ v: "" | "up" | "down" | "flat"; label: string }> = [
  { v: "", label: "—" },
  { v: "up", label: "▲ 상승" },
  { v: "down", label: "▼ 하락" },
  { v: "flat", label: "보합" },
];

function NumbersEditor({ block, onChange, issues }: { block: Of<"numbers">; onChange: (b: Block) => void; issues: FieldIssue[] }) {
  const id = useId();
  const set = (k: number, patch: Partial<KeyNumber>) => onChange({ ...block, items: block.items.map((n, j) => (j === k ? clean({ ...n, ...patch }) : n)) });
  const bad = (k: number, field: string) => issues.some((x) => x.path[2] === "items" && x.path[3] === k && (x.path[4] === field || x.path.length === 4));
  return (
    <div className="space-y-2">
      <div className="hidden gap-2 pr-9 sm:grid sm:grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_minmax(0,5.5rem)_5.75rem]" aria-hidden="true">
        {["값", "라벨", "변화", "추세"].map((h) => (
          <span key={h} className="kicker text-fg-4">
            {h}
          </span>
        ))}
      </div>
      {block.items.map((n, k) => (
        <div key={k} className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_minmax(0,5.5rem)_5.75rem]">
            <input
              id={k === 0 ? id : undefined}
              aria-label={`${k + 1}행 값`}
              value={n.value}
              maxLength={24}
              placeholder={k === 0 ? "₩98조" : undefined}
              aria-invalid={bad(k, "value") || undefined}
              onChange={(e) => set(k, { value: e.target.value })}
              className={cx(f.input, "tabular font-mono")}
            />
            <input
              aria-label={`${k + 1}행 라벨`}
              value={n.label}
              maxLength={60}
              placeholder={k === 0 ? "3분기 영업이익" : undefined}
              aria-invalid={bad(k, "label") || undefined}
              onChange={(e) => set(k, { label: e.target.value })}
              className={f.input}
            />
            <input
              aria-label={`${k + 1}행 변화`}
              value={n.delta ?? ""}
              maxLength={24}
              placeholder={k === 0 ? "+12.4%" : undefined}
              onChange={(e) => set(k, { delta: e.target.value })}
              className={cx(f.input, "tabular font-mono")}
            />
            <select
              aria-label={`${k + 1}행 추세`}
              value={n.trend ?? ""}
              onChange={(e) => set(k, { trend: (e.target.value || undefined) as KeyNumber["trend"] })}
              className={f.select}
            >
              {TRENDS.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            aria-label={`${k + 1}행 삭제`}
            title="행 삭제"
            disabled={block.items.length <= 1}
            onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== k) })}
            className="grid size-7 shrink-0 translate-y-1 place-items-center rounded-md text-fg-3 hover:bg-bad/10 hover:text-bad disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <button
          type="button"
          disabled={block.items.length >= 4}
          onClick={() => onChange({ ...block, items: [...block.items, { value: "", label: "" }] })}
          className={cx(btn.base, btn.quiet, "h-7 px-2 text-[12px]")}
        >
          <Icon name="plus" size={12} /> 수치 추가
        </button>
        <span className="text-[11.5px] text-fg-4">
          {block.items.length}/4 · 상승 빨강 ▲ · 하락 파랑 ▼ (국내 시장 관례)
        </span>
      </div>
    </div>
  );
}

function clean(n: KeyNumber): KeyNumber {
  const out: KeyNumber = { value: n.value, label: n.label };
  if (n.delta) out.delta = n.delta;
  if (n.trend) out.trend = n.trend;
  return out;
}

function SectionEditor({ block, onChange, bad }: { block: Of<"section">; onChange: (b: Block) => void; bad: (f: string) => boolean }) {
  const id = useId();
  const [text, setText] = useState(block.text ?? "");
  const [bullets, setBullets] = useState((block.bullets ?? []).join("\n"));
  const nb = lines(bullets).length;
  const emit = (t: string, b: string) => {
    const bl = lines(b);
    const next: Of<"section"> = { type: "section", label: block.label };
    if (t.trim()) next.text = t;
    if (bl.length) next.bullets = bl;
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <Row label="라벨" htmlFor={`${id}-l`} className="max-w-[240px]">
        <select id={`${id}-l`} value={block.label} onChange={(e) => onChange({ ...block, label: e.target.value as Of<"section">["label"] })} className={f.select}>
          {SECTION_LABELS.map((l) => (
            <option key={l} value={l}>
              {SECTION_LABEL_KO[l]}
            </option>
          ))}
        </select>
      </Row>
      <Row label="단락" htmlFor={`${id}-t`} aside={<Count n={text.trim().length} max={600} warnAt={280} />} help="3문장 이내. 단락이나 불릿 중 하나는 있어야 독자에게 보입니다.">
        <textarea
          id={`${id}-t`}
          rows={3}
          value={text}
          aria-invalid={bad("text") || undefined}
          onChange={(e) => {
            setText(e.target.value);
            emit(e.target.value, bullets);
          }}
          className={f.textarea}
        />
      </Row>
      <Row label="불릿 (한 줄에 하나, 최대 5개)" htmlFor={`${id}-b`} aside={<Count n={nb} max={5} />}>
        <textarea
          id={`${id}-b`}
          rows={Math.min(7, Math.max(2, nb + 1))}
          value={bullets}
          aria-invalid={bad("bullets") || undefined}
          onChange={(e) => {
            setBullets(e.target.value);
            emit(text, e.target.value);
          }}
          className={f.textarea}
        />
      </Row>
    </div>
  );
}

function QuoteEditor({ block, onChange, bad }: { block: Of<"quote">; onChange: (b: Block) => void; bad: (f: string) => boolean }) {
  const id = useId();
  return (
    <div className="space-y-3">
      <Row label="인용문" htmlFor={`${id}-t`} aside={<Count n={block.text.trim().length} max={600} />} help="따옴표 없이 입력합니다. 원문 인용은 라이선스의 ‘원문’ 허용 범위를 지키세요.">
        <textarea id={`${id}-t`} rows={3} value={block.text} aria-invalid={bad("text") || undefined} onChange={(e) => onChange({ ...block, text: e.target.value })} className={f.textarea} />
      </Row>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="발언자" htmlFor={`${id}-a`}>
          <input id={`${id}-a`} value={block.attribution} maxLength={80} aria-invalid={bad("attribution") || undefined} onChange={(e) => onChange({ ...block, attribution: e.target.value })} className={f.input} placeholder="김OO" />
        </Row>
        <Row label="직함·소속 (선택)" htmlFor={`${id}-r`}>
          <input
            id={`${id}-r`}
            value={block.role ?? ""}
            maxLength={80}
            onChange={(e) => {
              const next = { ...block };
              if (e.target.value) next.role = e.target.value;
              else delete next.role;
              onChange(next);
            }}
            className={f.input}
            placeholder="한국은행 금융안정국장"
          />
        </Row>
      </div>
    </div>
  );
}

function parsePoints(s: string): number[] {
  return s
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (/^[+\-−]?\d*\.?\d+(e[+-]?\d+)?$/i.test(t) ? Number(t.replace("−", "-")) : Number.NaN));
}

function ChartEditor({ block, onChange, bad }: { block: Of<"chart">; onChange: (b: Block) => void; bad: (f: string) => boolean }) {
  const id = useId();
  const [raw, setRaw] = useState(block.points.join(", "));
  const valid = block.points.filter((p) => Number.isFinite(p));
  const nBad = block.points.length - valid.length;
  const opt = (k: "unit" | "source", v: string) => {
    const next = { ...block };
    if (v) next[k] = v;
    else delete next[k];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
        <Row label="차트 제목" htmlFor={`${id}-t`}>
          <input id={`${id}-t`} value={block.title} maxLength={80} aria-invalid={bad("title") || undefined} onChange={(e) => onChange({ ...block, title: e.target.value })} className={f.input} placeholder="원/달러 환율 30일" />
        </Row>
        <Row label="단위" htmlFor={`${id}-u`}>
          <input id={`${id}-u`} value={block.unit ?? ""} maxLength={12} onChange={(e) => opt("unit", e.target.value)} className={f.input} placeholder="원, %, $" />
        </Row>
      </div>
      <Row
        label="데이터 (쉼표로 구분, 오래된 값부터)"
        htmlFor={`${id}-p`}
        aside={<Count n={block.points.length} max={96} />}
        help={nBad ? <span className="text-bad">숫자가 아닌 값 {nBad}개 — 천 단위 쉼표 없이 입력하세요.</span> : "최소 2개. 천 단위 쉼표 없이 1384.5, 1391.2 처럼 입력합니다."}
      >
        <textarea
          id={`${id}-p`}
          rows={2}
          value={raw}
          aria-invalid={bad("points") || undefined}
          onChange={(e) => {
            setRaw(e.target.value);
            onChange({ ...block, points: parsePoints(e.target.value) });
          }}
          className={cx(f.textarea, "tabular font-mono text-[12.5px]")}
          placeholder="1384.5, 1391.2, 1388.0, 1402.7"
        />
      </Row>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Row label="출처 (선택)" htmlFor={`${id}-s`}>
          <input id={`${id}-s`} value={block.source ?? ""} maxLength={80} onChange={(e) => opt("source", e.target.value)} className={f.input} placeholder="한국은행 ECOS" />
        </Row>
        <div className="flex h-9 items-center gap-2 rounded-lg border border-line px-2.5" aria-label="차트 미리보기">
          {valid.length >= 2 ? (
            <>
              <Sparkline points={valid} width={110} height={24} label={`${block.title || "차트"} 미리보기`} />
              <span className="tabular font-mono text-[10.5px] text-fg-3">
                {Math.min(...valid)}–{Math.max(...valid)}
              </span>
            </>
          ) : (
            <span className="text-[11.5px] text-fg-4">값 2개 이상 입력 시 미리보기</span>
          )}
        </div>
      </div>
    </div>
  );
}

function TableEditor({ block, onChange, bad }: { block: Of<"table">; onChange: (b: Block) => void; bad: (f: string) => boolean }) {
  const id = useId();
  const [cols, setCols] = useState(block.columns.join(", "));
  const [rows, setRows] = useState(block.rows.map((r) => r.join(" | ")).join("\n"));
  const mismatch = block.rows.filter((r) => r.length !== block.columns.length).length;
  return (
    <div className="space-y-3">
      <Row label="캡션" htmlFor={`${id}-c`}>
        <input id={`${id}-c`} value={block.caption} maxLength={120} aria-invalid={bad("caption") || undefined} onChange={(e) => onChange({ ...block, caption: e.target.value })} className={f.input} placeholder="주요 가상자산 24시간 등락" />
      </Row>
      <Row label="열 (쉼표로 구분, 2–6개)" htmlFor={`${id}-h`} aside={<Count n={block.columns.length} max={6} />}>
        <input
          id={`${id}-h`}
          value={cols}
          aria-invalid={bad("columns") || undefined}
          onChange={(e) => {
            setCols(e.target.value);
            onChange({ ...block, columns: commaList(e.target.value) });
          }}
          className={f.input}
          placeholder="종목, 가격, 24h"
        />
      </Row>
      <Row
        label="행 (한 줄에 한 행, 칸은 | 로 구분)"
        htmlFor={`${id}-r`}
        aside={<Count n={block.rows.length} max={20} />}
        help={mismatch ? <span className="text-warn">열 개수와 칸 수가 다른 행 {mismatch}개 — 표가 어긋나 보입니다.</span> : "▲·+ 로 시작하는 칸은 빨강, ▼·− 는 파랑으로 표시됩니다."}
      >
        <textarea
          id={`${id}-r`}
          rows={Math.min(10, Math.max(3, block.rows.length + 1))}
          value={rows}
          aria-invalid={bad("rows") || undefined}
          onChange={(e) => {
            setRows(e.target.value);
            onChange({ ...block, rows: lines(e.target.value).map((l) => l.split("|").map((c) => c.trim())) });
          }}
          className={cx(f.textarea, "font-mono text-[12.5px]")}
          placeholder={"비트코인 | 1억 4,820만 | ▲1.24%\n이더리움 | 512만 | ▼0.31%"}
        />
      </Row>
    </div>
  );
}

function SentimentNote({ sentiment }: { sentiment?: SentimentSnapshot | null }) {
  return sentiment ? (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] text-fg-2">
      발행 시점 스냅샷이 붙어 있습니다 —
      <span className="tabular text-[15px] font-bold text-fg">{Math.round(sentiment.score)}</span>
      <span className="font-semibold">{sentimentLabel(sentiment.score)}</span>
      <span className="text-fg-3">
        · 낙관 {sentiment.bullish}% · 비관 {sentiment.bearish}%
      </span>
    </p>
  ) : (
    <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-warn">
      <Icon name="info" size={14} className="mt-0.5 shrink-0" />
      센티먼트 스냅샷이 없으면 표시되지 않습니다. 데이터 자동(B) 센티먼트 템플릿이나 수집기가 스냅샷을 붙인 초안에서 쓰세요.
    </p>
  );
}

const KINDS = ["story", "article", "primary"] as const;
const KIND_KO: Record<(typeof KINDS)[number], string> = { story: "스토리", article: "기사", primary: "1차 자료" };

function DeeperEditor({ block, onChange, invalid }: { block: Of<"deeper">; onChange: (b: Block) => void; invalid: boolean }) {
  const id = useId();
  const [raw, setRaw] = useState(block.links.map((l) => [l.title, l.href, l.kind].join(" | ")).join("\n"));
  const parse = (s: string): Of<"deeper">["links"] =>
    lines(s).map((l) => {
      const [title = "", href = "", kind = ""] = l.split("|").map((x) => x.trim());
      return { title, href, kind: (kind || "article") as (typeof KINDS)[number] };
    });
  return (
    <div className="space-y-2">
      <Row
        label="한 줄에 하나: 제목 | 주소 | 종류"
        htmlFor={id}
        aside={<Count n={block.links.length} max={5} />}
        help="주소는 /a/기사슬러그 · /s/스토리 처럼 사이트 경로, 링크가 없으면 #. 종류는 story · article · primary (생략하면 article)."
      >
        <textarea
          id={id}
          rows={Math.min(7, Math.max(3, block.links.length + 1))}
          value={raw}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            setRaw(e.target.value);
            onChange({ ...block, links: parse(e.target.value) });
          }}
          className={cx(f.textarea, "text-[12.5px]")}
          placeholder={"원화 스테이블코인, 누가 발행하나 | /s/krw-stablecoin | story\n금융위 보도자료 | # | primary"}
        />
      </Row>
      {block.links.length > 0 && (
        <ul className="space-y-1">
          {block.links.map((l, k) => (
            <li key={k} className="flex items-center gap-2 text-[12px]">
              <span className={cx("kicker shrink-0 rounded border px-1.5 !text-[10.5px]", KINDS.includes(l.kind) ? "border-line-2 text-fg-3" : "border-bad/50 text-bad")}>
                {KIND_KO[l.kind] ?? `알 수 없음: ${l.kind}`}
              </span>
              <span className="truncate text-fg-2">{l.title || "(제목 없음)"}</span>
              <span className={cx("ml-auto shrink-0 font-mono text-[11px]", l.href.startsWith("/") ? "text-ice" : "text-fg-4")}>{l.href.startsWith("/") ? l.href : "링크 없음"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
