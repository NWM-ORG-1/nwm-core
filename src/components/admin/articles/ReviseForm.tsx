"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { z } from "zod";
import { blockSchema, type Block, type SentimentSnapshot } from "@/lib/content/blocks";
import { ArticleBlocks } from "@/components/article/ArticleBlocks";
import { ActionMessage } from "@/components/admin/client";
import { btn, cx } from "@/components/admin/ui";
import { reviseArticleAt } from "@/server/actions/articles-extra";
import type { ActionState } from "@/server/actions/result";
import { bodyLines, diff } from "./diff";
import { CORRECTION_KIND_HELP, CORRECTION_KIND_LABEL, REQUEST_CHANNEL_LABEL, shortDateTime, type CorrectionKind } from "./labels";
import { useRevise } from "./ReviseContext";

const blocksSchema = z.array(blockSchema).min(1, "블록이 1개 이상 있어야 합니다").max(16, "블록은 최대 16개입니다");

const input =
  "w-full rounded-lg border border-line-2 bg-bg-1 px-3 text-[13.5px] text-fg placeholder:text-fg-4 transition-colors hover:border-line-3 focus:border-ice focus:shadow-[0_0_0_3px_var(--ice-glow)] focus:outline-none focus-visible:outline-none aria-[invalid=true]:border-bad";
const label = "kicker mb-1.5 flex items-baseline justify-between gap-2 text-fg-2";
const help = "mt-1 text-[12px] leading-relaxed text-fg-3";
const err = "mt-1 text-[12px] font-medium text-bad";

const TYPE_KO: Record<string, string> = { string: "문자열", number: "숫자", object: "객체", array: "배열", boolean: "참/거짓" };

interface Issue {
  where: string;
  message: string;
  /** schema: the server rejects it too · unknown: the server would silently drop the field */
  kind: "schema" | "unknown";
}

type Path = ReadonlyArray<PropertyKey>;

/** Path → "블록 3 (why) · items[0]". */
function locate(path: Path, raw: unknown): string {
  if (!path.length || typeof path[0] !== "number") return "블록 목록";
  const i = path[0];
  const t = Array.isArray(raw) && raw[i] && typeof raw[i] === "object" ? (raw[i] as { type?: unknown }).type : undefined;
  const rest = path
    .slice(1)
    .map((p) => (typeof p === "number" ? `[${p}]` : `.${String(p)}`))
    .join("")
    .replace(/^\./, "");
  return `블록 ${i + 1}${typeof t === "string" ? ` (${t})` : ""}${rest ? ` · ${rest}` : ""}`;
}

/**
 * Keys present in the JSON but absent after parsing. zod strips unknown keys
 * without an error, so a typo such as "txet" would pass validation and the
 * text would be lost on save — the form treats these as errors.
 */
function strayKeys(raw: unknown, parsed: unknown, path: PropertyKey[] = [], out: PropertyKey[][] = []): PropertyKey[][] {
  if (Array.isArray(raw) && Array.isArray(parsed)) {
    raw.forEach((r, i) => strayKeys(r, parsed[i], [...path, i], out));
  } else if (raw && typeof raw === "object" && parsed && typeof parsed === "object" && !Array.isArray(raw)) {
    const p = parsed as Record<string, unknown>;
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!(k in p)) out.push([...path, k]);
      else strayKeys(v, p[k], [...path, k], out);
    }
  }
  return out;
}

/** V8 / SpiderMonkey JSON.parse messages → Korean. */
const JSON_MSG: Array<[RegExp, string]> = [
  [/unexpected end of (JSON input|data)/i, "JSON이 중간에 끝났습니다 — 닫는 괄호·따옴표가 빠졌는지 확인하세요"],
  [/expected double-quoted property name/i, "속성 이름이 와야 할 자리입니다 — 마지막 항목 뒤의 쉼표(,)를 지우세요"],
  [/expected property name or '}'/i, "속성 이름은 큰따옴표로 감싸야 합니다"],
  [/expected ',' or '}' after property value/i, "속성 값 뒤에 쉼표(,)나 닫는 중괄호(})가 필요합니다"],
  [/expected ',' or '\]' after array element/i, "배열 항목 뒤에 쉼표(,)나 닫는 대괄호(])가 필요합니다"],
  [/expected ':' after property name/i, "속성 이름 뒤에 콜론(:)이 필요합니다"],
  [/control character/i, "문자열 안에 줄바꿈·탭이 그대로 들어 있습니다 — 한 줄로 쓰세요"],
  [/unterminated string/i, "따옴표가 닫히지 않았습니다"],
  [/bad (escaped|escape) character/i, "잘못된 이스케이프(\\) 문자가 있습니다"],
];

