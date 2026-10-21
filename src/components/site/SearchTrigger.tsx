"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import { Icon } from "@/components/ui/Icon";

type PaletteProps = { onClose: () => void };

/** ⌘K / Ctrl+K / "/" opens search. The palette chunk loads on first intent. */
export function SearchTrigger() {
  const [open, setOpen] = useState(false);
  const [Palette, setPalette] = useState<ComponentType<PaletteProps> | null>(null);

  const load = useCallback(() => {
    if (!Palette) import("./CommandPalette").then((m) => setPalette(() => m.CommandPalette));
  }, [Palette]);

  const show = useCallback(() => {
    load();
    setOpen(true);
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    const openEvt = () => show();
    window.addEventListener("nwm:search", openEvt);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("nwm:search", openEvt);
    };
  }, [show]);

  return (
    <>
      <button
        type="button"
        onClick={show}
        onPointerEnter={load}
        onFocus={load}
        aria-label="검색 (⌘K)"
        className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-2.5 text-fg-3 transition-colors hover:border-line-2 hover:text-fg sm:pr-2 sm:pl-3"
      >
        <Icon name="search" size={15} />
        <span className="hidden text-[13px] sm:inline">검색</span>
        <kbd className="hud hidden rounded-md border border-line px-1.5 py-0.5 !text-[10px] text-fg-4 sm:inline">⌘K</kbd>
      </button>
      {open && Palette && <Palette onClose={() => setOpen(false)} />}
    </>
  );
}
