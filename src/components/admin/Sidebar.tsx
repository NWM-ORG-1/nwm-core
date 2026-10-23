import Link from "next/link";
import { cache, Suspense } from "react";
import { getAdminShell } from "@/data/admin";
import { Icon } from "@/components/ui/Icon";
import { Wordmark } from "@/components/ui/Wordmark";
import { AdminNav, AdminNavList, AdminNavPills, AdminNavPillsList, type AdminNavItem } from "./AdminNav";
import { Badge } from "./ui";

/** One shell read per request, shared by the desktop sidebar and the mobile top bar. */
const loadShell = cache(getAdminShell);

function navItems(shell: Awaited<ReturnType<typeof getAdminShell>>): AdminNavItem[] {
  return [
    { href: "/admin", label: "대시보드" },
    { href: "/admin/feeds", label: "피드 인박스", count: shell.counts.inboxNew },
    { href: "/admin/candidates", label: "후보 보드", count: shell.counts.review },
    { href: "/admin/articles", label: "발행 기사", count: shell.counts.openRequests, alert: shell.counts.openRequests > 0 },
    { href: "/admin/stories", label: "스토리" },
    { href: "/admin/auto", label: "자동 기사" },
    { href: "/admin/sources", label: "소스", count: shell.counts.sourceErrors, alert: shell.counts.sourceErrors > 0 },
    { href: "/admin/ingest", label: "수집 현황" },
    { href: "/admin/sentiment", label: "투자심리" },
    { href: "/admin/experiments", label: "실험 (가설)" },
    { href: "/admin/activity", label: "활동 로그" },
    { href: "/admin/settings", label: "설정" },
  ];
}

export async function Sidebar() {
  const shell = await loadShell();
  const items = navItems(shell);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pb-4 pt-5">
        <Wordmark size="sm" />
        <span className="hud ml-1 text-fg-3">NEWSROOM</span>
      </div>
      {shell.demo && (
        <div className="mx-3 mb-3">
          <Badge tone="warn" title="샘플 데이터가 들어 있습니다 — 출시 전 npm run db:purge-samples">
            DEMO · 샘플 데이터
          </Badge>
        </div>
      )}
      <Link
        href="/admin/candidates/new"
        className="mx-3 mb-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ice text-[13px] font-bold text-bg hover:bg-ice-2"
      >
        ＋ 아이디어로 기사 만들기
      </Link>
      <nav aria-label="뉴스룸" className="flex-1 px-2">
        <Suspense fallback={<AdminNavList items={items} />}>
          <AdminNav items={items} />
        </Suspense>
      </nav>
      <div className="border-t border-line px-4 py-3 text-[12px] text-fg-3">
        <p className="font-semibold text-fg-2">{shell.me.name}</p>
        <p className="font-mono text-[11px]">
          {shell.me.login} · {shell.me.role}
        </p>
        <a href="/" target="_blank" rel="noreferrer" className="mt-2 inline-block text-ice hover:underline">
          사이트 보기 ↗
        </a>
      </div>
    </div>
  );
}

/**
 * Compact top bar for viewports below `lg`, where the sidebar is hidden.
 * Uses a solid-stroke mark: the sidebar's gradient <defs> live in a display:none
 * subtree at this width and would not paint.
 */
export async function MobileAdminBar() {
  const shell = await loadShell();
  const items = navItems(shell);
  return <MobileAdminBarFrame items={items} demo={shell.demo} />;
}

export function MobileAdminBarFrame({ items, demo = false }: { items?: AdminNavItem[]; demo?: boolean }) {
  return (
    <div className="flex h-12 items-center gap-1 border-b border-line bg-bg/85 pl-3 pr-2 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
      <Link href="/admin" className="flex shrink-0 items-center gap-1.5 rounded-md py-1 pr-1.5" aria-label="NWM 뉴스룸 대시보드">
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 19 18.5 5.5M8.5 5.5h10v10" fill="none" stroke="var(--ice)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[15px] font-extrabold tracking-[-0.03em] text-ice">NWM</span>
        {demo && (
          <span className="hud rounded border border-warn/40 px-1 py-px text-[9px] text-warn" title="샘플 데이터가 들어 있습니다">
            DEMO
          </span>
        )}
      </Link>
      <nav aria-label="뉴스룸" className="min-w-0 flex-1">
        {items ? (
          <Suspense fallback={<AdminNavPillsList items={items} />}>
            <AdminNavPills items={items} />
          </Suspense>
        ) : (
          <div className="flex gap-2 px-2" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-7 w-16 rounded-full" />
            ))}
          </div>
        )}
      </nav>
      <Link
        href="/admin/candidates/new"
        aria-label="아이디어로 기사 만들기"
        title="아이디어로 기사 만들기"
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-ice text-bg hover:bg-ice-2"
      >
        <Icon name="plus" size={16} strokeWidth={2.2} />
      </Link>
    </div>
  );
}
