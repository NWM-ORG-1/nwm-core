import { z } from "zod";
import { kstParts } from "../../text";
import { ConfigError, defineAdapter, type IngestItem, type MetricIn } from "../../types";

/**
 * 한국은행 ECOS. Two shapes:
 *  - ecos.keystats: the 100 key indicators in one call; a new period → an inbox item
 *  - ecos.series: chosen series with history → metrics (+ an item on each new period)
 * Commercial use is allowed for statistics the Bank of Korea itself compiles;
 * cite "한국은행 ECOS" (other agencies' figures: cite and check their terms).
 */

type EcosResult = { RESULT?: { CODE: string; MESSAGE: string } };

function checkEcos(data: EcosResult) {
  const r = data.RESULT;
  if (!r) return;
  if (r.CODE === "INFO-200") return; // no data
  if (/^INFO-10[0-9]$/.test(r.CODE) || r.CODE === "ERROR-300") throw new ConfigError(`ECOS ${r.CODE}: ${r.MESSAGE}`);
  throw new Error(`ECOS ${r.CODE}: ${r.MESSAGE}`);
}

const keystatsConfig = z.object({
  /** KEYSTAT_NAME substrings to keep; empty = all 100 */
  include: z.array(z.string().min(1)).max(100).default([]),
  exclude: z.array(z.string().min(1)).max(100).default([]),
});

interface KeyStat {
  CLASS_NAME: string;
  KEYSTAT_NAME: string;
  DATA_VALUE: string;
  CYCLE: string;
  UNIT_NAME: string;
}

export const ecosKeyStatsAdapter = defineAdapter({
  key: "ecos.keystats",
  label: "한국은행 100대 통계지표",
  description: "ECOS 100대 지표를 한 번에 받아 기준 시점(CYCLE)이 바뀐 지표만 속보 후보로 만듭니다. 첫 실행은 기준선만 저장합니다.",
  kind: "api",
  group: "official",
  configSchema: keystatsConfig,
  configExample: { include: ["기준금리", "소비자물가", "경상수지", "실업률", "경제성장률"], exclude: [] },
  envVars: [{ name: "ECOS_API_KEY", required: true, help: "ecos.bok.or.kr Open API 인증키 (시험용 'sample'은 10건까지만)" }],
  defaultPollSec: 1800,
  async run(ctx) {
    const c = ctx.config;
    const key = ctx.secret("ECOS_API_KEY")!;
    const data = await ctx.http.json<{ KeyStatisticList?: { row?: KeyStat[] } } & EcosResult>(
      `https://ecos.bok.or.kr/api/KeyStatisticList/${encodeURIComponent(key)}/json/kr/1/100`,
      { timeoutMs: 20_000 },
    );
    checkEcos(data);
    const rows = data.KeyStatisticList?.row ?? [];
    const prev = (ctx.state.cycles ?? null) as Record<string, string> | null;
    const next: Record<string, string> = {};
    const items: IngestItem[] = [];
    for (const r of rows) {
      const name = r.KEYSTAT_NAME.trim();
      if (c.include.length && !c.include.some((w) => name.includes(w))) continue;
      if (c.exclude.some((w) => name.includes(w))) continue;
      next[name] = r.CYCLE;
      if (!prev || prev[name] === r.CYCLE) continue;
      items.push({
        externalId: `${name}:${r.CYCLE}`,
        url: "https://ecos.bok.or.kr/#/StatisticsByTheme/KoreanStat100",
        title: `[100대 지표] ${name} ${fmtCycle(r.CYCLE)}: ${r.DATA_VALUE}${unit(r.UNIT_NAME)}`,
        summary: `${r.CLASS_NAME} · 기준 시점 ${fmtCycle(r.CYCLE)}${prev[name] ? ` (이전 ${fmtCycle(prev[name])})` : ""} · 출처 한국은행 ECOS`,
        beatGuess: "economy",
        weight: /기준금리|소비자물가|경제성장률|경상수지|실업률|수출/.test(name) ? 0.8 : 0.45,
        payload: { stat: name, value: r.DATA_VALUE, unit: r.UNIT_NAME, cycle: r.CYCLE, class: r.CLASS_NAME },
      });
    }
    return { items, state: { cycles: { ...(prev ?? {}), ...next } }, note: prev ? `${items.length} updated of ${Object.keys(next).length}` : `기준선 ${Object.keys(next).length}개 지표` };
  },
});

