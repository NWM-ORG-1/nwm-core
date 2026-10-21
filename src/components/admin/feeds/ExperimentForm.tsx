"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useCallback, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { btn, cx } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";
import { saveExperimentChecked } from "@/server/actions/feeds-extra";
import type { ActionState } from "@/server/actions/result";
import { field } from "./bits";
import { ErrorSummary, Field, FormSection, issuesFrom } from "./form-kit";
import {
  EXPERIMENT_STATUS_LABEL,
  isExperimentStatus,
  isPrimaryMetric,
  PRIMARY_METRIC,
  type ExperimentStatus,
  type PrimaryMetric,
} from "./labels";

export interface ExperimentFormValues {
  id: string | null;
  code: string;
  name: string;
  hypothesis: string;
  primaryMetric: string;
  status: string;
  colorSlot: number;
  notes: string;
}

type Other = { id: string; code: string; name: string; colorSlot: number; status: string };

const LABELS: Record<string, string> = {
  code: "코드",
  name: "이름",
  hypothesis: "가설",
  primaryMetric: "주 지표",
  status: "상태",
  colorSlot: "색상 슬롯",
  notes: "메모",
};

const STATUS_HELP: Record<ExperimentStatus, string> = {
  draft: "준비 중. 소스를 연결해도 아직 비교 대상으로 보지 않습니다.",
  running: "진행 중. 대시보드와 비교표에 집계됩니다.",
  paused: "일시중지. 데이터는 남지만 해석할 때 공백 기간을 감안하세요.",
  concluded: "종료. 저장하는 순간이 종료 시각으로 기록됩니다.",
};

export function ExperimentForm(props: { initial: ExperimentFormValues; others: Other[] }) {
  const [nonce, setNonce] = useState(0);
  const reset = useCallback(() => setNonce((n) => n + 1), []);
  return <ExperimentFormInner key={nonce} {...props} onHiddenAfterSave={reset} />;
}

