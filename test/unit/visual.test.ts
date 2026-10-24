import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseChannelPage } from "@/ingest/adapters/social/telegram";
import { claimRows, claimTable, materialFromRead, photosOf, price, priceHistory, redrawChart, wantsPostRead, type Candle, type PostRead } from "@/server/generator/visual";
import type { GenItem } from "@/server/generator/types";
import { monthlyKlines } from "../fixtures/market";
import { PHOTO_PAGE } from "../fixtures/telegram-pages";

/* fixtures — made-up prices for a made-up run of months, and a fictional channel */

const candles = (n = 82): Candle[] => monthlyKlines(undefined, n).map((k) => ({ t: new Date(k[0]).toISOString().slice(0, 7), close: Number(k[4]) }));

const read = (over: Partial<PostRead> = {}): PostRead => ({
  kind: "price_chart",
  description: "비트코인 월봉 차트에 화살표 네 개가 그려져 있다",
  asset: "BTC",
  interval: "1M",
  from: "2020-01",
  marks: [
    { at: "2020-11", label: "가상버거 재출시" },
    { at: "2023-10", label: "가상버거 재출시" },
    { at: "2026-10", label: "가상버거 재출시" },
  ],
  claim: "가상버거가 다시 나올 때마다 비트코인이 두 배 넘게 올랐다는 주장",
  checkable: true,
  ...over,
});

const post: GenItem = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "가상버거가 돌아온다",
  summary: "가상버거가 다시 판매된다. 돌아올 때마다 BTC가 두 배 넘게 올랐다.",
  sourceName: "가상코인속보",
  sourceKind: "scrape",
  trustTier: 2,
  signalOnly: true,
  lang: "ko",
  entities: [],
  payload: { images: ["https://cdn4.telesco.pe/file/abc.jpg"] },
  url: "https://t.me/Itest_Flash_One/103",
  publishedAt: new Date("2026-10-24T03:00:00Z"),
  social: true,
};

describe("post photos", () => {
  it("Telegram photo tiles become image URLs on the message (Telegram's CDN only)", () => {
    const [m] = parseChannelPage(PHOTO_PAGE, "Itest_Flash_One").messages;
    assert.deepEqual(m.images, ["https://cdn4.telesco.pe/file/itest-chart.jpg"]);
    assert.deepEqual(photosOf({ images: ["https://cdn4.telesco.pe/file/a.jpg", "http://insecure/x.jpg", 3] }), ["https://cdn4.telesco.pe/file/a.jpg"]);
  });

  it("reads a post first when the story stands on channel posts, or one of them has photos — never another outlet's article", () => {
    assert.equal(wantsPostRead([post], true), true);
    assert.equal(wantsPostRead([{ ...post, payload: {} }], false), true, "channel posts alone");
    const official = { ...post, social: false, signalOnly: false, trustTier: 1, payload: {} };
    assert.equal(wantsPostRead([official, post], true), true, "a post with photos next to an official source");
    assert.equal(wantsPostRead([official, post], false), false, "photos off");
    assert.equal(wantsPostRead([{ ...post, social: false }], true), false, "another outlet's article, signal-only");
  });
});

