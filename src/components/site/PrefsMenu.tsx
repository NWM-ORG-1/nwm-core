"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { DEFAULT_PREFS, readPrefs, writePrefs, type Prefs } from "@/lib/prefs";

/** "Aa" — light reading mode and text size, stored on this device. */
export function PrefsMenu() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Close when the route is hidden by Activity.
  useLayoutEffect(() => () => setOpen(false), []);

  const update = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    writePrefs(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          // The palette can also switch the theme, so read the stored prefs each time the menu opens.
          if (!open) setPrefs(readPrefs());
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="읽기 설정"
        className="inline-flex size-9 items-center justify-center rounded-full text-fg-3 hover:bg-bg-2 hover:text-fg transition-colors"
      >
        <span className="text-[15px] font-bold tracking-[-0.04em]">Aa</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="읽기 설정"
          className="animate-rise absolute right-0 top-11 z-50 w-64 rounded-2xl border border-line-2 bg-bg-1 p-3 shadow-[var(--shadow-pop)]"
        >
          <p className="kicker px-1 pb-2 text-fg-3">화면</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => update({ theme: t })}
                aria-pressed={prefs.theme === t}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-semibold transition-colors ${
                  prefs.theme === t ? "border-ice/60 bg-bg-2 text-fg" : "border-line text-fg-3 hover:text-fg"
                }`}
              >
                <Icon name={t === "dark" ? "moon" : "sun"} size={14} />
                {t === "dark" ? "어둡게" : "밝게"}
              </button>
            ))}
          </div>
          <p className="kicker px-1 pb-2 pt-4 text-fg-3">글자 크기</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(["sm", "md", "lg"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => update({ size: s })}
                aria-pressed={prefs.size === s}
                className={`rounded-xl border py-2 font-semibold transition-colors ${
                  prefs.size === s ? "border-ice/60 bg-bg-2 text-fg" : "border-line text-fg-3 hover:text-fg"
                } ${s === "sm" ? "text-[12px]" : s === "md" ? "text-[14px]" : "text-[16px]"}`}
              >
                {s === "sm" ? "작게" : s === "md" ? "보통" : "크게"}
              </button>
            ))}
          </div>
          <p className="px-1 pt-3 text-[11.5px] leading-relaxed text-fg-3">이 설정은 이 기기에만 저장됩니다.</p>
        </div>
      )}
    </div>
  );
}
