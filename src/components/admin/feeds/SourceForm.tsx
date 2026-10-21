"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useCallback, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { Beat, SourceKind } from "@/db/schema";
import { btn, cx } from "@/components/admin/ui";
import { BeatChip } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";
import { BEAT_ORDER } from "@/lib/beats";
import { dateTimeKST } from "@/lib/format";
import { SOURCE_KIND_LABEL, TRUST_TIER_LABEL } from "@/lib/labels";
import { saveSource } from "@/server/actions/sources";
import type { ActionState } from "@/server/actions/result";
import { field } from "./bits";
import { ErrorSummary, Field, FormSection, issuesFrom } from "./form-kit";
import { formatInterval, LANG_LABEL, TRUST_TIER_HELP } from "./labels";

export type Tri = "yes" | "no" | "unknown";

export interface SourceFormValues {
  id: string | null;
  name: string;
  slug: string;
  kind: SourceKind;
  url: string;
  lang: string;
  beats: Beat[];
  experimentId: string;
  adapter: string;
  pollIntervalSec: number;
  trustTier: number;
  signalOnly: boolean;
  licCommercialOk: Tri;
  licRedistributionOk: Tri;
  licVerbatimOk: Tri;
  licAttribution: string;
  licRetentionDays: string;
  licTermsUrl: string;
  licReviewed: boolean;
  reviewedAt: string | null;
  reviewedBy: string | null;
  configJson: string;
}

const LABELS: Record<string, string> = {
  name: "소스 이름",
  slug: "슬러그",
  kind: "유형",
  url: "주소",
  lang: "언어",
  beats: "비트",
  experimentId: "실험(가설)",
  adapter: "어댑터",
  pollIntervalSec: "수집 주기",
  trustTier: "신뢰 등급",
  signalOnly: "신호 전용",
  licCommercialOk: "상업적 이용",
  licRedistributionOk: "재배포",
  licVerbatimOk: "원문 인용",
  licAttribution: "출처 표기",
  licRetentionDays: "원문 보관 기간",
  licTermsUrl: "이용약관 주소",
  licReviewed: "라이선스 검토",
  configJson: "어댑터 설정",
};

const POLL_PRESETS = [30, 60, 300, 600, 1800, 3600, 21_600, 86_400];
const TRI_OPTIONS: Array<[Tri, string]> = [
  ["unknown", "확인 안 됨"],
  ["yes", "허용"],
  ["no", "불가"],
];

/**
 * Create / edit a feed source. After a successful save it navigates to the
 * list; the form remounts fresh if this route is shown again.
 */
export function SourceForm(props: {
  initial: SourceFormValues;
  experiments: Array<{ id: string; code: string; name: string }>;
  adapters: string[];
  takenSlugs: Array<{ id: string; slug: string }>;
}) {
  const [nonce, setNonce] = useState(0);
  const reset = useCallback(() => setNonce((n) => n + 1), []);
  return <SourceFormInner key={nonce} {...props} onHiddenAfterSave={reset} />;
}

