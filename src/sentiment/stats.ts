/** Small robust statistics for the index (no dependencies). */

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** median absolute deviation, scaled to σ for normal data */
export function mad(xs: number[], med = median(xs)): number {
  return 1.4826 * median(xs.map((x) => Math.abs(x - med)));
}

export const clip = (x: number, lo = -3, hi = 3) => Math.max(lo, Math.min(hi, x));

export interface Prior {
  median: number;
  scale: number;
}

/**
 * Robust z-score of `x` against its own history (median/MAD), clipped to ±3.
 * With too little history the prior stands in; `mature` says which was used.
 */
export function robustZ(x: number, history: number[], prior: Prior, minHistory = 48): { z: number; mature: boolean } {
  const h = history.filter(Number.isFinite);
  if (h.length >= minHistory) {
    const med = median(h);
    const s = mad(h, med);
    if (s > 1e-9) return { z: clip((x - med) / s), mature: true };
  }
  return { z: clip((x - prior.median) / prior.scale), mature: false };
}

/** −100…100 from a combined z (Z = ±2 ≈ ±76). */
export const toScore = (z: number) => Math.round(1000 * 100 * Math.tanh(z / 2)) / 1000;

/** Exponential smoothing with a half-life in hours. */
export function smooth(prev: number | undefined, next: number, hoursSincePrev: number, halfLifeH = 6): number {
  if (prev === undefined || !Number.isFinite(prev) || hoursSincePrev > 3) return next;
  const alpha = 1 - 2 ** (-hoursSincePrev / halfLifeH);
  return prev + alpha * (next - prev);
}

/** Rolling percentage change over `lag` steps of an evenly spaced series. */
export function rollingChange(series: number[], lag: number): number[] {
  const out: number[] = [];
  for (let i = lag; i < series.length; i++) if (series[i - lag]) out.push((series[i] / series[i - lag] - 1) * 100);
  return out;
}

/** Rolling standard deviation (in %) of log returns over `window` steps. */
export function rollingVol(series: number[], window: number): number[] {
  const r: number[] = [];
  for (let i = 1; i < series.length; i++) if (series[i - 1] > 0 && series[i] > 0) r.push(Math.log(series[i] / series[i - 1]) * 100);
  const out: number[] = [];
  for (let i = window; i <= r.length; i++) {
    const w = r.slice(i - window, i);
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    out.push(Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length));
  }
  return out;
}
