"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { updateMyProfile } from "@/server/actions/profile";
import { ActionMessage } from "../client";
import { Badge, btn, cx } from "../ui";
import { field } from "./parts";

export interface ProfileView {
  name: string;
  title: string;
  bio: string;
  slug: string;
  login: string;
  /** auto-provisioned on first login and never edited */
  placeholder: boolean;
}

/**
 * The signed-in editor's public profile. Their name is printed on every article
 * they sign off (책임 편집, 바이라인) and on /editors/{slug}, so it must be a real name.
 */
export function ProfileForm({ me }: { me: ProfileView }) {
  const [state, formAction, pending] = useActionState(updateMyProfile, null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };
  return (
    <form onSubmit={submit} className="panel overflow-hidden" aria-labelledby="profile-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 id="profile-title" className="kicker text-fg-2">
          내 편집자 프로필 <span className="hud ml-1 text-fg-3">{me.login}</span>
        </h2>
        {me.placeholder ? <Badge tone="warn">실명 입력 필요</Badge> : <Badge tone="good">공개 중</Badge>}
      </div>
      <p className="border-b border-line px-4 py-3 text-[12.5px] leading-relaxed text-fg-3">
        AI 초안·보조 기사에는 책임 편집자의 이름이 공개됩니다. 저장하면 이미 발행한 기사의 표기와 편집자 페이지(<code className="font-mono text-fg-2">/editors/{me.slug}</code>)도 함께 바뀝니다.
      </p>
      <div className="grid gap-x-5 gap-y-4 p-4 md:grid-cols-2">
        <div>
          <label htmlFor="profile-name" className={field.label}>
            이름
          </label>
          <input id="profile-name" name="name" defaultValue={me.placeholder ? "" : me.name} placeholder="예: 한서윤" required minLength={2} maxLength={40} autoComplete="name" className={field.input} />
        </div>
        <div>
          <label htmlFor="profile-title-input" className={field.label}>
            직함
          </label>
          <input id="profile-title-input" name="title" defaultValue={me.title} placeholder="예: AI 데스크 에디터" required minLength={2} maxLength={60} className={field.input} />
        </div>
        <div>
          <label htmlFor="profile-slug" className={field.label}>
            공개 주소
          </label>
          <input id="profile-slug" name="slug" defaultValue={me.slug} required pattern="[a-z0-9][a-z0-9\-]{2,40}" aria-describedby="profile-slug-hint" className={cx(field.input, "font-mono")} />
          <p id="profile-slug-hint" className={field.hint}>
            영문 소문자·숫자·하이픈. newweb.media/editors/<span className="text-fg-2">주소</span>
          </p>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="profile-bio" className={field.label}>
            소개
          </label>
          <textarea id="profile-bio" name="bio" defaultValue={me.bio} maxLength={400} rows={3} className={field.textarea} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
        <button type="submit" disabled={pending} className={cx(btn.base, btn.primary)}>
          {pending ? "저장 중…" : "프로필 저장"}
        </button>
        <ActionMessage state={state} className="ml-auto" />
      </div>
    </form>
  );
}
