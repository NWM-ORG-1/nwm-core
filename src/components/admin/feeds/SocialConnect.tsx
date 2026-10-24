"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, btn, cx } from "@/components/admin/ui";
import { BeatChip } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";
import type { Beat } from "@/db/schema";
import type { SocialKind } from "@/ingest/social-handles";
import { BEAT_ORDER } from "@/lib/beats";
import { TRUST_TIER_LABEL } from "@/lib/labels";
import { addSocialSources, checkSocialSources, type SocialCheck } from "@/server/actions/sources";
import type { AddSocialResult, SocialPreview } from "@/server/social-sources";
import { field } from "./bits";
import { LANG_LABEL, TRUST_TIER_HELP } from "./labels";
import { Ago } from "./time";

type Output = "items" | "posts" | "both";
type Lang = "ko" | "en" | "ja" | "zh";
interface Options {
  output: Output;
  beats: Beat[];
  lang: Lang;
  trustTier: number;
  signalOnly: boolean;
  llmConsent: boolean;
}

const DEFAULTS: Record<SocialKind, Options> = {
  telegram: { output: "items", beats: [], lang: "ko", trustTier: 2, signalOnly: true, llmConsent: true },
  x: { output: "items", beats: [], lang: "en", trustTier: 2, signalOnly: false, llmConsent: false },
};

const KIND: Record<SocialKind, { tab: string; placeholder: string; help: string }> = {
  telegram: {
    tab: "텔레그램 채널",
    placeholder: "https://t.me/channel_name\n@another_channel",
    help: "공개 채널의 링크나 @이름을 한 줄에 하나씩(쉼표도 됩니다). 한 번에 20개까지.",
  },
  x: {
    tab: "X 계정",
    placeholder: "https://x.com/account\n@another_account",
    help: "계정 링크나 @이름을 한 줄에 하나씩(쉼표도 됩니다). 한 번에 50개까지.",
  },
};

const OUTPUTS: Array<[Output, string, string]> = [
  ["items", "기사 단서", "새 글이 피드 인박스에 올라와 기사 후보로 검토됩니다."],
  ["posts", "투자심리", "글의 양과 반응을 투자심리 지표에만 씁니다."],
  ["both", "둘 다", "인박스와 투자심리 지표에 모두 씁니다."],
];

const selectable = (i: SocialPreview) => i.status !== "missing" && !(i.existing && i.existing.status !== "paused");
const fmtCount = (n: number) => (n >= 10_000 ? `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1)}만` : n.toLocaleString("ko-KR"));

