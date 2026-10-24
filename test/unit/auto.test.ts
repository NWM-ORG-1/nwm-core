import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { draftSchema, type Draft } from "@/lib/content/blocks";
import { josa, named, particle } from "@/lib/josa";
import { AUTO_LEGAL_NOTE } from "@/server/auto/create";
import { referenceClose } from "@/server/auto/run";
import { AUTO_DEFAULTS, dailySlot, mergeAutoSettings } from "@/server/auto/settings";
import { blockingFailures, draftHash, runChecks } from "@/server/checks";
import { buildCryptoMove, buildDataDraft, buildExchangeEvent, fearGreedBand, hhmmKST, type MarketInputs } from "@/server/generator/data-templates";

const text = (d: Draft) => JSON.stringify(d);

/** Published articles must carry a title, a dek and blocks, all within the schema limits. */
function assertPublishable(d: Draft | null): asserts d is Draft {
  assert.ok(d, "draft built");
  const r = draftSchema.safeParse(d);
  assert.ok(r.success, r.success ? "" : JSON.stringify(r.error.issues));
  assert.ok(d.title.trim() && d.dek.trim() && d.blocks.length > 0);
  assert.ok(d.sources.length > 0, "data articles name their source");
}

describe("josa", () => {
  it("agrees with the last sound of Hangul, digits and Latin letters", () => {
    assert.equal(josa("비트코인", "이/가"), "비트코인이");
    assert.equal(josa("솔라나", "이/가"), "솔라나가");
    assert.equal(josa("업비트", "이/가"), "업비트가");
    assert.equal(josa("빗썸", "이/가"), "빗썸이");
    assert.equal(josa("이더리움", "은/는"), "이더리움은");
    assert.equal(josa("솔라나", "을/를"), "솔라나를");
    assert.equal(particle("63", "으로/로"), "으로");
    assert.equal(particle("62", "으로/로"), "로");
    assert.equal(particle("서울", "으로/로"), "로");
    assert.equal(particle("부산", "으로/로"), "으로");
    assert.equal(particle("SOL", "이/가"), "이");
    assert.equal(particle("XRP", "이/가"), "가");
    assert.equal(particle("", "이/가"), "이(가)");
  });

  it("puts the particle after the ticker but agrees with the name", () => {
    assert.equal(named("솔라나", "SOL", "을/를"), "솔라나(SOL)를");
    assert.equal(named("비트코인", "BTC", "이/가"), "비트코인(BTC)이");
    assert.equal(named("SOL", "SOL"), "SOL");
  });
});

describe("auto settings", () => {
  it("is due from its KST time for two hours", () => {
    // 08:30 KST = 23:30 UTC the day before
    assert.deepEqual(
      { ...dailySlot(new Date("2026-10-22T00:00:00Z"), "08:30"), at: undefined },
      { due: true, ymd: "20261022", at: undefined },
    );
    assert.equal(dailySlot(new Date("2026-10-21T23:00:00Z"), "08:30").due, false, "08:00 KST is early");
    assert.equal(dailySlot(new Date("2026-10-22T01:31:00Z"), "08:30").due, false, "3 hours late is stale");
    assert.equal(dailySlot(new Date("2026-10-22T00:00:00Z"), "08:30").at.toISOString(), "2026-10-21T23:30:00.000Z");
  });

  it("keeps defaults for missing or malformed stored values", () => {
    const s = mergeAutoSettings({ crypto_daily: { mode: "auto", time: "07:15" }, crypto_move: { mode: "sometimes", threshold: 99 }, nope: { mode: "auto" } });
    assert.deepEqual(s.crypto_daily, { mode: "auto", time: "07:15" });
    assert.deepEqual(s.crypto_move, AUTO_DEFAULTS.crypto_move);
    assert.deepEqual(mergeAutoSettings(null), AUTO_DEFAULTS);
  });
});

const market: MarketInputs = {
  quotes: [
    { symbol: "BTC", name: "비트코인", price: 84618.2, changePct: 2.498, currency: "USD" },
    { symbol: "ETH", name: "이더리움", price: 2512.07, changePct: 2.977, currency: "USD" },
    { symbol: "SOL", name: "솔라나", price: 108.86, changePct: 2.688, currency: "USD" },
    { symbol: "XRP", name: "리플", price: 1.394, changePct: 5.375, currency: "USD" },
    { symbol: "KRW-BTC", name: "비트코인 원화", price: 112357000, changePct: 1.794, currency: "KRW" },
  ],
  metrics: {
    kimchi: { value: 0.274, at: new Date("2026-10-21T18:50:00Z"), source: "derived" },
    funding: { value: 0.01, at: new Date("2026-10-21T18:00:00Z"), source: "bybit" },
    longShort: { value: 1.12, at: new Date("2026-10-21T18:00:00Z"), source: "bybit" },
    fearGreed: { value: 63, at: new Date("2026-10-21T00:00:00Z"), dayAgo: 58, source: "alternative.me" },
  },
  hourly: { BTC: Array.from({ length: 24 }, (_, i) => 82000 + i * 100) },
};

