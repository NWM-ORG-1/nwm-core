"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DeskAdmin } from "@/data/admin-desk";
import { BEATS } from "@/lib/beats";
import { deleteLesson, saveLesson, setLessonPinned } from "@/server/actions/desk";
import type { ActionState } from "@/server/actions/result";
import { ActionButton, ActionMessage } from "../client";
import { Ago } from "../feeds/time";
import { Badge, btn, cx } from "../ui";

type Lessons = DeskAdmin["lessons"];
type Note = Lessons["notes"][number];

const SCOPES = [{ value: "all", label: "모든 초안" }, ...Object.values(BEATS).map((b) => ({ value: `beat:${b.id}`, label: `${b.label} 분야` }))];

/** 편집 노트: what the draft writer reads, learnt from editors' changes; editors can add, fix, pin or drop notes. */
export function LessonsPanel({ data }: { data: Lessons }) {
  const [editing, setEditing] = useState<string | null>(null);
  const full = data.notes.length >= data.max;
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] leading-relaxed text-fg-3">
        편집자가 AI 초안을 고쳐서 발행하면 고치기 전후를 모아 두었다가, 되풀이되는 수정만 노트로 정리합니다. AI 기자는 초안을 쓸 때 그 분야·출처에 맞는 노트를 함께 읽습니다. 노트는 최대{" "}
        {data.max}개이고, {data.halfLifeDays}일 동안 다시 확인되지 않으면 힘이 절반으로 줄어 결국 빠집니다. 고정한 노트와 직접 쓴 노트는 빠지지 않습니다.
      </p>
      {data.notes.length ? (
        <ol className="divide-y divide-line rounded-lg border border-line">
          {data.notes.map((n) => (
            <li key={n.id} className="px-3 py-2.5">
              {editing === n.id ? <NoteForm note={n} chars={data.chars} onDone={() => setEditing(null)} /> : <NoteRow note={n} onEdit={() => setEditing(n.id)} />}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed border-line-2 px-3 py-4 text-center text-[12.5px] text-fg-4">
          아직 노트가 없습니다. 고쳐서 발행한 초안이 {data.minCases}건 쌓이면 AI가 첫 노트를 정리합니다.
        </p>
      )}
      {full ? (
        <p className="text-[12px] text-fg-4">노트가 {data.max}개로 꽉 찼습니다. 직접 추가하려면 하나를 지우세요.</p>
      ) : editing === "new" ? (
        <div className="rounded-lg border border-line-2 p-3">
          <NoteForm chars={data.chars} onDone={() => setEditing(null)} />
        </div>
      ) : (
        <button type="button" onClick={() => setEditing("new")} className={cx(btn.base, btn.ghost)}>
          노트 직접 추가
        </button>
      )}
    </div>
  );
}

function NoteRow({ note, onEdit }: { note: Note; onEdit: () => void }) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
      <p className="min-w-0 basis-full text-[13px] leading-relaxed text-fg sm:flex-1 sm:basis-auto">
        {note.pinned && (
          <span className="mr-1" title="고정: 빠지지 않습니다" aria-label="고정">
            📌
          </span>
        )}
        {note.text}
      </p>
      <div className="order-last flex shrink-0 items-center gap-1.5 sm:order-none">
        <ActionButton action={setLessonPinned} args={{ id: note.id, pinned: !note.pinned }} variant="quiet" title={note.pinned ? "고정을 풀면 근거가 끊길 때 저절로 빠집니다" : "고정하면 빠지지 않습니다"}>
          {note.pinned ? "고정 해제" : "고정"}
        </ActionButton>
        <button type="button" onClick={onEdit} className={cx(btn.base, btn.quiet)}>
          고치기
        </button>
        <ActionButton action={deleteLesson} args={{ id: note.id }} variant="quiet" confirm="이 노트를 지울까요? 다음 초안부터 반영되지 않습니다.">
          지우기
        </ActionButton>
      </div>
      <p className="hud basis-full text-fg-4">
        <Badge tone={note.scope === "all" ? "neutral" : "ice"}>{note.scopeLabel}</Badge> <span className="ml-1">{note.origin === "editor" ? "편집자가 씀" : `근거 ${note.hits}건`}</span> · 마지막 확인{" "}
        <Ago iso={note.lastSeenAt} />
        {note.fading && (
          <span className="ml-1.5">
            <Badge tone="warn" title="새 근거가 없으면 다음 정리 때 빠집니다">
              곧 빠짐
            </Badge>
          </span>
        )}
      </p>
    </div>
  );
}

function NoteForm({ note, chars, onDone }: { note?: Note; chars: number; onDone: () => void }) {
  const router = useRouter();
  const [text, setText] = useState(note?.text ?? "");
  const [scope, setScope] = useState(note?.scope ?? "all");
  const [state, setState] = useState<ActionState<unknown>>(null);
  const [pending, start] = useTransition();
  const scopes = note && !SCOPES.some((s) => s.value === note.scope) ? [...SCOPES, { value: note.scope, label: note.scopeLabel }] : SCOPES;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveLesson({ id: note?.id, text, scope });
          setState(res);
          if (res?.ok) {
            onDone();
            router.refresh();
          }
        });
      }}
    >
      <label htmlFor={`lesson-${note?.id ?? "new"}`} className="sr-only">
        노트 내용
      </label>
      <textarea
        id={`lesson-${note?.id ?? "new"}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={chars}
        placeholder="예: 정부 보도자료 기사는 제목에 부처 약칭(산업부·기재부)을 쓴다."
        className="w-full rounded-lg border border-line-2 bg-bg-1 p-2 text-[13px] leading-relaxed text-fg"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`lesson-scope-${note?.id ?? "new"}`} className="sr-only">
          적용 범위
        </label>
        <select
          id={`lesson-scope-${note?.id ?? "new"}`}
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="h-8 rounded-md border border-line-2 bg-bg-1 px-2 text-[13px] text-fg"
        >
          {scopes.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="tabular text-[11px] text-fg-4">
          {text.trim().length}/{chars}
        </span>
        <span className="flex-1" />
        <button type="submit" disabled={pending || text.trim().length < 5} className={cx(btn.base, btn.primary)}>
          {pending ? "저장 중…" : note ? "저장" : "추가"}
        </button>
        <button type="button" onClick={onDone} className={cx(btn.base, btn.quiet)}>
          취소
        </button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
