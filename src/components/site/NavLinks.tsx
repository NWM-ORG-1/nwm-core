"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";

export function NavLinks() {
  const pathname = usePathname();
  return <NavList active={pathname} />;
}

/** Same markup without an active state — the Suspense fallback during prerender. */
export function NavList({ active }: { active?: string | null }) {
  return (
    <nav aria-label="분야" className="min-w-0">
      <ul className="no-scrollbar flex items-center gap-0.5 overflow-x-auto">
        {NAV.map((n) => {
          const on = active != null && (n.href === "/" ? active === "/" : active.startsWith(n.href));
          return (
            <li key={n.href} className="shrink-0">
              <Link
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`relative inline-flex h-9 items-center rounded-full px-3 text-[14px] font-semibold tracking-[-0.01em] transition-colors ${
                  on ? "text-fg" : "text-fg-3 hover:text-fg"
                }`}
              >
                {n.label}
                {on && <span className="absolute inset-x-3 -bottom-[11px] h-px" style={{ background: "var(--grad-ice-soft)" }} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
