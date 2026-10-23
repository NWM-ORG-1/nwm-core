import type { ReactNode } from "react";
import { getMyProfile, getSettingsAdmin } from "@/data/admin";
import { getOpsChecklist, type CheckState } from "@/data/admin-dashboard";
import { Icon } from "@/components/ui/Icon";
import { LEGAL_DEFAULTS, LEGAL_FIELDS, legalEnvName, PENDING } from "@/lib/site";
import { cx } from "../ui";
import { AiPanel } from "./AiPanel";
import { LegalForm, type LegalFieldView } from "./LegalForm";
import { ProfileForm } from "./ProfileForm";

export async function SettingsBody() {
  const [settings, ops, me] = await Promise.all([getSettingsAdmin(), getOpsChecklist(), getMyProfile()]);
  const fields: LegalFieldView[] = LEGAL_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    env: legalEnvName(f) ?? f.env,
    stored: typeof settings.stored[f.key] === "string" ? (settings.stored[f.key] as string) : "",
    envValue: settings.env[f.key] ?? null,
    fallback: LEGAL_DEFAULTS[f.key],
  }));
  const pendingLegal = LEGAL_FIELDS.filter((f) => settings.effective[f.key] === PENDING).length;
  const registered = pendingLegal === 0;

  const items: Array<{ title: string; state: CheckState; status: string; body: ReactNode; code?: string }> = [
    {
      title: "ADMIN_USERS 설정",
      state: ops.adminUsers ? "ok" : "todo",
      status: ops.adminUsers ? "설정됨" : ops.production ? "미설정 · 로그인 불가" : "미설정 · 개발용 계정 사용 중",
      body: "뉴스룸 Basic Auth 계정 목록입니다. 비어 있으면 개발 환경은 admin / nwm-dev로 열리고, 운영 환경은 모든 접근을 거부합니다.",
      code: "npm run hash-password",
    },
    {
      title: "INTERNAL_API_SECRET",
      state: ops.internalSecret === "ok" ? "ok" : "todo",
      status: ops.internalSecret === "ok" ? "설정됨" : ops.internalSecret === "weak" ? "기본값이거나 24자 미만" : "미설정",
      body: "예약 발행 스케줄러와 피드 워커가 /api/internal/* 를 호출할 때 쓰는 Bearer 토큰입니다.",
      code: "openssl rand -base64 32",
    },
    {
      title: "샘플 데이터 삭제",
      state: ops.sampleRows === 0 ? "ok" : "todo",
      status: ops.sampleRows === 0 ? "샘플 없음" : `샘플 ${ops.sampleRows.toLocaleString("ko-KR")}건 남음`,
      body: "샘플 기사·스토리·후보가 남아 있으면 공개 사이트에 DEMO 표시와 검색 제외(noindex)가 걸립니다. 실제 기사는 지워지지 않습니다.",
      code: "npm run db:purge-samples",
    },
    {
      title: "인터넷신문 등록 후 법정 표기 입력",
      state: registered ? "ok" : "todo",
      status: registered ? "모든 항목 입력됨" : `등록 예정 ${pendingLegal}개 항목`,
      body: "시·도에 인터넷신문 등록을 마치면 등록번호·등록일·발행인·편집인·발행소·청소년보호책임자를 이 화면이나 LEGAL_* 환경변수로 입력합니다.",
    },
    {
      title: "SITE_LOCK",
      state: registered ? (ops.siteLock ? "todo" : "ok") : ops.siteLock ? "ok" : "todo",
      status: ops.siteLock ? "SITE_LOCK=1 · 사이트 잠김" : "SITE_LOCK=0 · 공개 중",
      body: registered
        ? "등록과 법정 표기 입력을 마쳤다면 SITE_LOCK=0으로 사이트를 공개합니다."
        : "등록 전까지는 SITE_LOCK=1로 사이트 전체를 Basic Auth 뒤에 둡니다. 등록과 법정 표기 입력을 마친 뒤 0으로 바꿉니다.",
    },
  ];
  const done = items.filter((i) => i.state === "ok").length;

  return (
    <div className="grid items-start gap-4 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="min-w-0 space-y-4">
        <ProfileForm me={me} />
        <AiPanel />
        <LegalForm fields={fields} />
      </div>

      <section className="panel overflow-hidden xl:sticky xl:top-6" aria-labelledby="ops-title">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 id="ops-title" className="kicker text-fg-2">
            운영 체크리스트
          </h2>
          <span className="tabular text-[12px] text-fg-3">
            <span className="font-mono text-fg-2">{done}</span> / {items.length} 완료
          </span>
        </div>
        <div className="flex gap-[2px] px-4 pt-3" aria-hidden="true">
          {items.map((i) => (
            <span key={i.title} className={cx("h-1 flex-1 first:rounded-l-full last:rounded-r-full", i.state === "ok" ? "bg-good" : "bg-bg-3")} />
          ))}
        </div>
        <ol className="divide-y divide-line">
          {items.map((i, n) => (
            <li key={i.title} className="flex gap-3 px-4 py-3.5">
              <span
                className={cx(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                  i.state === "ok" ? "border-good/50 text-good" : "border-warn/50 text-warn",
                )}
                aria-hidden="true"
              >
                {i.state === "ok" ? <Icon name="check" size={11} strokeWidth={2.4} /> : <span className="font-mono text-[10px] font-bold">{n + 1}</span>}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-fg">{i.title}</p>
                <p className={cx("mt-0.5 text-[12px] font-semibold", i.state === "ok" ? "text-good" : "text-warn")}>
                  <span className="sr-only">{i.state === "ok" ? "완료: " : "확인 필요: "}</span>
                  {i.status}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-fg-3">{i.body}</p>
                {i.code && (
                  <code className="mt-1.5 inline-block rounded-md border border-line-2 bg-bg-1 px-1.5 py-0.5 font-mono text-[11.5px] text-fg-2">{i.code}</code>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="grid items-start gap-4 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_23rem]" aria-busy="true" aria-label="설정 불러오는 중">
      <div className="skeleton h-[560px]" />
      <div className="skeleton h-[480px]" />
    </div>
  );
}