describe("crypto daily", () => {
  it("states prices, premium, fear & greed and derivatives from data only", () => {
    const d = buildDataDraft("crypto_daily", { quotes: market.quotes, sentiment: [], dateLabel: "10월 22일", market });
    assertPublishable(d);
    assert.equal(d.title, "비트코인 ▲2.50%, 리플 ▲5.38%");
    assert.equal(d.dek, "비트코인은 84,618달러로 24시간 전보다 2.50% 올랐다. 업비트 원화 가격은 112,357,000원이다.");
    const why = d.blocks.find((b) => b.type === "why");
    assert.deepEqual(why && why.type === "why" && why.items, [
      "24시간 기준 변동폭이 가장 큰 자산은 리플(▲5.38%)이다.",
      "업비트 비트코인 가격은 해외 시세를 원/달러 환율로 환산한 값보다 0.27% 높다(김치 프리미엄).",
      "코인 공포·탐욕 지수는 63(탐욕)으로, 하루 전 58보다 5 올랐다.",
    ]);
    assert.ok(d.blocks.some((b) => b.type === "chart" && b.points.length === 24));
    assert.match(text(d), /바이비트 BTC 무기한 선물 펀딩비 0\.0100%/);
    assert.match(text(d), /비트코인 \(업비트\)/);
  });

  it("does without the optional metrics", () => {
    const d = buildDataDraft("crypto_daily", { quotes: market.quotes.slice(0, 2), sentiment: [], dateLabel: "10월 22일", market: { quotes: market.quotes.slice(0, 2), metrics: {}, hourly: {} } });
    assertPublishable(d);
    assert.equal(d.title, "비트코인 ▲2.50%, 이더리움 ▲2.98%");
    assert.ok(!d.blocks.some((b) => b.type === "chart" || b.type === "section"));
  });

  it("needs at least two coins", () => {
    assert.equal(buildDataDraft("crypto_daily", { quotes: market.quotes.slice(0, 1), sentiment: [], dateLabel: "", market: { ...market, quotes: market.quotes.slice(0, 1) } }), null);
  });
});

describe("sharp moves", () => {
  it("picks the close that ended about an hour ago", () => {
    const now = new Date("2026-10-22T03:37:00Z");
    const closes = [1, 2, 3].map((h) => ({ end: new Date(`2026-10-22T0${h}:00:00Z`), value: h }));
    assert.equal(referenceClose(closes, now)?.value, 2, "03:00 ended 37 min ago — too recent; 02:00 ended 97 min ago");
    assert.equal(referenceClose(closes, new Date("2026-10-22T03:41:00Z"))?.value, 3);
    assert.equal(referenceClose([], now), undefined);
  });

  it("writes the move with the exact reference time", () => {
    const d = buildCryptoMove({
      symbol: "BTC",
      name: "비트코인",
      price: 81000,
      asOf: new Date("2026-10-22T03:37:00Z"),
      refPrice: 84000,
      refAt: new Date("2026-10-22T02:00:00Z"),
      change24h: -4.1,
      hourly: Array.from({ length: 24 }, (_, i) => 84500 - i * 10),
      krwPrice: 108000000,
      kimchi: -0.5,
      fearGreed: 22,
    });
    assertPublishable(d);
    assert.equal(d.title, "비트코인 1시간 새 3.57% 하락, 81,000달러");
    assert.equal(d.dek, "비트코인은 12:37 기준 81,000달러로 11:00 종가(84,000달러)보다 3.57% 내렸다. 24시간 기준으로는 ▼4.10%.");
    assert.equal(d.isBreaking, true);
    assert.match(text(d), /공포·탐욕 지수 22 \(극단적 공포\)/);
    assert.equal(fearGreedBand(50), "중립");
    assert.equal(hhmmKST(new Date("2026-10-21T15:05:00Z")), "00:05");
  });
});

