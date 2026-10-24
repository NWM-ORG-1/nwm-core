import type { Metadata } from "next";
import { Suspense } from "react";
import { MiniAppGate } from "@/components/telegram/MiniApp";

export const metadata: Metadata = { title: "편집기 열기", robots: { index: false, follow: false } };

/**
 * The newsroom bot's 편집기 button opens this page inside Telegram (a Mini
 * App). It trades Telegram's launch data for a newsroom session
 * (/api/telegram/webapp) and goes on to the editor — no password inside
 * Telegram, for the editor the Telegram account is linked to.
 */
export default function MiniAppEditPage({ params }: PageProps<"/tg/edit/[id]">) {
  return (
    <Suspense fallback={<p className="px-5 pt-16 text-center text-[15px] text-fg-3">불러오는 중…</p>}>
      <Gate params={params} />
    </Suspense>
  );
}

async function Gate({ params }: Pick<PageProps<"/tg/edit/[id]">, "params">) {
  const { id } = await params;
  return <MiniAppGate candidateId={id} adminHref={`/admin/candidates/${id}`} mode="edit" />;
}