export function SocialConnect({ xKey }: { xKey: boolean }) {
  const [kind, setKind] = useState<SocialKind>("telegram");
  const [text, setText] = useState("");
  const [check, setCheck] = useState<SocialCheck | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [opts, setOpts] = useState<Options>(DEFAULTS.telegram);
  const [result, setResult] = useState<{ message?: string; data: AddSocialResult; kind: SocialKind; keyMissing?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [adding, startAdd] = useTransition();

  const switchKind = (k: SocialKind) => {
    if (k === kind) return;
    setKind(k);
    setText("");
    setCheck(null);
    setPicked(new Set());
    setOpts(DEFAULTS[k]);
    setError(null);
  };

  const runCheck = () => {
    if (!text.trim() || checking) return;
    setError(null);
    setResult(null);
    startCheck(async () => {
      const res = await checkSocialSources({ kind, text });
      if (res?.ok && res.data) {
        setCheck(res.data);
        setPicked(new Set(res.data.items.filter(selectable).map((i) => i.name)));
      } else setError(res && !res.ok ? res.error : "확인하지 못했습니다.");
    });
  };

  const items = check?.items ?? [];
  const chosen = items.filter((i) => picked.has(i.name) && selectable(i));
  const toggle = (name: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const add = () => {
    if (!chosen.length || adding || !check) return;
    setError(null);
    startAdd(async () => {
      const res = await addSocialSources({
        kind: check.kind,
        entries: chosen.map((i) => ({ name: i.name, title: i.title })),
        beats: opts.beats,
        lang: opts.lang,
        trustTier: opts.trustTier,
        signalOnly: opts.signalOnly,
        output: opts.output === "both" ? ["items", "posts"] : [opts.output],
        llmConsent: check.kind === "telegram" && opts.llmConsent,
      });
      if (res?.ok && res.data) {
        setResult({ message: res.message, data: res.data, kind: check.kind, keyMissing: check.keyMissing });
        setCheck(null);
        setPicked(new Set());
        setText("");
      } else setError(res && !res.ok ? res.error : "추가하지 못했습니다.");
    });
  };

  const set = <K extends keyof Options>(k: K, v: Options[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const keyMissing = kind === "x" && (check ? Boolean(check.keyMissing) : !xKey);

  return (
    <div className="space-y-5">
      <section className="panel p-5" aria-labelledby="sc-paste">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="hud mb-1.5 text-fg-4">01 · PASTE</p>
            <h2 id="sc-paste" className="text-[15px] font-bold tracking-[-0.01em] text-fg">
              붙여넣기
            </h2>
          </div>
          <div role="tablist" aria-label="연결할 곳" className="inline-flex rounded-lg border border-line-2 p-0.5">
            {(["telegram", "x"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => switchKind(k)}
                className={cx("h-7 rounded-md px-3 text-[12.5px] font-semibold transition-colors", kind === k ? "bg-ice/15 text-ice" : "text-fg-3 hover:text-fg")}
              >
                {KIND[k].tab}
              </button>
            ))}
          </div>
        </header>
        <label htmlFor="sc-text" className="sr-only">
          {KIND[kind].tab} 링크
        </label>
        <textarea
          id="sc-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (check) setCheck(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              runCheck();
            }
          }}
          rows={5}
          spellCheck={false}
          placeholder={KIND[kind].placeholder}
          aria-describedby="sc-text-help"
          className={cx(field.textarea, "font-mono text-[13px]")}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p id="sc-text-help" className="text-[12px] leading-relaxed text-fg-3">
            {KIND[kind].help}
          </p>
          <button type="button" onClick={runCheck} disabled={!text.trim() || checking} className={cx(btn.base, btn.ghost)}>
            {checking ? "확인 중…" : "확인"}
          </button>
        </div>
      </section>

      <div aria-live="polite" className="space-y-5">
        {error && (
          <p role="alert" className="rounded-xl border border-bad/40 bg-bad/[0.07] px-4 py-3 text-[13px] text-bad">
            {error}
          </p>
        )}

        {result && <ResultPanel result={result} />}

        {check && (
          <section className="panel overflow-hidden" aria-labelledby="sc-check">
            <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line px-5 py-4">
              <div>
                <p className="hud mb-1.5 text-fg-4">02 · CHECK</p>
                <h2 id="sc-check" className="text-[15px] font-bold tracking-[-0.01em] text-fg">
                  확인 결과
                </h2>
              </div>
              <p className="text-[12px] text-fg-3">
                {items.length}개 중 <span className="tabular font-semibold text-fg-2">{chosen.length}</span>개 선택
              </p>
            </header>
            {items.length ? (
              <ul className="divide-y divide-line">
                {items.map((i) => (
                  <PreviewRow key={i.name} kind={check.kind} item={i} checked={picked.has(i.name) && selectable(i)} onToggle={() => toggle(i.name)} />
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-[13px] text-fg-3">채널·계정으로 읽힌 줄이 없습니다.</p>
            )}
            {check.rejected.length > 0 && (
              <div className="border-t border-line px-5 py-3">
                <p className="text-[12px] font-semibold text-fg-2">읽지 못한 입력 {check.rejected.length}개</p>
                <ul className="mt-1 space-y-0.5 text-[12px] text-fg-3">
                  {check.rejected.slice(0, 12).map((r, n) => (
                    <li key={n}>
                      <span className="font-mono text-fg-2">{r.input}</span> — {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {check && items.some(selectable) && (
          <section className="panel p-5" aria-labelledby="sc-opts">
            <header className="mb-4">
              <p className="hud mb-1.5 text-fg-4">03 · COLLECT</p>
              <h2 id="sc-opts" className="text-[15px] font-bold tracking-[-0.01em] text-fg">
                수집 설정
              </h2>
              <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-fg-3">선택한 채널·계정 모두에 적용됩니다. 소스마다 나중에 소스 화면에서 바꿀 수 있습니다.</p>
            </header>
            <div className="space-y-5">
              <fieldset>
                <legend className={cx(field.label, "mb-2")}>쓰임</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {OUTPUTS.map(([v, label, help]) => (
                    <label
                      key={v}
                      className={cx(
                        "flex cursor-pointer flex-col gap-1 rounded-xl border px-3.5 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ice-glow)]",
                        opts.output === v ? "border-ice/60 bg-ice/[0.06]" : "border-line-2 hover:border-line-3",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <input type="radio" name="sc-output" checked={opts.output === v} onChange={() => set("output", v)} className="size-4 accent-[var(--ice)]" />
                        <span className="text-[13.5px] font-semibold text-fg">{label}</span>
                      </span>
                      <span className="text-[12px] leading-relaxed text-fg-3">{help}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className={cx(field.label, "mb-2")}>비트</legend>
                <div className="flex flex-wrap gap-2">
                  {BEAT_ORDER.map((b) => (
                    <label
                      key={b}
                      className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-line-2 px-2.5 transition-colors hover:border-line-3 has-[:checked]:border-ice/60 has-[:checked]:bg-ice/[0.06] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ice-glow)]"
                    >
                      <input
                        type="checkbox"
                        checked={opts.beats.includes(b)}
                        onChange={(e) => set("beats", e.target.checked ? [...opts.beats, b] : opts.beats.filter((x) => x !== b))}
                        className={field.check}
                      />
                      <BeatChip beat={b} />
                    </label>
                  ))}
                </div>
                <p className={field.help}>비워 두면 글마다 비트를 추정합니다.</p>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="sc-lang" className={cx(field.label, "mb-1.5 block")}>
                    언어
                  </label>
                  <select id="sc-lang" value={opts.lang} onChange={(e) => set("lang", e.target.value as Lang)} className={field.select}>
                    {(["ko", "en", "ja", "zh"] as const).map((l) => (
                      <option key={l} value={l}>
                        {LANG_LABEL[l]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="sc-tier" className={cx(field.label, "mb-1.5 block")}>
                    신뢰 등급
                  </label>
                  <select id="sc-tier" value={opts.trustTier} onChange={(e) => set("trustTier", Number(e.target.value))} aria-describedby="sc-tier-help" className={field.select}>
                    {[1, 2, 3, 4].map((t) => (
                      <option key={t} value={t}>
                        T{t} {TRUST_TIER_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <p id="sc-tier-help" className={field.help}>
                    {TRUST_TIER_HELP[opts.trustTier]}
                  </p>
                </div>
              </div>

              <Toggle
                checked={opts.signalOnly}
                onChange={(v) => set("signalOnly", v)}
                tone="warn"
                title="신호 전용 (재작성·인용 금지)"
                help="다른 매체의 채널처럼 내용을 그대로 쓸 수 없는 곳이면 켜 두세요. 무슨 일이 있는지 알려 주는 단서로만 쓰고, 기사는 1차 자료를 확인해 씁니다."
              />

              {kind === "telegram" ? (
                <Toggle
                  checked={opts.llmConsent}
                  onChange={(v) => set("llmConsent", v)}
                  title="운영자 동의를 받았습니다 (수집·AI 활용)"
                  help="텔레그램 약관은 채널 운영자의 동의 없이 글을 모으거나 AI에 쓰는 것을 금지합니다. 끄면 이 채널 글은 편집자만 보고, AI(데스크·투자심리 채점)는 쓰지 않습니다."
                />
              ) : (
                <div className={cx("rounded-xl border px-4 py-3 text-[12.5px] leading-relaxed", keyMissing ? "border-warn/50 bg-warn/[0.06] text-fg-2" : "border-line-2 text-fg-3")}>
                  <p className="flex items-center gap-1.5 font-mono text-[12px]">
                    <span className={keyMissing ? "text-warn" : "text-good"}>{keyMissing ? "✕" : "✓"}</span> X_BEARER_TOKEN
                    <span className="font-sans text-fg-3">{keyMissing ? "— 수집 워커에 아직 없습니다" : "— 수집 워커에 있습니다"}</span>
                  </p>
                  {keyMissing && <p className="mt-1">지금 추가해 둘 수 있지만, Railway의 worker 서비스 변수에 키를 넣기 전까지는 읽지 않습니다.</p>}
                  <p className="mt-1">게시물 1건을 읽을 때마다 $0.005가 과금됩니다. 계정마다 한 달 3,000건(약 $15)에서 멈추고, 처음에는 최근 15분 글부터 읽습니다. 10분마다 확인합니다.</p>
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <button type="button" onClick={add} disabled={!chosen.length || adding} className={cx(btn.base, btn.primary, "h-9 px-4")}>
                {adding ? "추가하는 중…" : `선택한 ${chosen.length}개 추가하고 수집 시작`}
              </button>
              <p className="text-[12px] text-fg-3">{kind === "telegram" ? "추가하면 몇 초 안에 첫 수집을 하고, 그 뒤 2분마다 새 글을 확인합니다." : "추가하면 몇 초 안에 첫 수집을 합니다."}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function PreviewRow({ kind, item, checked, onToggle }: { kind: SocialKind; item: SocialPreview; checked: boolean; onToggle: () => void }) {
  const can = selectable(item);
  const label = kind === "telegram" ? (item.title ?? `@${item.name}`) : `@${item.name}`;
  return (
    <li className={cx("flex gap-3 px-5 py-3.5", !can && "opacity-70")}>
      <input type="checkbox" checked={checked} disabled={!can} onChange={onToggle} aria-label={`${label} 선택`} className={cx(field.check, "mt-[3px]")} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[14px] font-semibold text-fg">{label}</span>
          {kind === "telegram" && item.title && <span className="font-mono text-[11.5px] text-fg-3">@{item.name}</span>}
          {item.subscribers != null && <span className="text-[12px] text-fg-3">구독자 {fmtCount(item.subscribers)}</span>}
          <StatusBadge item={item} />
        </p>
        {item.description && <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-fg-3">{item.description}</p>}
        {item.error && <p className={cx("mt-1 text-[12px] leading-snug", item.status === "missing" ? "text-bad" : "text-warn")}>{item.error}</p>}
        {item.existing && (
          <p className="mt-1 text-[12px] leading-snug text-fg-3">
            {item.existing.status === "paused" ? "일시정지된 소스가 있습니다 — 추가하면 지금 설정으로 다시 켭니다: " : "이미 수집 중인 소스: "}
            <Link href={`/admin/sources/${item.existing.id}`} className="font-medium text-ice hover:underline">
              {item.existing.name}
            </Link>
          </p>
        )}
        {item.alsoIn && <p className="mt-1 text-[12px] leading-snug text-warn">‘{item.alsoIn}’ 소스에도 들어 있습니다. 둘 다 켜 두면 같은 글을 두 번 읽고 두 번 과금됩니다.</p>}
        {item.recent && item.recent.length > 0 && (
          <ul className="mt-2 space-y-1 border-l border-line-2 pl-3">
            {item.recent.map((r) => (
              <li key={r.link} className="text-[12px] leading-snug text-fg-2">
                <a href={r.link} target="_blank" rel="noreferrer noopener" className="hover:text-fg">
                  {r.text}
                </a>{" "}
                <Ago iso={r.at} className="whitespace-nowrap text-fg-4" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function StatusBadge({ item }: { item: SocialPreview }) {
  if (item.existing) return item.existing.status === "paused" ? <Badge tone="warn">다시 켜기</Badge> : <Badge>이미 있음</Badge>;
  if (item.status === "missing") return <Badge tone="bad">수집 불가</Badge>;
  if (item.status === "unchecked") return <Badge tone="warn">확인 못함</Badge>;
  return <Badge tone="good">확인됨</Badge>;
}

function Toggle({ checked, onChange, title, help, tone = "ice" }: { checked: boolean; onChange: (v: boolean) => void; title: string; help: string; tone?: "ice" | "warn" }) {
  return (
    <label
      className={cx(
        "flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ice-glow)]",
        checked ? (tone === "warn" ? "border-warn/50 bg-warn/[0.06]" : "border-ice/60 bg-ice/[0.06]") : "border-line-2 hover:border-line-3",
      )}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className={cx(field.check, "mt-0.5")} />
      <span>
        <span className="block text-[13.5px] font-semibold text-fg">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-fg-3">{help}</span>
      </span>
    </label>
  );
}

function ResultPanel({ result }: { result: { message?: string; data: AddSocialResult; kind: SocialKind; keyMissing?: string } }) {
  const { data } = result;
  const rows = [
    ...data.added.map((r) => ({ ...r, tag: "새 소스" })),
    ...data.resumed.map((r) => ({ ...r, tag: "다시 켬" })),
  ];
  return (
    <section role="status" className="panel border-good/40 p-5">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-good">
        <Icon name="check" size={16} /> {result.message}
      </p>
      {rows.length > 0 && (
        <ul className="mt-3 space-y-1 text-[13px]">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-2">
              <Badge tone="ice">{r.tag}</Badge>
              <Link href={`/admin/sources/${r.id}`} className="font-medium text-fg hover:text-ice-2">
                {r.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data.skipped.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12.5px] text-fg-3">
          {data.skipped.map((s, n) => (
            <li key={n}>
              건너뜀 ·{" "}
              {s.id ? (
                <Link href={`/admin/sources/${s.id}`} className="text-fg-2 hover:text-fg">
                  {s.name}
                </Link>
              ) : (
                s.name
              )}{" "}
              — {s.reason}
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-fg-3">
          {result.kind === "x" && result.keyMissing
            ? "X_BEARER_TOKEN을 worker 서비스에 넣으면 수집을 시작합니다."
            : result.kind === "telegram"
              ? "몇 초 안에 첫 수집을 합니다. 처음에는 채널의 최근 글 20개를 한꺼번에 가져옵니다."
              : "몇 초 안에 첫 수집을 합니다."}{" "}
          결과는{" "}
          <Link href="/admin/ingest" className="font-medium text-ice hover:underline">
            수집 현황
          </Link>
          과 피드 인박스에서 볼 수 있습니다.
        </p>
      )}
    </section>
  );
}
