"use client";

import { useState, useTransition, type RefObject } from "react";
import { btn, cx } from "@/components/admin/ui";
import type { AdapterMeta } from "@/ingest/registry";
import { testSource, type DryRunPreview } from "@/server/actions/ingest";

/** What the chosen adapter does, which keys it needs (set or not — never the values), and a config template. */
export function AdapterHelp({
  meta,
  envPresent,
  configRef,
  onTemplate,
}: {
  meta: AdapterMeta | undefined;
  envPresent: Record<string, boolean>;
  configRef: RefObject<HTMLTextAreaElement | null>;
  onTemplate?: () => void;
}) {
  if (!meta) return null;
  const fillTemplate = () => {
    const el = configRef.current;
    if (!el) return;
    if (el.value.trim() && !window.confirm("지금 설정을 예시로 바꿀까요?")) return;
    el.value = JSON.stringify(meta.configExample, null, 2);
    onTemplate?.();
  };
  return (
    <div className="rounded-lg border border-line bg-bg-2/40 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-3">
      <p>
        <span className="font-semibold text-fg-2">{meta.label}</span> · {meta.description}
      </p>
      {meta.envVars.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {meta.envVars.map((v) => (
            <li key={v.name} title={v.help} className="font-mono text-[11.5px]">
              <span className={envPresent[v.name] ? "text-good" : v.required ? "text-bad" : "text-warn"}>{envPresent[v.name] ? "✓" : "✕"}</span> {v.name}
              {v.required ? "" : " (선택)"}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={fillTemplate} className="mt-2 text-[12px] font-semibold text-ice hover:underline">
        설정 예시 넣기
      </button>
    </div>
  );
}

/** Runs the adapter once with the config in the form — nothing is saved. */
export function DryRun({ sourceId, configRef }: { sourceId: string; configRef: RefObject<HTMLTextAreaElement | null> }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: true; data: DryRunPreview; message?: string } | { ok: false; error: string } | null>(null);

  const run = () =>
    start(async () => {
      const res = await testSource({ id: sourceId, configJson: configRef.current?.value ?? "" });
      if (res?.ok && res.data) setResult({ ok: true, data: res.data, message: res.message });
      else setResult({ ok: false, error: res && !res.ok ? res.error : "실행하지 못했습니다." });
    });

  return (
    <div className="mt-2">
      <button type="button" onClick={run} disabled={pending} className={cx(btn.base, btn.ghost)}>
        {pending ? "실행 중…" : "테스트 실행"}
      </button>
      <span className="ml-2 text-[12px] text-fg-3">저장하지 않고 한 번 수집해 결과만 봅니다 (편집 중인 설정 사용).</span>
      <div aria-live="polite">
        {result && !result.ok && (
          <p role="alert" className="mt-2 rounded-md bg-bad/10 px-2.5 py-2 text-[12.5px] leading-snug text-bad">
            {result.error}
          </p>
        )}
        {result?.ok && <Preview data={result.data} />}
      </div>
    </div>
  );
}

function Preview({ data }: { data: DryRunPreview }) {
  const c = data.counts;
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
  return (
    <div className="mt-2 rounded-lg border border-line bg-bg-2/40 p-3 text-[12.5px]">
      <p className="text-fg-2">
        <span className="font-semibold text-good">성공</span> · {data.durationMs}ms · 요청 {data.requests}회{data.httpStatus ? ` · HTTP ${data.httpStatus}` : ""} · 항목 {c.items} · 게시물 {c.posts} · 시세 {c.quotes} · 지표 {c.metrics}
      </p>
      {data.note && <p className="mt-1 text-fg-3">{data.note}</p>}
      <ul className="mt-2 space-y-1.5">
        {data.items.map((i, n) => (
          <li key={`i${n}`} className="leading-snug">
            <span className="font-medium text-fg-2">{i.title}</span> <span className="text-fg-4">{fmt(i.publishedAt)}</span>
            {i.summary && <span className="block truncate text-fg-3">{i.summary}</span>}
          </li>
        ))}
        {data.posts.map((p, n) => (
          <li key={`p${n}`} className="leading-snug">
            <span className="text-fg-2">{p.text}</span>{" "}
            <span className="font-mono text-[11px] text-fg-4">
              {fmt(p.postedAt)} · 조회 {p.engagement.views ?? "—"} · 댓글 {p.engagement.comments ?? "—"}
            </span>
          </li>
        ))}
        {data.quotes.map((q) => (
          <li key={q.symbol} className="font-mono text-[12px] text-fg-2">
            {q.symbol} {q.price} {q.currency} ({q.changePct > 0 ? "+" : ""}
            {q.changePct}%) · {fmt(q.asOf)}
          </li>
        ))}
        {data.metrics.map((m, n) => (
          <li key={`m${n}`} className="font-mono text-[11.5px] text-fg-3">
            {m.metric} {m.symbol} {fmt(m.at)} = {m.value}
          </li>
        ))}
      </ul>
    </div>
  );
}
