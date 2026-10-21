"use client";

import { useId, useRef, useState } from "react";

/** Single-series line chart with a crosshair + tooltip (pointer and keyboard). */
export function ChartBlock({ title, unit, points, source }: { title: string; unit?: string; points: number[]; source?: string }) {
  const W = 640;
  const H = 200;
  const PAD = { l: 8, r: 8, t: 16, b: 22 };
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const gid = useId().replace(/:/g, "");
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const first = points[0];
  const last = points[points.length - 1];
  const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  const color = last > first ? "var(--up)" : last < first ? "var(--down)" : "var(--flat)";
  const fmt = (v: number) => `${Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("ko-KR") : Number(v.toFixed(2)).toLocaleString("ko-KR")}${unit ?? ""}`;

  const onMove = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const rel = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((rel - PAD.l) / (W - PAD.l - PAD.r)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  const hv = hover != null ? points[hover] : null;

  return (
    <figure className="panel my-1 p-4" data-noswipe>
      <figcaption className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold text-fg">{title}</span>
        <span className="tabular font-mono text-[12px]" style={{ color }}>
          {fmt(last)} · {change > 0 ? "▲" : change < 0 ? "▼" : ""}
          {Math.abs(change).toFixed(1)}%
        </span>
      </figcaption>
      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none"
          role="img"
          aria-label={`${title}: 시작 ${fmt(first)}, 마지막 ${fmt(last)}, 최고 ${fmt(max)}, 최저 ${fmt(min)}`}
          tabIndex={0}
          onPointerMove={(e) => onMove(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1));
            else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? points.length) - 1));
            else if (e.key === "Escape") setHover(null);
            else return;
            e.preventDefault();
          }}
        >
          <defs>
            <linearGradient id={`a${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.18" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + f * (H - PAD.t - PAD.b)} y2={PAD.t + f * (H - PAD.t - PAD.b)} stroke="var(--line)" />
          ))}
          <path d={`${d}L${x(points.length - 1)},${H - PAD.b}L${PAD.l},${H - PAD.b}Z`} fill={`url(#a${gid})`} />
          <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(points.length - 1)} cy={y(last)} r="3.5" fill={color} />
          {hover != null && hv != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--line-3)" strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(hv)} r="4.5" fill="var(--bg-1)" stroke={color} strokeWidth="2" />
            </g>
          )}
          <text x={PAD.l} y={H - 5} fill="var(--fg-4)" fontSize="11" fontFamily="var(--font-mono)">
            {fmt(min)}
          </text>
          <text x={W - PAD.r} y={PAD.t - 4} textAnchor="end" fill="var(--fg-4)" fontSize="11" fontFamily="var(--font-mono)">
            {fmt(max)}
          </text>
        </svg>
        {hover != null && hv != null && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-line-2 bg-bg-1 px-2 py-1 text-[12px] shadow-[var(--shadow-pop)]"
            style={{ left: `${(x(hover) / W) * 100}%` }}
          >
            <span className="tabular font-mono text-fg">{fmt(hv)}</span>
            <span className="ml-1.5 text-fg-4">
              {hover + 1}/{points.length}
            </span>
          </div>
        )}
      </div>
      {source && <p className="mt-2 text-[11.5px] text-fg-4">출처: {source}</p>}
    </figure>
  );
}