function syntaxMessage(json: string, msg: string): string {
  let loc = "";
  const lc = /line (\d+) column (\d+)/.exec(msg);
  const pos = /position (\d+)/.exec(msg);
  if (lc) loc = `${lc[1]}행 ${lc[2]}열`;
  else if (pos) {
    const before = json.slice(0, Number(pos[1]));
    loc = `${before.split("\n").length}행 ${Number(pos[1]) - before.lastIndexOf("\n")}열`;
  }
  const tok = /unexpected (?:token|character) '(.+?)'/i.exec(msg)?.[1];
  const ko =
    JSON_MSG.find(([re]) => re.test(msg))?.[1] ??
    (tok ? `예상하지 못한 문자 ‘${tok}’ — 쉼표·따옴표·괄호를 확인하세요` : "JSON 형식이 아닙니다 — 쉼표·따옴표·괄호를 확인하세요");
  return loc ? `${loc} 근처 — ${ko}` : ko;
}

/** Zod issue → "블록 3 (why) · items[0]" + Korean message with the exact constraint. */
function describe(issue: z.core.$ZodIssue, raw: unknown): Issue {
  const where = locate(issue.path, raw);
  const i = issue as z.core.$ZodIssue & {
    origin?: string;
    minimum?: number | bigint;
    maximum?: number | bigint;
    expected?: string;
    values?: unknown[];
    options?: unknown[];
    note?: string;
  };
  let message = issue.message;
  if (i.code === "too_small") {
    message =
      i.origin === "string" ? `${i.minimum}자 이상이어야 합니다 (빈 값 불가)` : i.origin === "array" ? `항목이 ${i.minimum}개 이상 필요합니다` : `${i.minimum} 이상이어야 합니다`;
  } else if (i.code === "too_big") {
    message = i.origin === "string" ? `${i.maximum}자 이하여야 합니다` : i.origin === "array" ? `항목은 최대 ${i.maximum}개입니다` : `${i.maximum} 이하여야 합니다`;
  } else if (i.code === "invalid_type") {
    message = `${TYPE_KO[i.expected ?? ""] ?? i.expected} 값이어야 합니다`;
  } else if (i.code === "invalid_value") {
    message = `허용 값: ${(i.values ?? []).map(String).join(", ")}`;
  } else if (i.code === "invalid_union" && i.options) {
    message = `type은 ${(i.options ?? []).map(String).join(" · ")} 중 하나여야 합니다`;
  }
  return { where, message, kind: "schema" };
}

/** JSON → validated blocks, or the exact problems. */
function validate(json: string): { blocks: Block[]; issues: null; syntax: null } | { blocks: null; issues: Issue[] | null; syntax: string | null } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { blocks: null, issues: null, syntax: syntaxMessage(json, e instanceof Error ? e.message : String(e)) };
  }
  const r = blocksSchema.safeParse(raw);
  if (!r.success) return { blocks: null, issues: r.error.issues.map((x) => describe(x, raw)), syntax: null };
  const stray = strayKeys(raw, r.data);
  if (stray.length) {
    return {
      blocks: null,
      issues: stray.map((p) => ({ where: locate(p, raw), message: "이 블록에 없는 필드입니다 — 저장하면 버려집니다 (필드 이름 오타 확인)", kind: "unknown" })),
      syntax: null,
    };
  }
  return { blocks: r.data, issues: null, syntax: null };
}

const pretty = (blocks: unknown) => JSON.stringify(blocks, null, 2);

