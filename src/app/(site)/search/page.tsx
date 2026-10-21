import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchPage } from "@/components/site/SearchPage";

export const metadata: Metadata = { title: "검색", robots: { index: false } };

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-10 pt-12 sm:px-6">
      <p className="hud text-ice">SEARCH</p>
      <h1 className="mt-3 text-[30px] font-extrabold tracking-[-0.035em] text-fg">검색</h1>
      <Suspense fallback={<div className="skeleton mt-6 h-12" />}>
        <SearchPage />
      </Suspense>
    </main>
  );
}