const seriesConfig = z.object({
  series: z
    .array(
      z.object({
        code: z.string().regex(/^[0-9A-Z]{6,8}$/),
        cycle: z.enum(["D", "M", "Q", "A"]),
        item1: z.string().min(1).max(20),
        item2: z.string().max(20).optional(),
        name: z.string().min(1).max(60),
        /** market_metrics key; default ecos:{code}:{item1} */
        metric: z.string().max(60).optional(),
        /** announce new periods in the inbox */
        announce: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(30),
});

interface SeriesRow {
  TIME: string;
  DATA_VALUE: string;
  UNIT_NAME: string;
}

export const ecosSeriesAdapter = defineAdapter({
  key: "ecos.series",
  label: "한국은행 통계 시계열",
  description: "ECOS 통계표(코드·주기·항목)를 지정해 시계열을 지표로 저장하고, 새 시점이 나오면 속보 후보를 만듭니다.",
  kind: "api",
  group: "official",
  configSchema: seriesConfig,
  configExample: { series: [{ code: "722Y001", cycle: "M", item1: "0101000", name: "한국은행 기준금리", metric: "kr_base_rate", announce: true }] },
  envVars: [{ name: "ECOS_API_KEY", required: true, help: "ecos.bok.or.kr Open API 인증키" }],
  defaultPollSec: 3600,
  async run(ctx) {
    const key = ctx.secret("ECOS_API_KEY")!;
    const last = { ...((ctx.state.last ?? {}) as Record<string, string>) };
    const items: IngestItem[] = [];
    const metrics: MetricIn[] = [];
    for (const s of ctx.config.series) {
      const [start, end] = range(s.cycle, ctx.now);
      const path = [s.code, s.cycle, start, end, s.item1, ...(s.item2 ? [s.item2] : [])].map(encodeURIComponent).join("/");
      const data = await ctx.http.json<{ StatisticSearch?: { row?: SeriesRow[] } } & EcosResult>(
        `https://ecos.bok.or.kr/api/StatisticSearch/${encodeURIComponent(key)}/json/kr/1/400/${path}`,
        { timeoutMs: 20_000 },
      );
      checkEcos(data);
      const rows = (data.StatisticSearch?.row ?? []).filter((r) => r.DATA_VALUE !== "" && Number.isFinite(Number(r.DATA_VALUE)));
      if (!rows.length) continue;
      const id = `${s.code}:${s.item1}${s.item2 ? `:${s.item2}` : ""}`;
      for (const r of rows) {
        const at = periodStart(s.cycle, r.TIME);
        if (at) metrics.push({ metric: s.metric ?? `ecos:${id}`, symbol: "KR", source: "ecos", at, value: Number(r.DATA_VALUE) });
      }
      const latest = rows[rows.length - 1];
      const before = rows.length > 1 ? rows[rows.length - 2] : undefined;
      if (s.announce && last[id] && last[id] !== latest.TIME) {
        const delta = before ? Number(latest.DATA_VALUE) - Number(before.DATA_VALUE) : undefined;
        items.push({
          externalId: `${id}:${latest.TIME}`,
          url: "https://ecos.bok.or.kr/",
          title: `${s.name} ${fmtCycle(latest.TIME)}: ${latest.DATA_VALUE}${unit(latest.UNIT_NAME)}${delta !== undefined ? ` (${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(Math.round(delta * 1000) / 1000)})` : ""}`,
          summary: `ECOS ${s.code} · 직전 ${before ? `${fmtCycle(before.TIME)} ${before.DATA_VALUE}` : "없음"} · 출처 한국은행 ECOS`,
          beatGuess: "economy",
          weight: 0.75,
          payload: { series: id, time: latest.TIME, value: latest.DATA_VALUE, unit: latest.UNIT_NAME },
        });
      }
      last[id] = latest.TIME;
    }
    return { items, metrics, state: { last }, note: `${metrics.length} points, ${items.length} new periods` };
  },
});

function range(cycle: "D" | "M" | "Q" | "A", now: Date): [string, string] {
  const k = kstParts(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (cycle === "D") {
    const from = kstParts(new Date(now.getTime() - 120 * 86_400_000));
    return [`${from.y}${pad(from.mo)}${pad(from.d)}`, `${k.y}${pad(k.mo)}${pad(k.d)}`];
  }
  if (cycle === "M") return [`${k.y - 3}${pad(k.mo)}`, `${k.y}${pad(k.mo)}`];
  if (cycle === "Q") return [`${k.y - 5}Q1`, `${k.y}Q4`];
  return [`${k.y - 15}`, `${k.y}`];
}

function periodStart(cycle: "D" | "M" | "Q" | "A", t: string): Date | undefined {
  let iso: string | undefined;
  if (cycle === "D" && /^\d{8}$/.test(t)) iso = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  else if (cycle === "M" && /^\d{6}$/.test(t)) iso = `${t.slice(0, 4)}-${t.slice(4, 6)}-01`;
  else if (cycle === "Q" && /^\d{4}Q[1-4]$/.test(t)) iso = `${t.slice(0, 4)}-${String((Number(t[5]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  else if (cycle === "A" && /^\d{4}$/.test(t)) iso = `${t}-01-01`;
  return iso ? new Date(`${iso}T00:00:00+09:00`) : undefined;
}

export function fmtCycle(t: string): string {
  if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}.${t.slice(4, 6)}.${t.slice(6, 8)}`;
  if (/^\d{6}$/.test(t)) return `${t.slice(0, 4)}.${t.slice(4, 6)}`;
  if (/^\d{4}Q[1-4]$/.test(t)) return `${t.slice(0, 4)}년 ${t[5]}분기`;
  return t;
}

function unit(u?: string): string {
  const s = (u ?? "").trim();
  return !s ? "" : /^%|^연%$/.test(s) ? "%" : ` ${s}`;
}
