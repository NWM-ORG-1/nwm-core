import type { ReactNode } from "react";
import { getAiUsageAdmin } from "@/data/admin-ai";
import { dateKST, clockKST } from "@/lib/format";
import { Badge, Card, cx } from "../ui";

const PURPOSE_LABEL: Record<string, string> = { draft: "초안", assist: "어시스트", compare: "모델 비교" };

const usd = (v: number) => `$${v < 10 ? v.toFixed(2) : v.toFixed(0)}`;

/** AI draft generator: which model writes drafts, whether it can, and this month's spend against the cap. */
export async function AiPanel() {
  const { config, month, byPurpose, lastError } = await getAiUsageAdmin();
  const claude = config.kind === "claude";
  const live = claude && config.hasKey;
  const share = config.budgetUsd > 0 ? Math.min(1, month.usd / config.budgetUsd) : 1;
  const warnings = [
    claude && !config.hasKey ? "DRAFT_GENERATOR=claude인데 ANTHROPIC_API_KEY가 없어 모의 초안이 만들어집니다." : null,
    live && month.usd >= config.budgetUsd ? "이번 달 한도에 도달해 남은 기간은 모의 초안이 만들어집니다." : null,
    config.unknownModels.length ? `가격표에 없는 모델(${config.unknownModels.join(", ")}) — 비용을 가장 비싼 모델 가격으로 셉니다.` : null,
  ].filter((w): w is string => Boolean(w));

  const rows: Array<[string, ReactNode]> = [
    [
      "생성기",
      <>
        {claude ? "Claude" : "모의 (규칙 기반)"} <code className="ml-1 font-mono text-[11.5px] text-fg-4">DRAFT_GENERATOR={config.kind}</code>
      </>,
    ],
    ["API 키", config.hasKey ? "설정됨" : "없음"],
    [
      "초안 모델",
      <>
        {config.modelLabel} <span className="font-mono text-[11.5px] text-fg-4">{config.model}</span>
        <span className="text-fg-4"> · effort {config.effort ?? "모델 기본값"}</span>
      </>,
    ],
    [
      "어시스트 모델",
      <>
        {config.assistModelLabel} <span className="font-mono text-[11.5px] text-fg-4">{config.assistModel}</span>
        <span className="text-fg-4"> · effort low</span>
      </>,
    ],
  ];

  return (
    <Card
      title="AI 초안"
      actions={<Badge tone={live ? "ice" : claude ? "warn" : "neutral"}>{live ? "Claude 사용 중" : claude ? "키 없음 · 모의" : "모의"}</Badge>}
    >
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-3">{k}</dt>
            <dd className="min-w-0 text-fg-2">{v}</dd>
          </div>
        ))}
        <dt className="text-fg-3">이번 달</dt>
        <dd className="min-w-0">
          <p className="tabular text-fg-2">
            <span className="font-semibold text-fg">{usd(month.usd)}</span> / {usd(config.budgetUsd)}
            <span className="text-fg-4">
              {" "}
              · 호출 {month.calls.toLocaleString("ko-KR")}건{month.failed ? ` · 실패 ${month.failed}건` : ""}
            </span>
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-3" role="meter" aria-valuemin={0} aria-valuemax={config.budgetUsd} aria-valuenow={Number(month.usd.toFixed(2))} aria-label="이번 달 AI 사용액">
            <div className={cx("h-full rounded-full", share >= 1 ? "bg-bad" : share >= 0.8 ? "bg-warn" : "bg-ice")} style={{ width: `${Math.max(share * 100, month.usd > 0 ? 2 : 0)}%` }} />
          </div>
          {byPurpose.length > 0 && (
            <p className="mt-1.5 text-[12px] text-fg-3">
              {byPurpose.map((p) => `${PURPOSE_LABEL[p.purpose] ?? p.purpose} ${p.calls}건 ${usd(p.usd)}`).join(" · ")}
            </p>
          )}
        </dd>
        {lastError && (
          <>
            <dt className="text-fg-3">최근 실패</dt>
            <dd className="min-w-0 text-[12px] text-fg-3">
              <span className="tabular">
                {dateKST(lastError.at)} {clockKST(lastError.at)}
              </span>{" "}
              · {lastError.purpose} · <span className="text-bad">{lastError.error}</span>
            </dd>
          </>
        )}
      </dl>
      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-[12px] font-semibold text-warn">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-fg-3">
        모델과 한도는 환경변수 <code className="font-mono text-fg-2">DRAFT_MODEL</code> · <code className="font-mono text-fg-2">DRAFT_ASSIST_MODEL</code> ·{" "}
        <code className="font-mono text-fg-2">DRAFT_EFFORT</code> · <code className="font-mono text-fg-2">DRAFT_LLM_MONTHLY_USD</code>로 정합니다. 실패하거나 한도를 넘으면 모의
        초안으로 대신하고 그 사유를 AI 메모에 남깁니다. 모델 비교: <code className="font-mono text-fg-2">npm run compare:drafts</code>
      </p>
    </Card>
  );
}
