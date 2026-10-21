"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SearchRecord } from "@/data/dto";
import type { Beat } from "@/db/schema";
import { BEATS, BEAT_ORDER } from "@/lib/beats";
import { setQueue } from "@/lib/client/reading";
import { readPrefs, writePrefs } from "@/lib/prefs";
import { searchIndex } from "@/lib/search";
import { beatDotClass } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";

let indexPromise: Promise<SearchRecord[]> | null = null;
function loadIndex() {
  indexPromise ??= fetch("/api/search-index")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => {
      indexPromise = null;
      return [];
    });
  return indexPromise;
}

type Row =
  | { kind: "article"; slug: string; title: string; dek: string; beat: Beat }
  | { kind: "command"; id: string; label: string; hint: string; run: () => void };

const SHORTCUTS: Array<[string, string]> = [
  ["⌘K  /", "검색 열기"],
  ["J  →", "다음 기사"],
  ["K  ←", "이전 기사"],
  ["S", "기사 링크 복사"],
  ["?", "단축키 보기"],
  ["Esc", "닫기"],
];

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<SearchRecord[] | null>(null);
  const [cursor, setCursor] = useState(0);
  const [help, setHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let alive = true;
    loadIndex().then((r) => alive && setIndex(r));
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      alive = false;
      document.body.style.overflow = prev;
    };
  }, []);

  // A hidden (Activity) route must not keep the palette open.
  useLayoutEffect(() => () => onClose(), [onClose]);

  const rows: Row[] = useMemo(() => {
    const go = (href: string) => () => {
      onClose();
      router.push(href);
    };
    const commands: Row[] = [
      ...BEAT_ORDER.map((b) => ({ kind: "command" as const, id: `beat-${b}`, label: `${BEATS[b].label} 섹션`, hint: BEATS[b].path, run: go(BEATS[b].path) })),
      { kind: "command", id: "latest", label: "최신 기사 전체", hint: "/latest", run: go("/latest") },
      {
        kind: "command",
        id: "theme",
        label: "다크 ↔ 라이트 읽기 전환",
        hint: "화면",
        run: () => {
          const p = readPrefs();
          writePrefs({ ...p, theme: p.theme === "dark" ? "light" : "dark" });
          onClose();
        },
      },
      { kind: "command", id: "help", label: "키보드 단축키", hint: "?", run: () => setHelp(true) },
    ];
    if (!q.trim()) return commands;
    const hits = index ? searchIndex(index, q, 24) : [];
    const cmd = commands.filter((c) => c.kind === "command" && c.label.toLowerCase().includes(q.trim().toLowerCase()));
    return [...hits.map((h) => ({ kind: "article" as const, slug: h.slug, title: h.title, dek: h.dek, beat: h.beat })), ...cmd];
  }, [q, index, onClose, router]);

  useEffect(() => setCursor(0), [q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const activate = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === "command") return row.run();
    const articles = rows.filter((r): r is Extract<Row, { kind: "article" }> => r.kind === "article");
    setQueue({ ctx: `search:${q}`, label: `검색 · ${q}`, items: articles.map((a) => ({ s: a.slug, t: a.title, b: a.beat })) });
    onClose();
    router.push(`/a/${row.slug}`, { transitionTypes: ["open"] });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (help) setHelp(false);
      else onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(rows.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(rows[cursor]);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 pt-[12vh]" role="presentation" onKeyDown={onKey}>
      <button type="button" aria-label="닫기" className="animate-fade-in absolute inset-0 bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="검색"
        className="animate-rise relative w-full max-w-[640px] overflow-hidden rounded-2xl border border-line-2 bg-bg-1 shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon name="search" size={18} className="text-fg-3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="기사·키워드 검색 (초성 검색 지원: ㅎㅂㅂㄷ)"
            aria-label="검색어"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={rows[cursor] ? `palette-row-${cursor}` : undefined}
            className="h-14 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-fg-4"
          />
          <kbd className="hud rounded-md border border-line px-1.5 py-0.5 !text-[10px] text-fg-4">ESC</kbd>
        </div>

        {help ? (
          <div className="p-5">
            <p className="kicker mb-3 text-fg-3">키보드 단축키</p>
            <dl className="grid grid-cols-[96px_1fr] gap-y-2.5 text-[14px]">
              {SHORTCUTS.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt>
                    <kbd className="hud rounded-md border border-line px-1.5 py-0.5 text-fg-2">{k}</kbd>
                  </dt>
                  <dd className="text-fg-2">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <ul id="palette-list" ref={listRef} role="listbox" className="max-h-[56vh] overflow-y-auto p-2">
            {q.trim() && index && rows.length === 0 && <li className="px-3 py-8 text-center text-[14px] text-fg-3">‘{q}’에 맞는 기사가 없습니다.</li>}
            {q.trim() && !index && <li className="px-3 py-8 text-center text-[14px] text-fg-3">검색 색인을 불러오는 중…</li>}
            {!q.trim() && <li className="kicker px-3 pb-1 pt-2 text-fg-4">바로가기</li>}
            {rows.map((r, i) => (
              <li
                key={r.kind === "article" ? r.slug : r.id}
                id={`palette-row-${i}`}
                data-row={i}
                role="option"
                aria-selected={i === cursor}
                onMouseMove={() => setCursor(i)}
                onClick={() => activate(r)}
                className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ${i === cursor ? "bg-bg-2" : ""}`}
              >
                {r.kind === "article" ? (
                  <>
                    <span className={`mt-[7px] size-1.5 shrink-0 rounded-full ${beatDotClass(r.beat)}`} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-fg">{r.title}</span>
                      <span className="block truncate text-[13px] text-fg-3">{r.dek}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Icon name="arrowRight" size={14} className="mt-[3px] shrink-0 text-fg-4" />
                    <span className="flex-1 text-[14px] text-fg-2">{r.label}</span>
                    <span className="hud text-fg-4">{r.hint}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