function SourceFormInner({
  initial,
  experiments,
  adapters,
  takenSlugs,
  onHiddenAfterSave,
}: {
  initial: SourceFormValues;
  experiments: Array<{ id: string; code: string; name: string }>;
  adapters: string[];
  takenSlugs: Array<{ id: string; slug: string }>;
  onHiddenAfterSave: () => void;
}) {
  const router = useRouter();
  const saved = useRef(false);
  const [state, action, pending] = useActionState(async (prev: ActionState<{ id: string }>, fd: FormData) => {
    const res = await saveSource(prev, fd);
    if (res?.ok) {
      saved.current = true;
      router.push("/admin/sources");
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

  const [poll, setPoll] = useState(String(initial.pollIntervalSec));
  const [tier, setTier] = useState(initial.trustTier);
  const [signalOnly, setSignalOnly] = useState(initial.signalOnly);
  const [slug, setSlug] = useState(initial.slug);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const configRef = useRef<HTMLTextAreaElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);

  const issues = issuesFrom(state);
  const slugTaken = takenSlugs.some((s) => s.slug === slug.trim() && s.id !== initial.id);
  const pollN = Number(poll);

  function checkJson(v: string) {
    if (!v.trim()) return null;
    try {
      const parsed = JSON.parse(v);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "JSON 객체({ … })여야 합니다.";
      return null;
    } catch (e) {
      return `JSON 문법 오류: ${(e as Error).message}`;
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const err = checkJson(configRef.current?.value ?? "");
    setJsonError(err);
    if (err) {
      configRef.current?.focus();
      return;
    }
    if (slugTaken) {
      slugRef.current?.focus();
      return;
    }
    const fd = new FormData(form);
    startTransition(() => action(fd));
  }

  const err = (k: string) => issues[k];
  const described = (k: string, hasHelp = true) => (err(k) ? `${k}-error` : hasHelp ? `${k}-help` : undefined);

  return (
    <form onSubmit={onSubmit} noValidate={false} className="space-y-5" aria-describedby={state && !state.ok ? "source-form-errors" : undefined}>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <div id="source-form-errors">
        <ErrorSummary state={state} labels={LABELS} />
      </div>

      <FormSection kicker="01 · BASICS" title="기본 정보" lead="편집국에서 부르는 이름과 시스템 식별자(슬러그)입니다. 슬러그는 피드 필터 주소에도 쓰입니다.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={LABELS.name} htmlFor="name" required error={err("name")} help="예: DART 공시, 한국은행 보도자료">
            <input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={initial.name}
              aria-invalid={Boolean(err("name"))}
              aria-describedby={described("name")}
              className={field.input}
              autoComplete="off"
            />
          </Field>
          <Field
            label={LABELS.slug}
            htmlFor="slug"
            required
            error={slugTaken ? "이미 다른 소스가 쓰고 있는 슬러그입니다" : err("slug")}
            help="영문 소문자·숫자·하이픈 2–61자. 예: dart-filings"
          >
            <input
              id="slug"
              ref={slugRef}
              name="slug"
              required
              pattern="[a-z0-9][a-z0-9\-]{1,60}"
              title="영문 소문자·숫자·하이픈, 2–61자"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
              aria-invalid={slugTaken || Boolean(err("slug"))}
              aria-describedby={slugTaken || err("slug") ? "slug-error" : "slug-help"}
              className={cx(field.input, "font-mono")}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label={LABELS.kind} htmlFor="kind" required error={err("kind")}>
            <select id="kind" name="kind" defaultValue={initial.kind} className={field.select}>
              {(Object.keys(SOURCE_KIND_LABEL) as SourceKind[]).map((k) => (
                <option key={k} value={k}>
                  {SOURCE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={LABELS.lang} htmlFor="lang" required error={err("lang")}>
            <select id="lang" name="lang" defaultValue={initial.lang} className={field.select}>
              {Object.entries(LANG_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label={LABELS.url} htmlFor="url" error={err("url")} help="피드·API 엔드포인트 또는 소스 홈페이지. 수동 소스는 비워 둬도 됩니다." className="sm:col-span-2">
            <input
              id="url"
              name="url"
              type="url"
              maxLength={500}
              defaultValue={initial.url}
              placeholder="https://"
              aria-invalid={Boolean(err("url"))}
              aria-describedby={described("url")}
              className={cx(field.input, "font-mono text-[13px]")}
              spellCheck={false}
            />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className={cx(field.label, "mb-2")}>{LABELS.beats}</legend>
            <div className="flex flex-wrap gap-2">
              {BEAT_ORDER.map((b) => (
                <label
                  key={b}
                  className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-line-2 px-2.5 transition-colors hover:border-line-3 has-[:checked]:border-ice/60 has-[:checked]:bg-ice/[0.06] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ice-glow)]"
                >
                  <input type="checkbox" name="beats" value={b} defaultChecked={initial.beats.includes(b)} className={field.check} />
                  <BeatChip beat={b} />
                </label>
              ))}
            </div>
            <p className={field.help}>이 소스의 항목이 주로 다루는 비트. 항목별 비트는 수집 시 따로 추정합니다.</p>
          </fieldset>
        </div>
      </FormSection>

      <FormSection kicker="02 · COLLECTION" title="수집 · 실험" lead="어떤 가설을 검증하기 위한 소스인지 연결하고, 수집 어댑터와 주기를 정합니다.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={LABELS.experimentId} htmlFor="experimentId" error={err("experimentId")} help="실험 화면의 퍼널 지표가 이 연결을 기준으로 집계됩니다.">
            <select id="experimentId" name="experimentId" defaultValue={initial.experimentId} className={field.select} aria-describedby={described("experimentId")}>
              <option value="">미지정</option>
              {experiments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code} · {e.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={LABELS.adapter} htmlFor="adapter" required error={err("adapter")} help="2단계 수집기 키. 수동 등록은 manual.">
            <input
              id="adapter"
              name="adapter"
              required
              maxLength={60}
              list="adapter-keys"
              defaultValue={initial.adapter}
              aria-describedby={described("adapter")}
              className={cx(field.input, "font-mono text-[13px]")}
              autoComplete="off"
              spellCheck={false}
            />
            <datalist id="adapter-keys">
              {adapters.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Field>
          <Field
            label={LABELS.pollIntervalSec}
            htmlFor="pollIntervalSec"
            required
            error={err("pollIntervalSec")}
            className="sm:col-span-2"
            help="15초–1일. 너무 짧으면 상대 서버의 호출 제한에 걸릴 수 있습니다."
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-36">
                <input
                  id="pollIntervalSec"
                  name="pollIntervalSec"
                  type="number"
                  inputMode="numeric"
                  required
                  min={15}
                  max={86_400}
                  step={1}
                  value={poll}
                  onChange={(e) => setPoll(e.target.value)}
                  aria-describedby={described("pollIntervalSec")}
                  className={cx(field.input, "tabular pr-9")}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-fg-3">초</span>
              </div>
              <span className="tabular min-w-16 text-[12.5px] font-semibold text-fg-2" aria-live="polite">
                {Number.isFinite(pollN) && pollN >= 15 ? `= ${formatInterval(pollN)}` : ""}
              </span>
              <div className="flex flex-wrap gap-1" role="group" aria-label="자주 쓰는 주기">
                {POLL_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPoll(String(p))}
                    aria-pressed={pollN === p}
                    className={cx(
                      "h-7 rounded-md border px-2 text-[12px] font-medium transition-colors",
                      pollN === p ? "border-ice/60 bg-ice/10 text-fg" : "border-line-2 text-fg-3 hover:border-line-3 hover:text-fg",
                    )}
                  >
                    {formatInterval(p)}
                  </button>
                ))}
              </div>
            </div>
          </Field>
          <Field
            label={LABELS.configJson}
            htmlFor="configJson"
            error={jsonError ?? err("configJson")}
            className="sm:col-span-2"
            help={
              <>
                어댑터별 설정(JSON 객체). 예: <code className="font-mono text-fg-2">{'{ "corpCls": "Y", "pageSize": 100 }'}</code> · API 키 같은 비밀값은 넣지 말고 환경 변수 이름만 적으세요.
              </>
            }
          >
            <textarea
              id="configJson"
              ref={configRef}
              name="configJson"
              rows={5}
              defaultValue={initial.configJson}
              onBlur={(e) => setJsonError(checkJson(e.target.value))}
              aria-invalid={Boolean(jsonError || err("configJson"))}
              aria-describedby={jsonError || err("configJson") ? "configJson-error" : "configJson-help"}
              className={cx(field.textarea, "font-mono text-[12.5px]")}
              spellCheck={false}
              placeholder="{}"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection kicker="03 · TRUST" title="신뢰 등급" lead="기사에서 이 소스를 얼마나 무겁게 다룰지 정합니다. 등급은 자동 점검(출처 검증)과 피드 점수에 반영됩니다.">
        <fieldset>
          <legend className="sr-only">{LABELS.trustTier}</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((t) => (
              <label
                key={t}
                className={cx(
                  "flex cursor-pointer flex-col gap-1.5 rounded-xl border px-3.5 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ice-glow)]",
                  tier === t ? "border-ice/60 bg-ice/[0.06]" : "border-line-2 hover:border-line-3",
                )}
              >
                <span className="flex items-center gap-2">
                  <input type="radio" name="trustTier" value={t} checked={tier === t} onChange={() => setTier(t)} className="size-4 accent-[var(--ice)]" />
                  <span className="font-mono text-[12px] font-bold text-fg-2">T{t}</span>
                  <span className="text-[13.5px] font-semibold text-fg">{TRUST_TIER_LABEL[t]}</span>
                </span>
                <span className="text-[12px] leading-relaxed text-fg-3">{TRUST_TIER_HELP[t]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </FormSection>

      <FormSection
        kicker="04 · RIGHTS"
        title="이용 조건 · 저작권"
        lead={
          <ul className="mt-1 space-y-1">
            <li>
              <strong className="font-semibold text-fg-2">사실·수치·공공데이터</strong>는 저작권 보호 대상이 아닙니다. 출처를 밝히면 기사에 자유롭게 쓸 수 있습니다.
            </li>
            <li>
              <strong className="font-semibold text-fg-2">문장·표현을 그대로 옮기는 것(원문 인용)</strong>은 이용 조건이 허용할 때만, 필요한 범위에서 출처와 함께 씁니다.
            </li>
            <li>
              <strong className="font-semibold text-fg-2">신호 전용</strong> 소스는 무엇이 일어나는지 알려 주는 단서일 뿐입니다. 재작성·요약·인용하지 않고, 반드시 1차 자료를 직접 확인합니다.
            </li>
          </ul>
        }
      >
        <div className="space-y-5">
          <label
            className={cx(
              "flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ice-glow)]",
              signalOnly ? "border-warn/50 bg-warn/[0.06]" : "border-line-2 hover:border-line-3",
            )}
          >
            <input
              type="checkbox"
              name="signalOnly"
              checked={signalOnly}
              onChange={(e) => setSignalOnly(e.target.checked)}
              className={cx(field.check, "mt-0.5")}
            />
            <span>
              <span className="block text-[13.5px] font-semibold text-fg">신호 전용 소스</span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-fg-3">
                {signalOnly
                  ? "인박스와 후보 화면에서 ‘재작성·인용 금지’ 경고가 붙고, 초안 생성기는 이 항목의 문장을 쓰지 않습니다."
                  : "타 매체 기사·유료 콘텐츠처럼 내용 자체를 쓸 수 없는 소스라면 켜세요."}
              </span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["licCommercialOk", "상업적 매체에서 사용 가능한가"],
                ["licRedistributionOk", "데이터·본문을 다시 배포할 수 있는가"],
                ["licVerbatimOk", "문장을 그대로 인용할 수 있는가"],
              ] as const
            ).map(([k, help]) => (
              <Field key={k} label={LABELS[k]} htmlFor={k} error={err(k)} help={help}>
                <select id={k} name={k} defaultValue={initial[k]} className={field.select} aria-describedby={described(k)}>
                  {TRI_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {signalOnly && (
            <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-warn">
              <Icon name="alert" size={14} className="mt-[3px] shrink-0" />
              신호 전용으로 지정하면 원문 인용 허용 여부와 관계없이 재작성·인용이 금지됩니다.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Field label={LABELS.licAttribution} htmlFor="licAttribution" error={err("licAttribution")} help="기사 출처란에 그대로 들어갈 문구. 예: 출처: 금융감독원 DART">
              <input
                id="licAttribution"
                name="licAttribution"
                maxLength={200}
                defaultValue={initial.licAttribution}
                aria-describedby={described("licAttribution")}
                className={field.input}
              />
            </Field>
            <Field label={LABELS.licRetentionDays} htmlFor="licRetentionDays" error={err("licRetentionDays")} help="비워 두면 제한 없음">
              <div className="relative">
                <input
                  id="licRetentionDays"
                  name="licRetentionDays"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={36_500}
                  step={1}
                  defaultValue={initial.licRetentionDays}
                  aria-describedby={described("licRetentionDays")}
                  className={cx(field.input, "tabular pr-9")}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-fg-3">일</span>
              </div>
            </Field>
            <Field label={LABELS.licTermsUrl} htmlFor="licTermsUrl" error={err("licTermsUrl")} help="검토 근거가 된 이용약관·API 약관 주소" className="sm:col-span-2">
              <input
                id="licTermsUrl"
                name="licTermsUrl"
                type="url"
                maxLength={500}
                defaultValue={initial.licTermsUrl}
                placeholder="https://"
                aria-describedby={described("licTermsUrl")}
                className={cx(field.input, "font-mono text-[13px]")}
                spellCheck={false}
              />
            </Field>
          </div>

          <label className="flex cursor-pointer gap-3 rounded-xl border border-line-2 px-4 py-3 transition-colors hover:border-line-3 has-[:checked]:border-good/50 has-[:checked]:bg-good/[0.05] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ice-glow)]">
            <input type="checkbox" name="licReviewed" defaultChecked={initial.licReviewed} className={cx(field.check, "mt-0.5")} />
            <span>
              <span className="block text-[13.5px] font-semibold text-fg">라이선스 검토 완료</span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-fg-3">
                체크한 채 저장하면 지금 저장하는 사람이 검토자로, 지금 시각이 검토 시각으로 기록됩니다. 체크를 해제하면 검토 기록이 지워지고 이 소스의 항목은 발행 근거로 쓸 수
                없습니다.
                {initial.reviewedAt && (
                  <span className="mt-1 block text-fg-2">
                    마지막 검토: {initial.reviewedBy ?? "알 수 없음"} · <span className="tabular">{dateTimeKST(initial.reviewedAt)}</span>
                  </span>
                )}
              </span>
            </span>
          </label>
        </div>
      </FormSection>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line-2 bg-bg-1/95 px-4 py-3 shadow-[var(--shadow-pop)] backdrop-blur-md">
        <button type="submit" disabled={pending} className={cx(btn.base, btn.primary, "min-w-24")}>
          {pending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
          {initial.id ? "변경 저장" : "소스 추가"}
        </button>
        <Link href="/admin/sources" className={cx(btn.base, btn.quiet)}>
          취소
        </Link>
        <p className="ml-auto text-[12px] text-fg-3" role="status">
          {pending ? "저장 중…" : state?.ok ? "저장했습니다. 목록으로 이동합니다…" : state && !state.ok ? <span className="text-bad">저장하지 못했습니다 — 위 내용을 확인하세요</span> : null}
        </p>
      </div>
    </form>
  );
}
