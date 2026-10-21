import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/ui";
import { SettingsBody, SettingsSkeleton } from "@/components/admin/dashboard/Settings";

export const metadata: Metadata = { title: "설정" };

/** 법정 표기 (statutory imprint) editor and the pre-launch operations checklist. */
export default function SettingsPage() {
  return (
    <>
      <PageHeader
        kicker="SETTINGS"
        title="설정"
        description="인터넷신문 법정 표기와 출시 전 운영 점검 항목. 비밀값은 화면에 표시하지 않고 설정 여부만 확인합니다."
      />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsBody />
      </Suspense>
    </>
  );
}