describe("exchange events", () => {
  const at = new Date("2026-10-22T01:02:00Z");

  it("one listing, with the other exchange checked", () => {
    const d = buildExchangeEvent({
      exchange: "upbit",
      change: "listed",
      markets: [{ market: "KRW-SOL", coin: "SOL", quote: "KRW", name: "솔라나" }],
      at,
      listedOn: { bithumb: new Set(["KRW-SOL"]) },
    });
    assertPublishable(d);
    assert.equal(d.title, "업비트, 솔라나(SOL) 원화 마켓 거래지원");
    assert.equal(d.dek, "업비트가 원화 마켓에 솔라나(SOL)를 추가했다.");
    assert.doesNotMatch(text(d), /\d{1,2}:\d{2}/, "no detection clock time in the copy");
    assert.match(text(d), /빗썸에서는 솔라나\(SOL\) 원화 마켓이 거래 중이다/);
    assert.deepEqual(d.tickers, ["SOL"]);
  });

  it("one coin in several markets is one article", () => {
    const d = buildExchangeEvent({
      exchange: "upbit",
      change: "listed",
      markets: ["KRW", "BTC", "USDT"].map((q) => ({ market: `${q}-NEWC`, coin: "NEWC", quote: q, name: "뉴코인" })),
      at,
    });
    assertPublishable(d);
    assert.equal(d.title, "업비트, 뉴코인(NEWC) 원화·BTC·USDT 마켓 거래지원");
    assert.equal(d.dek, "업비트가 원화·BTC·USDT 마켓에 뉴코인(NEWC)을 추가했다.");
  });

  it("several warnings at once, with particles that fit", () => {
    const d = buildExchangeEvent({
      exchange: "bithumb",
      change: "warning",
      markets: [
        { market: "KRW-AAA", coin: "AAA", quote: "KRW", name: "에이코인" },
        { market: "KRW-BBB", coin: "BBB", quote: "KRW", name: "비코인" },
      ],
      at,
      listedOn: { upbit: new Set(["KRW-AAA"]) },
    });
    assertPublishable(d);
    assert.equal(d.title, "빗썸, 2종 유의 종목 지정… 에이코인·비코인");
    assert.equal(d.dek, "빗썸이 에이코인(AAA), 비코인(BBB) 2개 종목을 유의 종목으로 지정했다.");
    assert.match(text(d), /업비트 원화 마켓에는 비코인\(BBB\)이 없다/);
  });

  it("single designation and lifting", () => {
    const one = (change: "warning" | "warning_lifted" | "delisted") =>
      buildExchangeEvent({ exchange: "upbit", change, markets: [{ market: "KRW-SOL", coin: "SOL", quote: "KRW", name: "솔라나" }], at });
    assert.equal(one("warning")!.dek, "업비트가 솔라나(SOL)를 유의 종목으로 지정했다.");
    assert.equal(one("warning_lifted")!.dek, "업비트가 솔라나(SOL)의 유의 종목 지정을 해제했다.");
    assert.equal(one("warning_lifted")!.isBreaking, false);
    assert.equal(one("delisted")!.title, "업비트, 솔라나(SOL) 원화 마켓 거래지원 종료");
    assert.equal(one("delisted")!.dek, "업비트 원화 마켓에서 솔라나(SOL)의 거래지원이 종료됐다.");
  });
});

describe("auto publishing checks", () => {
  it("a template draft with the auto stamp passes every blocking check", () => {
    const draft = buildDataDraft("crypto_daily", { quotes: market.quotes, sentiment: [], dateLabel: "10월 22일", market })!;
    const stamp = [{ id: "legal" as const, ok: true, blocking: true, message: AUTO_LEGAL_NOTE, draftHash: draftHash(draft) }];
    const checks = runChecks({ draft, mode: "data_auto", items: [], recentTitles: [], previous: stamp, editorName: null });
    assert.deepEqual(blockingFailures(checks), []);
  });

  it("an edited draft needs the legal check again", () => {
    const draft = buildDataDraft("crypto_daily", { quotes: market.quotes, sentiment: [], dateLabel: "10월 22일", market })!;
    const stamp = [{ id: "legal" as const, ok: true, blocking: true, message: AUTO_LEGAL_NOTE, draftHash: draftHash(draft) }];
    const edited = { ...draft, title: `${draft.title} (수정)` };
    const checks = runChecks({ draft: edited, mode: "data_auto", items: [], recentTitles: [], previous: stamp, editorName: null });
    assert.deepEqual(
      blockingFailures(checks).map((c) => c.id),
      ["legal"],
    );
  });
});
