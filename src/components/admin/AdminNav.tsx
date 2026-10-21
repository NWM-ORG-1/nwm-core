"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type Ref } from "react";
import { cx } from "./ui";

export interface AdminNavItem {
  href: string;
  label: string;
  count?: number;
  alert?: boolean;
}

function isActive(href: string, active: string | undefined) {
  if (active == null) return false;
  return href === "/admin" ? active === "/admin" : active === href || active.startsWith(`${href}/`);
}

export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  return <AdminNavList items={items} active={pathname} />;
}

export function AdminNavList({ items, active }: { items: AdminNavItem[]; active?: string }) {
  return (
    <ul className="space-y-0.5">
      {items.map((it) => {
        const on = isActive(it.href, active);
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={on ? "page" : undefined}
              className={cx(
                "flex h-9 items-center justify-between gap-2 rounded-lg px-3 text-[13.5px] font-medium transition-colors",
                on ? "bg-bg-3 text-fg" : "text-fg-3 hover:bg-bg-2 hover:text-fg",
              )}
            >
              <span>{it.label}</span>
              {it.count ? (
                <span className={cx("tabular rounded-md px-1.5 font-mono text-[11px]", it.alert ? "bg-bad/15 text-bad" : "bg-bg-2 text-fg-3")}>{it.count}</span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────────────────── mobile (below lg) ───────────────────────── */

/** Horizontally scrollable nav pills for the compact top bar. Keeps the current section in view. */
export function AdminNavPills({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  const scroller = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const ul = scroller.current;
    const el = ul?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ul || !el) return;
    const box = ul.getBoundingClientRect();
    const pill = el.getBoundingClientRect();
    if (box.width === 0) return; // hidden (≥ lg)
    const target = ul.scrollLeft + (pill.left - box.left) - (box.width - pill.width) / 2;
    ul.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [pathname]);

  return <AdminNavPillsList items={items} active={pathname} listRef={scroller} />;
}

export function AdminNavPillsList({
  items,
  active,
  listRef,
}: {
  items: AdminNavItem[];
  active?: string;
  listRef?: Ref<HTMLUListElement>;
}) {
  return (
    <ul
      ref={listRef}
      className="no-scrollbar flex items-center gap-1 overflow-x-auto overscroll-x-contain px-1 py-1 [mask-image:linear-gradient(90deg,transparent,#000_10px,#000_calc(100%-18px),transparent)]"
    >
      {items.map((it) => {
        const on = isActive(it.href, active);
        return (
          <li key={it.href} className="shrink-0">
            <Link
              href={it.href}
              aria-current={on ? "page" : undefined}
              className={cx(
                "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition-colors",
                on ? "bg-bg-3 text-fg shadow-[inset_0_0_0_1px_var(--line-2)]" : "text-fg-3 hover:bg-bg-2 hover:text-fg",
              )}
            >
              {it.label}
              {it.count ? (
                <span className={cx("tabular rounded-full px-1.5 font-mono text-[10.5px] leading-[16px]", it.alert ? "bg-bad/15 text-bad" : "bg-bg-2 text-fg-3")}>
                  {it.count}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
