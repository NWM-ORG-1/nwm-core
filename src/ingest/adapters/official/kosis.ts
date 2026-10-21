import { z } from "zod";
import { ConfigError, defineAdapter, type IngestItem, type MetricIn } from "../../types";
import { fmtCycle } from "./ecos";

const config = z.object({
  queries: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        /** statisticsParameterData parameters from KOSIS "URL 생성" (without apiKey/format) */
        params: z.record(z.string(), z.string().max(200)),
        metric: z.string().max(60).optional(),
        announce: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(20),
});

interface KosisRow {
  TBL_NM?: string;
  PRD_DE: string;
  DT: string;
  UNIT_NM?: string;
  ITM_NM?: string;
  C1_NM?: string;
}

/**
 * 국가데이터처 KOSIS (statisticsParameterData). Each query is the parameter set
 * KOSIS generates for a table; new periods become inbox items and every value a
 * metric. Commercial use allowed with attribution; no resale of raw data.
 */
export const kosisAdapter = defineAdapter({
  key: "kosis.series",
  label: "KOSIS 국가통계",
  description: "KOSIS 통계표 질의(‘URL 생성’ 결과의 파라미터)를 지정해 CPI·고용 등 새 시점을 속보 후보로 만들고 값은 지표로 저장합니다.",
  kind: "api",
  group: "official",
  configSchema: config,
  configExample: {
    queries: [
      {
        name: "소비자물가지수(총지수)",
        params: { method: "getList", orgId: "101", tblId: "DT_1J22003", itmId: "T", objL1: "T10", prdSe: "M", newEstPrdCnt: "13" },
        metric: "kr_cpi",
        announce: true,
      },
    ],
  },
  envVars: [{ name: "KOSIS_API_KEY", required: true, help: "kosis.kr 공유서비스 인증키" }],
  defaultPollSec: 3600,
  async run(ctx) {
    const key = ctx.secret("KOSIS_API_KEY")!;
    const last = { ...((ctx.state.last ?? {}) as Record<string, string>) };
    const items: IngestItem[] = [];
    const metrics: MetricIn[] = [];
    for (const q of ctx.config.queries) {
      const params = new URLSearchParams({ method: "getList", ...q.params, apiKey: key, format: "json", jsonVD: "Y" });
      const data = await ctx.http.json<KosisRow[] | { err?: string; errMsg?: string }>(
        `https://kosis.kr/openapi/Param/statisticsParameterData.do?${params}`,
        { timeoutMs: 25_000 },
      );
      if (!Array.isArray(data)) {
        const msg = `${data.err ?? "?"} ${data.errMsg ?? ""}`.trim();
        if (data.err === "30") continue; // 데이터 없음
        if (data.err === "11" || data.err === "10") throw new ConfigError(`KOSIS 인증키 오류: ${msg}`);
        throw new Error(`KOSIS ${q.name}: ${msg}`);
      }
      const rows = data.filter((r) => r.DT !== "" && Number.isFinite(Number(r.DT))).sort((a, b) => a.PRD_DE.localeCompare(b.PRD_DE));
      if (!rows.length) continue;
      const id = q.name;
      for (const r of rows) {
        const at = /^\d{6}$/.test(r.PRD_DE) ? new Date(`${r.PRD_DE.slice(0, 4)}-${r.PRD_DE.slice(4, 6)}-01T00:00:00+09:00`) : undefined;
        if (at) metrics.push({ metric: q.metric ?? `kosis:${q.params.tblId ?? id}`, symbol: "KR", source: "kosis", at, value: Number(r.DT) });
      }
      const latest = rows[rows.length - 1];
      const before = rows.length > 1 ? rows[rows.length - 2] : undefined;
      if (q.announce && last[id] && last[id] !== latest.PRD_DE) {
        const yoyBase = rows.find((r) => r.PRD_DE === `${Number(latest.PRD_DE.slice(0, 4)) - 1}${latest.PRD_DE.slice(4)}`);
        const yoy = yoyBase ? ((Number(latest.DT) / Number(yoyBase.DT) - 1) * 100).toFixed(1) : null;
        items.push({
          externalId: `${id}:${latest.PRD_DE}`,
          url: "https://kosis.kr/",
          title: `${q.name} ${fmtCycle(latest.PRD_DE)}: ${latest.DT}${latest.UNIT_NM ? ` ${latest.UNIT_NM}` : ""}${yoy ? ` (전년동월비 ${Number(yoy) > 0 ? "+" : ""}${yoy}%)` : ""}`,
          summary: `${latest.TBL_NM ?? ""} · 직전 ${before ? `${fmtCycle(before.PRD_DE)} ${before.DT}` : "없음"} · 출처 국가데이터처 KOSIS`,
          beatGuess: "economy",
          weight: 0.8,
          payload: { table: q.params.tblId, period: latest.PRD_DE, value: latest.DT, unit: latest.UNIT_NM, yoy },
        });
      }
      last[id] = latest.PRD_DE;
    }
    return { items, metrics, state: { last }, note: `${metrics.length} points, ${items.length} new periods` };
  },
});
