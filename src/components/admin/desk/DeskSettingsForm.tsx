"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { btn, cx } from "@/components/admin/ui";
import { saveDeskSettings } from "@/server/actions/desk";
import type { DeskSettings } from "@/server/desk/settings";

interface Option<T> {
  value: T;
  label: string;
}

const EXPLORE: Option<number>[] = [
  { value: 0, label: "안 함" },
  { value: 0.1, label: "10%" },
  { value: 0.2, label: "20%" },
  { value: 0.3, label: "30%" },
];

const field = "tabular rounded-md border border-line-2 bg-bg-1 px-2 py-1 font-mono text-[13px] text-fg";

/** The desk's knobs. Choices come from the server so this file stays free of server modules. */
export function DeskSettingsForm({
  initial,
  cadences,
  triageModels,
  draftModels,
}: {
  initial: DeskSettings;
  cadences: Option<number>[];
  triageModels: Option<string>[];
  draftModels: Option<string>[];
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = (Object.keys(v) as Array<keyof DeskSettings>).some((k) => v[k] !== saved[k]);
  const set = <K extends keyof DeskSettings>(k: K, x: DeskSettings[K]) => setV((s) => ({ ...s, [k]: x }));

  const save = () =>
    start(async () => {
      const res = await saveDeskSettings(v);
      if (res?.ok) {
        setSaved(v);
        setMsg({ ok: true, text: res.message ?? "저장했습니다." });
        router.refresh();
      } else setMsg({ ok: false, text: res && !res.ok ? res.error : "저장하지 못했습니다." });
    });

  const row = "flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-line py-2.5 last:border-b-0";
  const label = "text-[13px] text-fg-2";
  const hint = "mt-0.5 block text-[11.5px] text-fg-4";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className={row}>
        <label htmlFor="desk-enabled" className={label}>
          AI 데스크
          <span className={hint}>끄면 정해진 실행을 멈춥니다. ‘지금 실행’은 꺼져 있어도 됩니다.</span>
        </label>
        <input id="desk-enabled" type="checkbox" checked={v.enabled} onChange={(e) => set("enabled", e.target.checked)} className="size-4 accent-[var(--ice)]" />
      </div>
      <div className={row}>
        <label htmlFor="desk-daily" className={label}>
          하루 초안 수
          <span className={hint}>하루(KST)에 쓰는 초안의 최대 개수. 다 차면 남은 소식은 대기했다가 자정 뒤에 다시 겨룹니다.</span>
        </label>
        <input id="desk-daily" type="number" min={0} max={50} value={v.dailyDrafts} onChange={(e) => set("dailyDrafts", Math.round(Number(e.target.value)))} className={cx(field, "w-20")} />
      </div>
      <div className={row}>
        <label htmlFor="desk-pacing" className={label}>
          초안 쓰는 때
          <span className={hint}>바로: 기준을 넘는 소식이 나오면 곧바로 씁니다(하루 분량이 일찍 찰 수 있음). 나눠서: 07–23시에 고르게 쓰고 속보급(88점 이상)만 먼저 씁니다.</span>
        </label>
        <select id="desk-pacing" value={v.pacing} onChange={(e) => set("pacing", e.target.value as DeskSettings["pacing"])} className={field}>
          <option value="immediate">바로 쓰기</option>
          <option value="spread">하루에 나눠 쓰기</option>
        </select>
      </div>
      <div className={row}>
        <label htmlFor="desk-cadence" className={label}>
          실행 간격
          <span className={hint}>새 자료를 읽고 판단하는 주기</span>
        </label>
        <select id="desk-cadence" value={v.cadenceMin} onChange={(e) => set("cadenceMin", Number(e.target.value))} className={field}>
          {cadences.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={row}>
        <label htmlFor="desk-score" className={label}>
          기준 점수
          <span className={hint}>이 점수(0–100) 이상만 초안을 씁니다. 높이면 덜, 낮추면 더 씁니다.</span>
        </label>
        <input id="desk-score" type="number" min={0} max={100} value={v.minScore} onChange={(e) => set("minScore", Math.round(Number(e.target.value)))} className={cx(field, "w-20")} />
      </div>
      <div className={row}>
        <label htmlFor="desk-explore" className={label}>
          탐색 몫
          <span className={hint}>하루 초안 중 이 비율까지는 기준보다 10점 안쪽으로 낮아도 처음 보는 주제를 시험 삼아 씁니다. 초반에 기준이 굳지 않게 합니다.</span>
        </label>
        <select id="desk-explore" value={v.exploreShare} onChange={(e) => set("exploreShare", Number(e.target.value))} className={field}>
          {EXPLORE.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={row}>
        <label htmlFor="desk-budget" className={label}>
          월 예산 (USD)
          <span className={hint}>판단·초안·지침 검토를 합친 데스크 비용. 뉴스룸 전체 한도도 함께 지킵니다.</span>
        </label>
        <input
          id="desk-budget"
          type="number"
          min={0}
          max={2000}
          step={1}
          value={v.monthlyBudgetUsd}
          onChange={(e) => set("monthlyBudgetUsd", Number(e.target.value))}
          className={cx(field, "w-24")}
        />
      </div>
      <div className={row}>
        <label htmlFor="desk-triage" className={label}>
          판단 모델
        </label>
        <select id="desk-triage" value={v.triageModel} onChange={(e) => set("triageModel", e.target.value as DeskSettings["triageModel"])} className={field}>
          {triageModels.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={row}>
        <label htmlFor="desk-draft" className={label}>
          초안 모델
        </label>
        <select id="desk-draft" value={v.draftModel} onChange={(e) => set("draftModel", e.target.value as DeskSettings["draftModel"])} className={field}>
          {draftModels.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={row}>
        <label htmlFor="desk-auto" className={label}>
          지침 자동 검토
          <span className={hint}>자료가 쌓이면 주 1회 반응을 보고 편집 지침을 고칩니다.</span>
        </label>
        <input id="desk-auto" type="checkbox" checked={v.playbookAuto} onChange={(e) => set("playbookAuto", e.target.checked)} className="size-4 accent-[var(--ice)]" />
      </div>
      <div className={row}>
        <label htmlFor="desk-images" className={label}>
          사진 재가공
          <span className={hint}>SNS 게시물의 사진은 기사에 쓰지 않고 AI가 읽기만 합니다. 시세 차트면 바이낸스 데이터로 우리 차트를 새로 그리고, 주장은 수익률 표로 확인합니다. 끄면 사진을 읽지 않습니다.</span>
        </label>
        <input id="desk-images" type="checkbox" checked={v.imageRedraw} onChange={(e) => set("imageRedraw", e.target.checked)} className="size-4 accent-[var(--ice)]" />
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-3">
        <button type="submit" disabled={!dirty || pending} className={cx(btn.base, dirty ? btn.primary : btn.ghost)}>
          {pending ? "저장 중…" : "저장"}
        </button>
        {msg && (
          <span role={msg.ok ? "status" : "alert"} className={cx("text-[12px]", msg.ok ? "text-fg-3" : "text-bad")}>
            {msg.text}
          </span>
        )}
      </div>
    </form>
  );
}
