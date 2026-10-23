import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/ui/Wordmark";
import { NavLinks, NavList } from "./NavLinks";
import { PrefsMenu } from "./PrefsMenu";
import { SearchTrigger } from "./SearchTrigger";

export function Header() {
  return (
    <header
      className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl"
      style={{ viewTransitionName: "site-header" }}
    >
      <div className="mx-auto flex h-[var(--header-h)] max-w-[1320px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="뉴웹미디어 홈" className="shrink-0 rounded-md">
          <Wordmark />
        </Link>
        <div className="mx-2 hidden h-5 w-px bg-line-2 md:block" aria-hidden="true" />
        <div className="hidden min-w-0 flex-1 md:block">
          <Suspense fallback={<NavList />}>
            <NavLinks />
          </Suspense>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <SearchTrigger />
          <PrefsMenu />
        </div>
      </div>
      <div className="border-t border-line px-2 md:hidden">
        <Suspense fallback={<NavList />}>
          <NavLinks />
        </Suspense>
      </div>
    </header>
  );
}