describe("our chart instead of the picture", () => {
  it("draws the asset from market data with the post's moments marked", () => {
    const chart = redrawChart(read(), "BTC", "1M", candles())!;
    assert.equal(chart.title, "비트코인 월봉 종가 (달러)");
    assert.equal(chart.points.length, 82);
    assert.equal(chart.labels?.[0], "2020-01");
    assert.equal(chart.labels?.[81], "2026-10");
    assert.deepEqual(chart.marks, [
      { i: 10, label: "가상버거 재출시" },
      { i: 45, label: "가상버거 재출시" },
      { i: 81, label: "가상버거 재출시" },
    ]);
    assert.equal(chart.scale, "log", "a long run that grows many times over");
    assert.equal(chart.source, "바이낸스 BTC/USDT, NWM 재구성");
  });

  it("checks the claim with our numbers: 6 and 12 months later, the best close within a year", () => {
    const rows = claimRows(read(), candles());
    assert.equal(rows.length, 3);
    // +10 % a month: 6 months ≈ +77.2 %, 12 months ≈ +213.8 %
    const t = claimTable("BTC", rows)!;
    assert.equal(t.block.caption, "‘가상버거 재출시’ 이후 비트코인 수익률 (바이낸스 BTC/USDT 월봉 종가)");
    assert.deepEqual(t.block.columns, ["표시 시점", "당시 종가", "6개월 뒤", "12개월 뒤", "1년 안 최고"]);
    assert.deepEqual(t.block.rows[0], ["2020-11", price(100 * 1.1 ** 10), "+77.2%", "+213.8%", "+213.8%"]);
    assert.deepEqual(t.block.rows[2], ["2026-10", price(100 * 1.1 ** 81), "—", "—", "—"], "the month still running");
    assert.deepEqual(t.doubled, { checked: 2, peak: 2, close12: 2 });
    assert.match(t.text, /2020-11\(가상버거 재출시\) 종가 259달러, 6개월 뒤 459달러\(\+77\.2%\), 12개월 뒤 814달러\(\+213\.8%\)/);
    assert.match(t.text, /2026-10\(가상버거 재출시\) 종가 [\d,]+달러, 이후 기록 없음\(진행 중\)/);
    assert.match(t.text, /12개월 기록이 있는 2번 가운데 12개월 안에 한 번이라도 2배 이상 오른 경우 2번/);
  });

  it("prints prices the way the table does", () => {
    assert.equal(price(81278.65), "81,279달러");
    assert.equal(price(0.123456), "0.1235달러");
  });
});

describe("material for the draft", () => {
  const klinesFetch: typeof fetch = async (input) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    assert.equal(url.host, "data-api.binance.vision");
    if (url.searchParams.get("symbol") !== "BTCUSDT") return new Response('{"code":-1121,"msg":"Invalid symbol."}', { status: 400 });
    const start = Number(url.searchParams.get("startTime") ?? 0);
    return Response.json(monthlyKlines().filter((k) => k[0] >= start));
  };

  it("turns the read into a claim in our words, our chart, the table and the numbers behind it", async () => {
    const m = await materialFromRead(read(), post, 1, klinesFetch, new Date("2026-10-24T03:00:00Z"));
    assert.equal(m.factCheck, true);
    assert.deepEqual(m.blocks.map((b) => b.type), ["chart", "table"]);
    const [claim, data] = m.items;
    assert.equal(claim.title, "SNS 게시물의 주장 (NWM 요약)");
    assert.equal(claim.trustTier, 3, "a claim is never more than a claim");
    assert.equal(claim.signalOnly, false);
    assert.equal(claim.url, post.url);
    assert.match(claim.summary, /게시물이 짚은 시점: 2020-11\(가상버거 재출시\), 2023-10/);
    assert.equal(data.sourceName, "바이낸스 BTC/USDT 시세 (NWM 계산)");
    assert.equal(data.trustTier, 1);
    assert.equal(data.payload.derived, "price-check");
    assert.ok(m.notes.some((n) => n === "게시물 사진(남이 만든 차트)은 기사에 넣지 않았습니다"));
    assert.ok(m.notes.some((n) => /실제 날짜를 확인하세요/.test(n)));
  });

  it("stays with the claim when the asset is not on Binance, and never invents a chart", async () => {
    const m = await materialFromRead(read({ asset: "NOTACOIN" }), post, 1, klinesFetch);
    assert.deepEqual(m.blocks, []);
    assert.equal(m.factCheck, false);
    assert.equal(m.items.length, 1);
    assert.ok(m.notes.some((n) => /NOTACOIN 시세를 바이낸스에서 찾지 못해/.test(n)));
    const photo = await materialFromRead(read({ kind: "meme", asset: "", checkable: false, description: "고양이 사진" }), post, 1, klinesFetch);
    assert.deepEqual(photo.blocks, []);
    assert.ok(photo.notes.includes("게시물 사진은 기사에 넣지 않았습니다 (고양이 사진)"));
  });

  it("asks Binance from the first marked month", async () => {
    let asked = "";
    await priceHistory("BTC", "1M", "2020-11", async (u) => ((asked = String(u)), Response.json([])));
    assert.match(asked, /symbol=BTCUSDT&interval=1M&limit=160&startTime=1604188800000$/);
    assert.equal(await priceHistory("btc!", "1M", null, klinesFetch), null);
  });
});
