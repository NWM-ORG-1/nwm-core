"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchRecord } from "@/data/dto";
import type { Beat } from "@/db/schema";
import { BEATS, NAV_BEATS } from "@/lib/beats";
import { setQueue } from "@/lib/client/reading";
import { readPrefs, writePrefs } from "@/lib/prefs";
import { searchIndex } from "@/lib/search";
import { beatDotClass } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";

// Refetched after a minute (the route's max-age) so long-lived tabs see new and unpublished articles.
const INDEX_TTL = 60_000;
let cached: { at: number; p: Promise<SearchRecord[]> } | null = null;
let lastIndex: SearchRecord[] | null = null;
function loadIndex() {
  if (!cached || Date.now() - cached.at > INDEX_TTL) {
    const p: Promise<SearchRecord[]> = fetch("/api/search-index")
      .then((r) => (r.ok ? (r.json() as Promise<SearchRecord[]>) : Promise.reject(r.status)))
      .then((rows) => (lastIndex = rows))
      .catch(() => {
        if (cached?.p === p) cached = null;
        return lastIndex ?? [];
      });
    cached = { at: Date.now(), p };
  }
  return cached.p;
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
  const [index, setIndex] = useState<SearchRecord[] | null>(lastIndex);
  const [cursor, setCursor] = useState(0);
  const [help, setHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let alive = true;
    loadIndex().then((r) => alive && setIndex(r));
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Back/forward navigates without going through the palette, so close on it too.
    const onPop = () => onCloseRef.current();
    window.addEventListener("popstate", onPop);
    return () => {
      alive = false;
      document.body.style.overflow = prev;
      window.removeEventListener("popstate", onPop);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const rows: Row[] = useMemo(() => {
    const go = (href: string) => () => {
      onClose();
      router.push(href);
    };
    const commands: Row[] = [
      ...NAV_BEATS.map((b) => ({ kind: "command" as const, id: `beat-${b}`, label: `${BEATS[b].label} 섹션`, hint: BEATS[b].path, run: go(BEATS[b].path) })),
      { kind: "command", id: "latest", label: "최신 기사 전체", hint: "/latest", run: go("/latest") },
      {
        kind: "command",
        id: "theme",
        label: "밝은 화면 / 어두운 화면 전환",
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
    } else if (e.key === "Tab") {
      // The input is the dialog's only control; keep focus inside the modal.
      e.preventDefault();
      inputRef.current?.focus();
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
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
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
          <div className="max-h-[56vh] overflow-y-auto p-2">
            {!q.trim() && (
              <p id="palette-label" className="kicker px-3 pb-1 pt-2 text-fg-4">
                바로가기
              </p>
            )}
            <p role="status" className={q.trim() && (!index || rows.length === 0) ? "px-3 py-8 text-center text-[14px] text-fg-3" : "sr-only"}>
              {!q.trim() ? "" : !index ? "검색 색인을 불러오는 중…" : rows.length === 0 ? `‘${q}’에 맞는 기사가 없습니다.` : `${rows.length}건`}
            </p>
            <ul id="palette-list" ref={listRef} role="listbox" aria-label={q.trim() ? "검색 결과" : "바로가기"}>
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
          </div>
        )}
      </div>
    </div>
  );
}
