import { z } from "zod";
import { parseFeed } from "../../feed";
import { defineAdapter, type IngestItem } from "../../types";

const config = z.object({
  forms: z.array(z.string().regex(/^[A-Z0-9/-]{1,12}$/)).min(1).max(8).default(["8-K", "6-K", "S-1"]),
  /** company-name substrings to keep (case-insensitive); empty = every filer */
  watch: z.array(z.string().min(2)).max(200).default([]),
  /** forms kept for every filer even when a watch list is set (IPOs) */
  allFilersForms: z.array(z.string()).max(8).default(["S-1"]),
  count: z.number().int().min(10).max(100).default(100),
});

/** 8-K items that usually make news, with how much attention they deserve. */
const ITEM_WEIGHT: Record<string, number> = {
  "1.01": 0.6,
  "1.02": 0.5,
  "1.03": 0.95,
  "1.05": 0.9,
  "2.01": 0.7,
  "2.02": 0.7,
  "2.05": 0.6,
  "2.06": 0.6,
  "3.01": 0.8,
  "4.02": 0.85,
  "5.01": 0.8,
  "5.02": 0.6,
  "7.01": 0.4,
  "8.01": 0.4,
};

/**
 * SEC EDGAR "latest filings" Atom feed per form type. Public domain; SEC asks
 * for ≤10 requests/s and a User-Agent with contact details (FEED_CONTACT_EMAIL).
 */
export const secAdapter = defineAdapter({
  key: "sec.edgar",
  label: "SEC EDGAR 최신 공시",
  description: "미국 공시(8-K·6-K·S-1 등) 실시간 피드. 관심 기업 목록(watch)으로 거르고, 8-K 항목(실적·파산·경영진 변동 등)에 따라 점수를 매깁니다.",
  kind: "rss",
  group: "official",
  configSchema: config,
  configExample: { forms: ["8-K", "6-K", "S-1"], watch: ["NVIDIA", "MICROSOFT", "COINBASE"], allFilersForms: ["S-1"], count: 100 },
  envVars: [{ name: "FEED_CONTACT_EMAIL", required: false, help: "SEC가 요구하는 User-Agent 연락처(이메일). 비우면 사이트 URL만 보냅니다." }],
  defaultPollSec: 120,
  async run(ctx) {
    const c = ctx.config;
    const watch = c.watch.map((w) => w.toLowerCase());
    const items: IngestItem[] = [];
    let total = 0;
    for (const form of c.forms) {
      const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${encodeURIComponent(form)}&company=&dateb=&owner=include&start=0&count=${c.count}&output=atom`;
      const res = await ctx.http.request(url, { timeoutMs: 30_000 });
      const feed = parseFeed(res.text, url);
      total += feed.entries.length;
      for (const e of feed.entries) {
        const m = /^(\S+)\s+-\s+(.+?)\s+\((\d{6,10})\)\s+\((\w+)\)\s*$/.exec(e.title);
        const filedForm = m?.[1] ?? form;
        const company = m?.[2] ?? e.title;
        const cik = m?.[3];
        const role = m?.[4];
        // "(Filer)" rows only — the same filing also appears for reporting persons / subjects
        if (role && role !== "Filer") continue;
        const watched = watch.length === 0 || watch.some((w) => company.toLowerCase().includes(w));
        if (!watched && !c.allFilersForms.includes(filedForm)) continue;
        const accession = /accession-number=([\d-]+)/.exec(e.id)?.[1] ?? e.id;
        const itemCodes = [...e.summary.matchAll(/Item (\d\.\d{2}):\s*([^\n]+)/g)].map((x) => ({ code: x[1], label: x[2].trim() }));
        const weight = Math.max(0.3, ...itemCodes.map((i) => ITEM_WEIGHT[i.code] ?? 0.3)) * (watched && watch.length ? 1 : 0.7);
        items.push({
          externalId: accession,
          url: e.link,
          title: `${filedForm} — ${company}${itemCodes.length ? `: ${itemCodes.map((i) => i.label).join(" · ")}` : ""}`,
          summary: e.summary.replace(/\s*\n\s*/g, " · "),
          lang: "en",
          publishedAt: e.updated ?? e.published ?? null,
          entities: [company, ...(cik ? [`CIK${cik}`] : [])],
          beatGuess: "economy",
          weight: Math.min(1, weight),
          payload: { form: filedForm, company, cik, accession, items: itemCodes },
        });
      }
    }
    return { items, note: `${items.length}/${total} filings` };
  },
});
