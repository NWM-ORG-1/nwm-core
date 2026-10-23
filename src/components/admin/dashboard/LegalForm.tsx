"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { foundedYear, LEGAL_CONTACT_KEYS, PENDING, SITE, type Legal } from "@/lib/site";
import { saveLegal } from "@/server/actions/settings";
import { ActionMessage } from "../client";
import { Badge, btn, cx } from "../ui";
import { field } from "./parts";

export interface LegalFieldView {
  key: string;
  label: string;
  env: string;
  /** value saved in site_settings ("" when none) */
  stored: string;
  /** environment override, which always wins */
  envValue: string | null;
  /** built-in default when nothing is set */
  fallback: string;
}

/** 법정 표기 editor. Environment overrides are shown read-only; their saved values are kept untouched. */
export function LegalForm({ fields }: { fields: LegalFieldView[] }) {
  const [state, formAction, pending] = useActionState(saveLegal, null);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.stored])));

  const editable = fields.filter((f) => !f.envValue);
  const dirty = editable.filter((f) => (values[f.key] ?? "").trim() !== f.stored.trim()).length;
  const effective = (f: LegalFieldView) => f.envValue ?? ((values[f.key] ?? "").trim() || f.fallback);
  const sourceOf = (f: LegalFieldView) => (f.envValue ? "env" : (values[f.key] ?? "").trim() ? "db" : "default");
  const pendingCount = fields.filter((f) => effective(f) === PENDING).length;
  const emailField = fields.find((f) => f.key === "email");
  const reportField = fields.find((f) => f.key === "reportEmail");
  const foundedField = fields.find((f) => f.key === "foundedAt");

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="panel overflow-hidden" aria-labelledby="legal-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 id="legal-title" className="kicker text-fg-2">
            법정 표기 <span className="hud ml-1 text-fg-3">LEGAL</span>
          </h2>
          {pendingCount > 0 ? <Badge tone="warn">등록 예정 {pendingCount}개 항목</Badge> : <Badge tone="good">모든 항목 입력됨</Badge>}
        </div>

        <p className="border-b border-line px-4 py-3 text-[12.5px] leading-relaxed text-fg-3">
          인터넷신문은 신문법에 따라 제호·등록번호·등록일·발행인·편집인·발행소·청소년보호책임자를 독자가 볼 수 있게 표시해야 합니다. 저장하면 공개
          사이트 하단 ‘발행 정보’에 바로 반영됩니다. 적용 순서는 <span className="text-fg-2">환경변수 → 저장값 → 기본값</span>입니다.
        </p>

        <div className="grid gap-x-5 gap-y-4 p-4 md:grid-cols-2">
          {fields.map((f) => {
            const src = sourceOf(f);
            const id = `legal-${f.key}`;
            const hintId = `${id}-hint`;
            return (
              <div key={f.key} className="min-w-0">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor={id} className="kicker flex min-w-0 items-baseline gap-2 text-fg-2">
                    {f.label}
                    <span className="hud truncate text-[9.5px] text-fg-4">{f.env}</span>
                  </label>
                  {src === "env" ? (
                    <Badge tone="ice" title="환경변수 값이 적용 중입니다">
                      ENV
                    </Badge>
                  ) : effective(f) === PENDING ? (
                    <Badge tone="warn" title="공개 페이지에 ‘등록 예정’으로 표시됩니다">
                      등록 예정
                    </Badge>
                  ) : src === "db" ? (
                    <Badge title="이 화면에서 저장한 값">저장값</Badge>
                  ) : (
                    <Badge title="아무 값도 없어 기본값이 표시됩니다">기본값</Badge>
                  )}
                </div>
                {f.envValue ? (
                  <>
                    <input id={id} value={f.envValue} readOnly disabled aria-describedby={hintId} className={field.input} />
                    {/* keep the saved value as-is so a later env removal falls back to it */}
                    <input type="hidden" name={f.key} value={f.stored} />
                    <p id={hintId} className={field.hint}>
                      환경변수 <code className="font-mono text-fg-2">{f.env}</code>가 우선 적용되어 읽기 전용입니다. 바꾸려면 배포 환경변수를 수정하세요.
                    </p>
                  </>
                ) : (
                  <>
                    <input
                      id={id}
                      name={f.key}
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={f.fallback}
                      maxLength={200}
                      autoComplete="off"
                      aria-describedby={hintId}
                      className={field.input}
                    />
                    <p id={hintId} className={field.hint}>
                      {effective(f) === PENDING ? "비워 두면 공개 페이지에 ‘등록 예정’으로 표시됩니다." : `비워 두면 기본값 ‘${f.fallback}’이 표시됩니다.`}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <button type="submit" disabled={pending || dirty === 0} className={cx(btn.base, btn.primary)}>
            {pending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
            {pending ? "저장 중…" : "저장"}
          </button>
          {dirty > 0 && (
            <button
              type="button"
              className={cx(btn.base, btn.quiet)}
              onClick={() => setValues(Object.fromEntries(fields.map((f) => [f.key, f.stored])))}
              disabled={pending}
            >
              변경 취소
            </button>
          )}
          <span className="tabular text-[12px] text-fg-3" aria-live="polite">
            {dirty > 0 ? `저장하지 않은 변경 ${dirty}개` : "변경 사항 없음"}
          </span>
          <ActionMessage state={state} className="ml-auto" />
        </div>
      </form>

      <section className="panel overflow-hidden" aria-labelledby="legal-preview">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 id="legal-preview" className="kicker text-fg-2">
            공개 페이지 미리보기
          </h2>
          <span className="text-[11.5px] text-fg-3">사이트 하단 ‘발행 정보’</span>
        </div>
        <div className="px-4 py-4">
          <p className="kicker mb-3 text-fg-4">발행 정보</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 text-[12.5px] leading-relaxed">
            {fields
              .filter((f) => !LEGAL_CONTACT_KEYS.has(f.key as keyof Legal))
              .map((f) => {
                const v = effective(f);
                return (
                  <div key={f.key} className="contents">
                    <dt className="text-fg-4">{f.label}</dt>
                    <dd className={cx("min-w-0 break-words", v === PENDING ? "text-fg-4" : "text-fg-2")}>
                      {v}
                      {f.envValue && <span className="hud ml-2 text-[9.5px] text-ice">ENV</span>}
                    </dd>
                  </div>
                );
              })}
          </dl>
          <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3 text-[12px] text-fg-4">
            <span className="break-all text-fg-3">{emailField ? effective(emailField) : SITE.email}</span>
            {reportField && emailField && effective(reportField) !== effective(emailField) && <span className="break-all text-fg-3">제보·정정 {effective(reportField)}</span>}
            <span>
              © {foundedField ? foundedYear(effective(foundedField)) : ""} {SITE.nameEn}
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}
