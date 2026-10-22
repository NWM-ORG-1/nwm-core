"use client";

import { useId, useState, useTransition } from "react";
import { btn, cx } from "@/components/admin/ui";
import { saveAutoSetting } from "@/server/actions/auto";

type Mode = "off" | "review" | "auto";

const MODES: Array<{ value: Mode; label: string; hint: string }> = [
  { value: "off", label: "끄기", hint: "만들지 않음" },
  { value: "review", label: "검토 후 발행", hint: "후보 보드 ‘검토’로" },
  { value: "auto", label: "자동 발행", hint: "체크 통과 시 바로 발행" },
];

/** Mode, plus the time (daily types) or threshold (sharp moves) of one automatic article type. */
export function AutoSettingForm({
  template,
  label,
  initial,
  kind,
}: {
  template: string;
  label: string;
  initial: { mode: Mode; time?: string; threshold?: number };
  kind: "daily" | "move" | "event";
}) {
  const id = useId();
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [time, setTime] = useState(initial.time ?? "");
  const [threshold, setThreshold] = useState(String(initial.threshold ?? 3));
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = mode !== saved.mode || (kind === "daily" && time !== (saved.time ?? "")) || (kind === "move" && Number(threshold) !== (saved.threshold ?? 3));

  const save = () => {
    if (mode === "auto" && saved.mode !== "auto" && !window.confirm(`‘${label}’ 기사를 편집자 검토 없이 바로 발행할까요? 필수 체크에 걸리면 검토 단계로 돌아옵니다.`)) return;
    start(async () => {
      const res = await saveAutoSetting({
        template,
        mode,
        ...(kind === "daily" ? { time } : {}),
        ...(kind === "move" ? { threshold: Number(threshold) } : {}),
      });
      if (res?.ok) {
        setSaved({ mode, time: kind === "daily" ? time : saved.time, threshold: kind === "move" ? Number(threshold) : saved.threshold });
        setMsg({ ok: true, text: res.message ?? "저장했습니다." });
      } else setMsg({ ok: false, text: res && !res.ok ? res.error : "저장하지 못했습니다." });
    });
  };

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="sr-only">{label} 발행 방식</legend>
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line-2 bg-bg-1/40 p-1">
          {MODES.map((m) => (
            <label
              key={m.value}
              className={cx(
                "cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ice",
                mode === m.value ? (m.value === "auto" ? "bg-ice/20 text-ice" : m.value === "off" ? "bg-bg-3 text-fg-2" : "bg-bg-3 text-fg") : "text-fg-3 hover:text-fg-2",
              )}
              title={m.hint}
            >
              <input type="radio" name={`${id}-mode`} value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="sr-only" />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-fg-3">
        {kind === "daily" && (
          <label className="inline-flex items-center gap-2">
            매일
            <input
              type="time"
              value={time}
              step={60}
              onChange={(e) => setTime(e.target.value)}
              className="tabular rounded-md border border-line-2 bg-bg-1 px-2 py-1 font-mono text-fg"
              aria-label={`${label} 발행 시각 (KST)`}
            />
            KST
          </label>
        )}
        {kind === "move" && (
          <label className="inline-flex items-center gap-2">
            1시간 변동률 ±
            <input
              type="number"
              min={1}
              max={30}
              step={0.5}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="tabular w-20 rounded-md border border-line-2 bg-bg-1 px-2 py-1 font-mono text-fg"
              aria-label="급변동 기준 (%)"
            />
            % 이상
          </label>
        )}
        <button type="button" onClick={save} disabled={!dirty || pending} className={cx(btn.base, dirty ? btn.primary : btn.ghost)}>
          {pending ? "저장 중…" : "저장"}
        </button>
        {msg && (
          <span role={msg.ok ? "status" : "alert"} className={cx("text-[12px]", msg.ok ? "text-fg-3" : "text-bad")}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
