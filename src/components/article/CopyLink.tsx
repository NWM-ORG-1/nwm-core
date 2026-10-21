"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export function CopyLink({ title }: { title: string }) {
  const [done, setDone] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-[3px] text-[11.5px] text-fg-3 transition-colors hover:border-line-2 hover:text-fg"
    >
      <Icon name={done ? "check" : "link"} size={12} />
      {done ? "복사됨" : "공유"}
    </button>
  );
}
