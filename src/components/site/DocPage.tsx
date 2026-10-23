import Link from "next/link";
import type { ReactNode } from "react";

export function DocPage({ kicker, title, lead, children, updated }: { kicker: string; title: string; lead?: string; children: ReactNode; updated?: string }) {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-10 pt-12 sm:px-6">
      <p className="hud text-ice">{kicker}</p>
      <h1 className="mt-3 text-[34px] font-extrabold leading-tight tracking-[-0.035em] text-fg sm:text-[40px]">{title}</h1>
      {lead && <p className="mt-4 text-[17px] leading-relaxed text-fg-2">{lead}</p>}
      <div className="doc mt-10 space-y-8 text-[15.5px] leading-[1.8] text-fg-2">{children}</div>
      {updated && <p className="mt-12 border-t border-line pt-4 text-[12.5px] text-fg-4">시행·개정: {updated}</p>}
      <nav className="mt-8 flex flex-wrap gap-2 text-[13px]" aria-label="정책 문서">
        {[
          ["/about", "회사 소개"],
          ["/policy/ai", "AI 활용 원칙"],
          ["/policy/corrections", "정정·반론"],
          ["/policy/youth", "청소년보호정책"],
          ["/policy/privacy", "개인정보처리방침"],
          ["/policy/terms", "이용약관"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="rounded-full border border-line px-3 py-1.5 text-fg-3 hover:border-line-2 hover:text-fg">
            {label}
          </Link>
        ))}
      </nav>
    </main>
  );
}

export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[19px] font-bold tracking-[-0.02em] text-fg">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function DocList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="relative pl-5">
          <span className="absolute left-0 top-[0.75em] size-1.5 -translate-y-1/2 rounded-full bg-ice/70" aria-hidden="true" />
          {it}
        </li>
      ))}
    </ul>
  );
}