function ExperimentFormInner({ initial, others, onHiddenAfterSave }: { initial: ExperimentFormValues; others: Other[]; onHiddenAfterSave: () => void }) {
  const router = useRouter();
  const saved = useRef(false);
  const [state, action, pending] = useActionState(async (prev: ActionState<{ id: string }>, fd: FormData) => {
    const res = await saveExperimentChecked(prev, fd);
    if (res?.ok) {
      saved.current = true;
      router.push("/admin/experiments");
    }
    return res;
  }, null);

  useLayoutEffect(() => {
    return () => {
      if (saved.current) {
        saved.current = false;
        onHiddenAfterSave();
      }
    };
  }, [onHiddenAfterSave]);

  const [code, setCode] = useState(initial.code);
  const [slot, setSlot] = useState(initial.colorSlot);
  const [metric, setMetric] = useState<PrimaryMetric>(isPrimaryMetric(initial.primaryMetric) ? initial.primaryMetric : "publish_rate");
  const [status, setStatus] = useState<ExperimentStatus>(isExperimentStatus(initial.status) ? initial.status : "running");
  const [hypothesis, setHypothesis] = useState(initial.hypothesis);
  const codeRef = useRef<HTMLInputElement>(null);

  const issues = issuesFrom(state);
  const codeOwner = others.find((o) => o.code.toUpperCase() === code.trim().toUpperCase());
  const codeTaken = codeOwner != null;
  const sharing = others.filter((o) => o.colorSlot === slot && o.status !== "concluded");
  // Unique per instance: Activity keeps other forms (e.g. a source form) in the DOM.
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;
  const err = (k: string) => issues[k];
  const described = (k: string) => (err(k) ? `${fid(k)}-error` : `${fid(k)}-help`);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (codeTaken) {
      codeRef.current?.focus();
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <ErrorSummary state={state} labels={LABELS} />

      <FormSection
        kicker="01 · HYPOTHESIS"
        title="가설"
        lead="검증할 수 있는 문장으로 씁니다. 무엇을 바꾸면(소스·작성 방식) 어떤 지표가 얼마나 움직일지 적어 두면 종료할 때 판단이 쉬워집니다."
      >
        <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
          <Field label={LABELS.code} htmlFor={fid("code")} required error={codeOwner ? `이미 ‘${codeOwner.name}’ 가설이 쓰는 코드입니다` : err("code")} help="H1, H2 … 형식">
            <input
              id={fid("code")}
              ref={codeRef}
              name="code"
              required
              pattern="[Hh][0-9]{1,2}"
              title="H 다음에 숫자 1–2자리 (예: H5)"
              maxLength={3}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))}
              aria-invalid={codeTaken || Boolean(err("code"))}
              aria-describedby={codeTaken || err("code") ? `${fid("code")}-error` : `${fid("code")}-help`}
              className={cx(field.input, "font-mono font-bold uppercase")}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label={LABELS.name} htmlFor={fid("name")} required error={err("name")} help="목록과 차트 범례에 표시됩니다. 짧게.">
            <input
              id={fid("name")}
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={initial.name}
              aria-invalid={Boolean(err("name"))}
              aria-describedby={described("name")}
              className={field.input}
              placeholder="예: 1차 공시·정책 소스 우선"
              autoComplete="off"
            />
          </Field>
          <Field
            label={LABELS.hypothesis}
            htmlFor={fid("hypothesis")}
            required
            error={err("hypothesis")}
            className="sm:col-span-2"
            help={
              <span className="flex justify-between gap-3">
                <span>예: 공시·정책 1차 소스 비중을 높이면, 커뮤니티발 기사보다 완독률이 10%p 이상 높다.</span>
                <span className={cx("tabular shrink-0", hypothesis.length > 500 ? "text-bad" : "text-fg-4")}>{hypothesis.length}/500</span>
              </span>
            }
          >
            <textarea
              id={fid("hypothesis")}
              name="hypothesis"
              required
              minLength={5}
              maxLength={500}
              rows={3}
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              aria-invalid={Boolean(err("hypothesis"))}
              aria-describedby={described("hypothesis")}
              className={field.textarea}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection kicker="02 · MEASURE" title="측정 · 상태" lead="주 지표 하나로 성패를 판단합니다. 나머지 지표는 부작용(정정 증가 등)을 감시하는 용도입니다.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={LABELS.primaryMetric} htmlFor={fid("primaryMetric")} required error={err("primaryMetric")} help={`${PRIMARY_METRIC[metric].explain} · ${PRIMARY_METRIC[metric].better === "higher" ? "높을수록 좋음" : "낮을수록 좋음"}`}>
            <select
              id={fid("primaryMetric")}
              name="primaryMetric"
              value={metric}
              onChange={(e) => setMetric(e.target.value as PrimaryMetric)}
              aria-describedby={described("primaryMetric")}
              className={field.select}
            >
              {(Object.keys(PRIMARY_METRIC) as PrimaryMetric[]).map((m) => (
                <option key={m} value={m}>
                  {PRIMARY_METRIC[m].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={LABELS.status} htmlFor={fid("status")} required error={err("status")} help={STATUS_HELP[status]}>
            <select
              id={fid("status")}
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ExperimentStatus)}
              aria-describedby={described("status")}
              className={field.select}
            >
              {(Object.keys(EXPERIMENT_STATUS_LABEL) as ExperimentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {EXPERIMENT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className={cx(field.label, "mb-2")}>{LABELS.colorSlot}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[1, 2, 3, 4].map((n) => {
                const users = others.filter((o) => o.colorSlot === n && o.status !== "concluded");
                return (
                  <label
                    key={n}
                    className={cx(
                      "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ice-glow)]",
                      slot === n ? "border-ice/60 bg-ice/[0.06]" : "border-line-2 hover:border-line-3",
                    )}
                  >
                    <input type="radio" name="colorSlot" value={n} checked={slot === n} onChange={() => setSlot(n)} className="sr-only" />
                    <span
                      aria-hidden="true"
                      className={cx("size-6 shrink-0 rounded-md", slot === n && "ring-2 ring-fg ring-offset-2 ring-offset-bg-1")}
                      style={{ background: `var(--c-${n})` }}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-fg">슬롯 {n}</span>
                      <span className="block truncate text-[11.5px] text-fg-3">{users.length ? `사용 중: ${users.map((u) => u.code).join(", ")}` : slot === n ? "이 가설만 사용" : "비어 있음"}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {sharing.length > 0 ? (
              <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-warn" role="note">
                <Icon name="alert" size={13} className="mt-[3px] shrink-0" />
                같은 색을 쓰는 가설: {sharing.map((s) => s.code).join(", ")}. 비교 차트에서는 코드 표기로 구분되지만, 진행 중인 가설끼리는 겹치지 않게 고르는 편이 좋습니다.
              </p>
            ) : (
              <p className={field.help}>색은 차트·칩에서 이 가설을 구분하는 표식입니다. 항상 코드와 함께 표시됩니다.</p>
            )}
          </fieldset>
        </div>
      </FormSection>

      <FormSection kicker="03 · NOTES" title="메모" lead="중간 관찰, 소스 교체 이력, 종료 판단 근거 등을 남깁니다. 편집국 내부용입니다.">
        <Field label={LABELS.notes} htmlFor={fid("notes")} error={err("notes")} help="최대 2,000자">
          <textarea
            id={fid("notes")}
            name="notes"
            rows={5}
            maxLength={2000}
            defaultValue={initial.notes}
            aria-describedby={described("notes")}
            className={field.textarea}
          />
        </Field>
      </FormSection>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line-2 bg-bg-1/95 px-4 py-3 shadow-[var(--shadow-pop)] backdrop-blur-md">
        <button type="submit" disabled={pending} className={cx(btn.base, btn.primary, "min-w-24")}>
          {pending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
          {initial.id ? "변경 저장" : "가설 추가"}
        </button>
        <Link href="/admin/experiments" className={cx(btn.base, btn.quiet)}>
          취소
        </Link>
        <p className="ml-auto text-[12px] text-fg-3" role="status">
          {pending ? "저장 중…" : state?.ok ? "저장했습니다. 목록으로 이동합니다…" : state && !state.ok ? <span className="text-bad">저장하지 못했습니다 — 위 내용을 확인하세요</span> : null}
        </p>
      </div>
    </form>
  );
}
