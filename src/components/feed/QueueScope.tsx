"use client";

import type { ReactNode } from "react";
import { setQueue, type QueueItem } from "@/lib/client/reading";

/**
 * Wraps a list. When the reader opens an article from inside it, the list's
 * order becomes the reading queue — so "next" means the next item of *this*
 * list (Inshorts/Techmeme-style), not an algorithm's guess.
 */
export function QueueScope({
  ctx,
  label,
  items,
  children,
  className,
}: {
  ctx: string;
  label: string;
  items: QueueItem[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href^='/a/']");
        if (a) setQueue({ ctx, label, items }, a.getAttribute("href")!.slice(3));
      }}
    >
      {children}
    </div>
  );
}
