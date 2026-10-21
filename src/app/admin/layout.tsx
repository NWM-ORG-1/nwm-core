import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileAdminBar, MobileAdminBarFrame, Sidebar } from "@/components/admin/Sidebar";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "뉴스룸", template: "%s · NWM 뉴스룸" },
  robots: { index: false, follow: false },
};

function SidebarSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="skeleton h-8" />
      ))}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <div className="skeleton h-8 w-64" />
      <div className="skeleton h-4 w-96" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <div className="skeleton h-72" />
    </div>
  );
}

/** Newsroom console. Dynamic (per-request, authenticated); never linked from public pages. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-dvh bg-bg">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-line bg-bg-1/60 lg:block">
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar />
        </Suspense>
      </aside>
      <div className="min-w-0 flex-1">
        {/* below lg the sidebar is hidden: a compact sticky bar keeps every section one tap away */}
        <div className="sticky top-0 z-40 lg:hidden">
          <Suspense fallback={<MobileAdminBarFrame />}>
            <MobileAdminBar />
          </Suspense>
        </div>
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </div>
    </div>
  );
}
