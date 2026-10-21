import { z } from "zod";
import { kstParts, kstYmd, parseKstDate } from "../../text";
import { ConfigError, defineAdapter, type IngestItem } from "../../types";

/** Report names that usually move a stock — matched against report_nm. */
const DEFAULT_INCLUDE = [
  "주요사항보고서",
  "유상증자",
  "무상증자",
  "감자",
  "합병",
  "분할",
  "영업양수",
  "영업양도",
  "자기주식",
  "전환사채",
  "신주인수권부사채",
  "교환사채",
  "최대주주변경",
  "회생절차",
  "파산",
  "횡령",
  "배임",
  "상장폐지",
  "매매거래정지",
  "불성실공시",
  "영업(잠정)실적",
  "잠정실적",
  "단일판매ㆍ공급계약",
  "공개매수",
  "투자판단관련주요경영사항",
];

const HIGH = /회생|파산|횡령|배임|상장폐지|매매거래정지|최대주주변경|합병|공개매수|유상증자|감자/;
const MID = /잠정|실적|공급계약|자기주식|전환사채|분할|영업양/;

const config = z.object({
  /** report_nm substrings to keep; empty = everything (≈2,000 filings a day) */
  include: z.array(z.string().min(1)).max(80).default(DEFAULT_INCLUDE),
  exclude: z.array(z.string().min(1)).max(40).default([]),
  /** Y 유가증권 · K 코스닥 · N 코넥스 · E 기타 */
  corpCls: z.array(z.enum(["Y", "K", "N", "E"])).default(["Y", "K"]),
  maxPages: z.number().int().min(1).max(10).default(3),
});

interface DartRow {
  corp_code: string;
  corp_name: string;
  stock_code?: string;
  corp_cls: "Y" | "K" | "N" | "E";
  report_nm: string;
  rcept_no: string;
  flr_nm: string;
  rcept_dt: string;
  rm?: string;
}

const CLS = { Y: "유가증권", K: "코스닥", N: "코넥스", E: "기타" } as const;
const RM: Record<string, string> = { 유: "유가증권시장본부 소관", 코: "코스닥시장본부 소관", 채: "채권상장법인", 넥: "코넥스시장 소관", 공: "공정위 공시", 연: "연결재무제표", 정: "정정 후 제출", 철: "철회" };

/**
 * OpenDART 공시검색 (list.json): today's filings, newest first. Polls fast on
 * weekday business hours and slowly otherwise. Source: 금융감독원 DART.
 */
export const dartAdapter = defineAdapter({
  key: "dart.list",
  label: "OpenDART 공시",
  description: "금융감독원 OpenDART 공시검색. 보고서명 키워드로 주요 공시만 고르고(유상증자·합병·잠정실적 등), 평일 07–20시엔 1분, 그 외엔 15분 주기로 확인합니다.",
  kind: "api",
  group: "official",
  configSchema: config,
  configExample: { include: DEFAULT_INCLUDE.slice(0, 6), exclude: [], corpCls: ["Y", "K"], maxPages: 3 },
  envVars: [{ name: "DART_API_KEY", required: true, help: "opendart.fss.or.kr에서 발급한 인증키(40자)" }],
  defaultPollSec: 60,
  async run(ctx) {
    const c = ctx.config;
    const key = ctx.secret("DART_API_KEY")!;
    const today = kstYmd(ctx.now);
    const seen = new Set<string>(((ctx.state.seen as string[] | undefined) ?? []).filter((id) => id.slice(0, 8) >= kstYmd(new Date(ctx.now.getTime() - 3 * 86_400_000))));
    const items: IngestItem[] = [];
    let total = 0;

    for (let page = 1; page <= c.maxPages; page++) {
      const params = new URLSearchParams({ crtfc_key: key, bgn_de: today, end_de: today, page_no: String(page), page_count: "100", sort: "date", sort_mth: "desc" });
      const data = await ctx.http.json<{ status: string; message: string; total_page?: number; list?: DartRow[] }>(`https://opendart.fss.or.kr/api/list.json?${params}`, { timeoutMs: 20_000 });
      if (data.status === "013") break; // no filings yet today
      if (data.status === "010" || data.status === "011" || data.status === "012") throw new ConfigError(`DART 인증키 오류(${data.status}): ${data.message}`);
      if (data.status !== "000") throw new Error(`DART ${data.status}: ${data.message}`);
      const rows = data.list ?? [];
      total += rows.length;
      let fresh = 0;
      for (const r of rows) {
        if (seen.has(r.rcept_no)) continue;
        seen.add(r.rcept_no);
        fresh++;
        if (!c.corpCls.includes(r.corp_cls)) continue;
        const name = r.report_nm.replace(/\s+/g, " ").trim();
        if (c.include.length && !c.include.some((w) => name.includes(w))) continue;
        if (c.exclude.some((w) => name.includes(w))) continue;
        const notes = (r.rm ?? "").split("").map((ch) => RM[ch]).filter(Boolean);
        items.push({
          externalId: r.rcept_no,
          url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.rcept_no}`,
          title: `${r.corp_name} — ${name}`,
          summary: [`${CLS[r.corp_cls] ?? r.corp_cls}${r.stock_code ? ` ${r.stock_code}` : ""}`, `제출인 ${r.flr_nm}`, ...notes].join(" · "),
          // list.json has no time of day: date only (KST), now when it is today's filing
          publishedAt: r.rcept_dt === today ? ctx.now : (parseKstDate(r.rcept_dt) ?? null),
          entities: [r.corp_name, ...(r.stock_code ? [r.stock_code] : [])],
          beatGuess: "economy",
          weight: HIGH.test(name) ? 0.95 : MID.test(name) ? 0.7 : 0.45,
          payload: { corpCode: r.corp_code, stockCode: r.stock_code || null, corpCls: r.corp_cls, report: name, filer: r.flr_nm, rm: r.rm || null, source: "금융감독원 DART" },
        });
      }
      // stop paging once a page holds filings we already know
      if (fresh < rows.length || page >= (data.total_page ?? 1)) break;
    }

    const k = kstParts(ctx.now);
    const busy = k.dow >= 1 && k.dow <= 5 && k.h >= 7 && k.h < 20;
    return {
      items,
      state: { seen: [...seen].slice(-4000) },
      nextRunInSec: busy ? ctx.source.pollIntervalSec : 900,
      note: `${items.length} kept / ${total} listed`,
    };
  },
});