interface Base {
  revision: number;
  title: string;
  dek: string;
  blocks: Block[];
  json: string;
}

export interface OpenRequestOption {
  id: string;
  requester: string;
  channel: string;
  receivedAt: string;
  claim: string;
}

/**
 * 수정·정정 form. Title, dek and the block JSON are edited in place and validated
 * against the same zod schema the server uses; a correction kind adds a public
 * note (shown under the article and on /corrections) and may close an open
 * 정정 요청. Submitting creates a new revision via reviseArticle().
 */
export function ReviseForm({
  article,
  openRequests,
}: {
  article: { id: string; title: string; dek: string; blocks: Block[]; sentiment: SentimentSnapshot | null; revision: number; status: "published" | "unpublished" };
  openRequests: OpenRequestOption[];
}) {
  const router = useRouter();
  const uid = useId();
  const { kind, setKind, requestId, setRequestId, revealRef } = useRevise();
  const sectionRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);

  // What is live now; blocks normalised through the schema so key order doesn't count as a change.
  const live = useMemo<Base>(() => {
    const parsed = blocksSchema.safeParse(article.blocks);
    const blocks = parsed.success ? parsed.data : article.blocks;
    return { revision: article.revision, title: article.title, dek: article.dek, blocks, json: pretty(blocks) };
  }, [article.revision, article.title, article.dek, article.blocks]);

  // The version this form was opened on. It only moves when the editor adopts a newer one.
  const [base, setBase] = useState<Base>(live);
  const [title, setTitle] = useState(live.title);
  const [dek, setDek] = useState(live.dek);
  const [json, setJson] = useState(live.json);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(false);
  const [tried, setTried] = useState(false);
  const [result, setResult] = useState<ActionState<{ revision: number }>>(null);
  const [pending, start] = useTransition();

  // Let the request list reveal this form ("정정으로 처리").
  useEffect(() => {
    revealRef.current = () => {
      const target = noteRef.current ?? reasonRef.current;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.focus({ preventScroll: true });
      } else sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    return () => {
      revealRef.current = null;
    };
  }, [revealRef]);

  const v = useMemo(() => validate(json), [json]);
  const sameAs = (b: Base) => title.trim() === b.title && dek.trim() === b.dek && v.blocks != null && JSON.stringify(v.blocks) === JSON.stringify(b.blocks);

  // A newer revision arrived (router refresh). Adopt it silently when that is safe:
  // the form already holds exactly that text (our own save), or the form is untouched.
  if (live.revision !== base.revision) {
    if (sameAs(live)) {
      setBase(live);
    } else if (sameAs(base) && !reason.trim() && !note.trim()) {
      setBase(live);
      setTitle(live.title);
      setDek(live.dek);
      setJson(live.json);
    }
  }
  /** Someone else saved while this form held unsaved edits — saving would overwrite them. */
  const stale = live.revision !== base.revision;

  const changes = useMemo(() => {
    const t = title.trim() !== base.title;
    const d = dek.trim() !== base.dek;
    let added = 0;
    let removed = 0;
    if (v.blocks) {
      for (const op of diff(bodyLines(base.blocks), bodyLines(v.blocks))) {
        if (op.type === "add") added++;
        else if (op.type === "del") removed++;
      }
    }
    const structural = v.blocks ? JSON.stringify(v.blocks) !== JSON.stringify(base.blocks) : false;
    return { title: t, dek: d, added, removed, body: structural, any: t || d || structural };
  }, [title, dek, v.blocks, base]);

  // A request linked earlier may have been rejected or accepted since; only open ones count.
  const linked = kind ? openRequests.find((r) => r.id === requestId) : undefined;

  const errors = {
    stale: stale ? `다른 편집자가 r${live.revision}을 먼저 저장했습니다 — 최신 버전을 불러온 뒤 다시 적용하세요` : null,
    title: !title.trim() ? "제목을 입력하세요" : title.trim().length > 120 ? "제목은 120자 이하입니다" : null,
    dek: !dek.trim() ? "시그널을 입력하세요" : dek.trim().length > 300 ? "시그널은 300자 이하입니다" : null,
    blocks: v.syntax ? "JSON 문법 오류" : v.issues ? `블록 검증 오류 ${v.issues.length}건` : null,
    reason: reason.trim().length < 2 ? "수정 사유를 2자 이상 적으세요 (내부 기록)" : reason.trim().length > 200 ? "200자 이하로 적으세요" : null,
    note: kind && note.trim().length < 5 ? "공개 정정문을 5자 이상 적으세요" : kind && note.trim().length > 500 ? "500자 이하로 적으세요" : null,
    changes: !changes.any ? "바뀐 내용이 없습니다. 제목·시그널·본문 중 하나 이상을 고치세요." : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (tried ? errors[k] : null);

  /** Discard edits and load the live version (also clears a stale-version conflict). */
  const dirty = changes.any || Boolean(reason.trim()) || Boolean(note.trim());

  function reset() {
    if (dirty && !window.confirm(stale ? `작성 중인 수정 내용을 버리고 최신 버전 r${live.revision}을 불러올까요?` : "작성 중인 수정 내용을 버리고 현재 버전으로 되돌릴까요?")) return;
    setBase(live);
    setTitle(live.title);
    setDek(live.dek);
    setJson(live.json);
    setReason("");
    setNote("");
    setKind("");
    setRequestId("");
    setTried(false);
    setResult(null);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTried(true);
    if (invalid || !v.blocks) return;
    const blocks = v.blocks;
    const t = title.trim();
    const d = dek.trim();
    start(async () => {
      const res = await reviseArticleAt({
        id: article.id,
        baseRevision: base.revision,
        title: t,
        dek: d,
        blocks,
        reason: reason.trim(),
        correction: kind ? { kind, note: note.trim() } : null,
        requestId: linked?.id ?? null,
      });
      setResult(res);
      if (res?.ok) {
        // The submitted text is the new base; the refreshed props will match it.
        setBase({ revision: res.data?.revision ?? base.revision + 1, title: t, dek: d, blocks, json: pretty(blocks) });
        setTitle(t);
        setDek(d);
        setJson(pretty(blocks));
        setReason("");
        setNote("");
        setKind("");
        setRequestId("");
        setTried(false);
      }
      // On success the newer revision, on a conflict the other editor's revision.
      if (res?.ok || (res && !res.ok && (res.code === "conflict" || res.code === "state"))) router.refresh();
    });
  }

  const next = base.revision + 1;

  return (
    <div ref={sectionRef} className="scroll-mt-20">
      <form onSubmit={onSubmit} noValidate aria-describedby={`${uid}-lead`} className="space-y-4">
        <p id={`${uid}-lead`} className="sr-only">
          제출하면 r{next} 버전이 만들어지고 독자 화면에 즉시 반영됩니다.
        </p>

        {stale && (
          <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warn/40 bg-warn/[0.07] px-3.5 py-2.5 text-[12.5px]">
            <p className="min-w-0 flex-1 basis-64 leading-relaxed text-fg-2">
              <span className="font-semibold text-fg">
                이 양식을 연 뒤 r{live.revision}이 저장됐습니다.
              </span>{" "}
              지금 내용(r{base.revision} 기준)으로 저장하면 그 변경을 덮어쓰게 되므로 저장할 수 없습니다. 버전 이력에서 바뀐 부분을 확인하고, 최신 버전을 불러와 다시 고치세요.
            </p>
            <button type="button" onClick={reset} className={cx(btn.base, btn.ghost, "h-8 shrink-0")}>
              최신 버전 불러오기
            </button>
          </div>
        )}

        <div>
          <label htmlFor={`${uid}-title`} className={label}>
            <span>
              제목 <span className="text-bad" aria-hidden="true">*</span>
            </span>
            <span className={cx("tabular font-mono text-[11px]", title.trim().length > 120 ? "text-bad" : "text-fg-4")}>{title.trim().length}/120</span>
          </label>
          <input
            id={`${uid}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={!!show("title")}
            aria-describedby={show("title") ? `${uid}-title-err` : undefined}
            className={cx(input, "h-10 font-semibold")}
          />
          {show("title") && (
            <p id={`${uid}-title-err`} className={err}>
              {show("title")}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${uid}-dek`} className={label}>
            <span>
              시그널 (리드 한 줄) <span className="text-bad" aria-hidden="true">*</span>
            </span>
            <span className={cx("tabular font-mono text-[11px]", dek.trim().length > 300 ? "text-bad" : "text-fg-4")}>{dek.trim().length}/300</span>
          </label>
          <textarea
            id={`${uid}-dek`}
            value={dek}
            onChange={(e) => setDek(e.target.value)}
            rows={2}
            aria-invalid={!!show("dek")}
            aria-describedby={show("dek") ? `${uid}-dek-err` : undefined}
            className={cx(input, "resize-y py-2 leading-relaxed")}
          />
          {show("dek") && (
            <p id={`${uid}-dek-err`} className={err}>
              {show("dek")}
            </p>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={`${uid}-json`} className="kicker text-fg-2">
              본문 블록 (JSON) <span className="text-bad" aria-hidden="true">*</span>
            </label>
            <div className="flex items-center gap-2">
              <span className={cx("text-[11.5px]", v.blocks ? "text-good" : "text-bad")} role="status">
                {v.blocks ? `✓ 검증 통과 · 블록 ${v.blocks.length}개` : v.syntax ? "✕ JSON 문법 오류" : `✕ 검증 오류 ${v.issues?.length ?? 0}건`}
              </span>
              <button
                type="button"
                onClick={() => setPreview((p) => !p)}
                aria-pressed={preview}
                aria-controls={`${uid}-preview`}
                className={cx(btn.base, btn.ghost, "h-7 px-2.5 text-[12px] aria-pressed:border-ice/50 aria-pressed:bg-ice/10 aria-pressed:text-fg")}
              >
                <span
                  className={cx("inline-block h-3 w-5 rounded-full border transition-colors", preview ? "border-ice bg-ice/60" : "border-line-3")}
                  aria-hidden="true"
                >
                  <span className={cx("block size-2 translate-y-[1px] rounded-full bg-fg transition-transform", preview ? "translate-x-[9px]" : "translate-x-[1px]")} />
                </span>
                미리보기
              </button>
            </div>
          </div>
          <div className={cx("grid gap-3", preview && "2xl:grid-cols-2")}>
            <div className="min-w-0">
              <textarea
                id={`${uid}-json`}
                value={json}
                onChange={(e) => setJson(e.target.value)}
                rows={preview ? 16 : 20}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={!v.blocks}
                aria-describedby={`${uid}-json-help ${!v.blocks ? `${uid}-json-err` : ""}`.trim()}
                className={cx(input, "resize-y py-2.5 font-mono text-[12px] leading-[1.6] [tab-size:2]")}
              />
              {!v.blocks && (
                <div id={`${uid}-json-err`} role="alert" className="mt-2 rounded-lg border border-bad/35 bg-bad/[0.06] px-3 py-2.5">
                  {v.syntax ? (
                    <p className="text-[12.5px] text-fg-2">
                      <span className="font-semibold text-bad">JSON 문법 오류</span> — <span className="font-mono text-[12px]">{v.syntax}</span>
                    </p>
                  ) : (
                    <>
                      <p className="text-[12.5px] font-semibold text-bad">
                        {v.issues?.every((x) => x.kind === "unknown")
                          ? `알 수 없는 필드 ${v.issues.length}건 — 그대로 저장하면 이 내용은 기사에 남지 않습니다`
                          : `블록 검증 오류 ${v.issues?.length}건 — 서버도 같은 규칙으로 거부합니다`}
                      </p>
                      <ul className="mt-1.5 max-h-48 space-y-1 overflow-auto text-[12.5px]">
                        {v.issues?.slice(0, 30).map((x, i) => (
                          <li key={i} className="flex flex-wrap gap-x-2">
                            <span className="font-mono text-[12px] text-fg">{x.where}</span>
                            <span className="text-fg-2">{x.message}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
              <details id={`${uid}-json-help`} className="group mt-2 text-[12px] text-fg-3">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded hover:text-fg-2">
                  <span className="transition-transform group-open:rotate-90" aria-hidden="true">
                    ›
                  </span>
                  블록 형식 안내
                </summary>
                <ul className="mt-2 grid gap-x-4 gap-y-1 rounded-lg border border-line px-3 py-2.5 font-mono text-[11.5px] leading-relaxed sm:grid-cols-2">
                  <li>why · items[1–3]</li>
                  <li>numbers · items[1–4] {"{value,label,delta?,trend?}"}</li>
                  <li>section · label, text?, bullets?[≤5]</li>
                  <li>quote · text, attribution, role?</li>
                  <li>chart · title, points[2–96], unit?, source?</li>
                  <li>table · caption, columns[2–6], rows</li>
                  <li>next · items[1–3]</li>
                  <li>deeper · links[1–5] {"{title,href,kind}"}</li>
                  <li className="font-sans sm:col-span-2">
                    sentiment 블록은 발행 시점 심리 스냅샷을 그대로 씁니다. 굵게는 <span className="font-mono">**텍스트**</span>만 지원합니다.
                  </li>
                </ul>
              </details>
            </div>

            {preview && (
              <div id={`${uid}-preview`} className="min-w-0 rounded-xl border border-line bg-bg px-4 py-4 sm:px-5" aria-label="독자 화면 미리보기">
                <p className="hud mb-3 flex items-center gap-2 text-fg-4">
                  <span className="size-1.5 rounded-full bg-live" aria-hidden="true" />
                  PREVIEW · r{next}
                </p>
                <h3 className="text-[22px] font-extrabold leading-[1.25] tracking-[-0.03em] text-fg">{title.trim() || "제목 없음"}</h3>
                <div className="mt-3 border-l-2 border-ice/60 pl-3.5">
                  <p className="kicker mb-1 text-ice">시그널</p>
                  <p className="text-[15.5px] font-medium leading-relaxed text-fg-2">{dek.trim() || "—"}</p>
                </div>
                <div className="mt-6">
                  {v.blocks ? (
                    <ArticleBlocks blocks={v.blocks} sentiment={article.sentiment} />
                  ) : (
                    <p className="rounded-lg border border-dashed border-line-2 px-3 py-6 text-center text-[13px] text-fg-3">JSON 오류를 고치면 미리보기가 갱신됩니다.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 border-t border-line pt-4 md:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-reason`} className={label}>
              <span>
                수정 사유 <span className="text-bad" aria-hidden="true">*</span>
              </span>
              <span className="text-[11px] font-normal text-fg-4">내부 기록 · 버전 이력</span>
            </label>
            <input
              id={`${uid}-reason`}
              ref={reasonRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="예: 공시 원문 기준으로 증설 규모 수치 수정"
              aria-invalid={!!show("reason")}
              aria-describedby={show("reason") ? `${uid}-reason-err` : undefined}
              className={cx(input, "h-9")}
            />
            {show("reason") && (
              <p id={`${uid}-reason-err`} className={err}>
                {show("reason")}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={`${uid}-kind`} className={label}>
              <span>정정 종류</span>
              <span className="text-[11px] font-normal text-fg-4">독자 공지 여부</span>
            </label>
            <select
              id={`${uid}-kind`}
              value={kind}
              onChange={(e) => setKind(e.target.value as CorrectionKind | "")}
              aria-describedby={`${uid}-kind-help`}
              className={cx(input, "h-9 px-2.5")}
            >
              <option value="">없음 — 단순 수정 (공지 없음)</option>
              <option value="correction">정정 — 사실관계 오류</option>
              <option value="clarification">바로잡음 — 오해 소지 해소</option>
              <option value="update">업데이트 — 새 사실 추가</option>
            </select>
            <p id={`${uid}-kind-help`} className={help}>
              {kind ? CORRECTION_KIND_HELP[kind] : "오탈자·문장 다듬기처럼 사실관계가 바뀌지 않는 수정만 공지 없이 고칩니다. 버전 이력에는 남습니다."}
            </p>
          </div>
        </div>

        {kind && (
          <div className="grid gap-4 rounded-xl border border-warn/30 bg-warn/[0.05] p-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
            <div>
              <label htmlFor={`${uid}-note`} className={label}>
                <span>
                  공개 정정문 ({CORRECTION_KIND_LABEL[kind]}) <span className="text-bad" aria-hidden="true">*</span>
                </span>
                <span className={cx("tabular font-mono text-[11px]", note.trim().length > 500 ? "text-bad" : "text-fg-4")}>{note.trim().length}/500</span>
              </label>
              <textarea
                id={`${uid}-note`}
                ref={noteRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="예: 최초 기사에서 신규 증설 규모를 ‘GPU 2만 장’으로 잘못 적었습니다. 회사 공시 기준 신규 증설분은 1만2000장입니다. 바로잡습니다."
                aria-invalid={!!show("note")}
                aria-describedby={`${uid}-note-help${show("note") ? ` ${uid}-note-err` : ""}`}
                className={cx(input, "resize-y py-2 leading-relaxed")}
              />
              {show("note") && (
                <p id={`${uid}-note-err`} className={err}>
                  {show("note")}
                </p>
              )}
              <p id={`${uid}-note-help`} className={help}>
                기사 하단 ‘정정 이력’과 공개 정정 페이지(/corrections)에 날짜와 함께 그대로 게시됩니다. 무엇이 틀렸고 어떻게 고쳤는지 독자가 알 수 있게 적으세요.
              </p>
            </div>
            <div>
              <label htmlFor={`${uid}-req`} className={label}>
                <span>연결할 정정 요청</span>
                <span className="text-[11px] font-normal text-fg-4">선택</span>
              </label>
              <select
                id={`${uid}-req`}
                value={linked?.id ?? ""}
                onChange={(e) => setRequestId(e.target.value)}
                disabled={!openRequests.length}
                className={cx(input, "h-9 px-2.5 disabled:opacity-50")}
              >
                <option value="">{openRequests.length ? "연결 안 함" : "미처리 요청 없음"}</option>
                {openRequests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.requester} · {REQUEST_CHANNEL_LABEL[r.channel] ?? r.channel} · {shortDateTime(r.receivedAt)}
                  </option>
                ))}
              </select>
              {linked ? (
                <p className="mt-1.5 line-clamp-3 rounded-lg border border-line bg-bg-1 px-2.5 py-1.5 text-[12px] leading-relaxed text-fg-2">“{linked.claim}”</p>
              ) : (
                <p className={help}>연결하면 게시와 동시에 요청이 ‘정정 반영’으로 처리됩니다.</p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4">
          <button type="submit" disabled={pending} className={cx(btn.base, kind ? "bg-warn text-bg hover:opacity-90" : btn.primary, "h-9 px-4")}>
            {pending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
            {kind ? `${CORRECTION_KIND_LABEL[kind]} 게시` : "수정 저장"} · r{next}
          </button>
          <button type="button" onClick={reset} disabled={pending || (!dirty && !stale)} className={cx(btn.base, btn.quiet, "h-9")}>
            되돌리기
          </button>
          <p className="tabular text-[12px] text-fg-3" aria-live="polite">
            {changes.any ? (
              <>
                변경:{" "}
                {[changes.title && "제목", changes.dek && "시그널", changes.body && `본문 +${changes.added} −${changes.removed}`].filter(Boolean).join(" · ")}
                {article.status === "published" ? " — 저장 즉시 독자 화면에 반영됩니다" : " — 비공개 상태라 독자에게는 보이지 않습니다"}
              </>
            ) : (
              "아직 바뀐 내용이 없습니다"
            )}
          </p>
        </div>
        {tried && invalid && (
          <p role="alert" className="text-[12.5px] font-medium text-bad">
            {[errors.stale, errors.changes, errors.title, errors.dek, errors.blocks, errors.reason, errors.note].filter(Boolean).join(" · ")}
          </p>
        )}
        {/* A conflict is already explained by the banner and the line above. */}
        {!(stale && result && !result.ok && result.code === "conflict") && <ActionMessage state={result} />}
      </form>
    </div>
  );
}
