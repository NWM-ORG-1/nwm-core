import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQueries } from "@/ingest/adapters/social/x";
import { validateConfig } from "@/ingest/execute";
import { ConfigError } from "@/ingest/types";
import { NOW, fixture, run, source, type Route } from "../helpers";

const xml = { "content-type": "application/xml; charset=utf-8" };
const html = { "content-type": "text/html; charset=utf-8" };

describe("rss", () => {
  it("keeps recent entries, sends validators next time, and treats 304 as nothing new", async () => {
    const calls: string[] = [];
    const src = source({ adapter: "rss", url: "https://www.boho.or.kr/kr/rss.do?bbsId=B0000133", config: { maxAgeDays: 7 } });
    const first = await run(src, [{ match: /boho/, body: fixture("kisa.rss"), headers: { ...xml, etag: '"v1"' } }], { calls });
    assert.equal(first.result.items!.length, 2);
    assert.equal(first.result.items![0].title, "PHP 제품 보안 업데이트 권고");
    assert.ok((first.state.__http as Record<string, { etag: string }>)[src.url!].etag === '"v1"');

    let sentEtag = "";
    const second = await run({ ...src, state: first.state }, [
      {
        match: /boho/,
        status: 304,
        body: (_u, init) => {
          sentEtag = (init?.headers as Record<string, string>)["if-none-match"];
          return "";
        },
      },
    ]);
    assert.equal(sentEtag, '"v1"');
    assert.equal(second.result.notModified, true);
  });
});

describe("sec.edgar", () => {
  it("parses form, company and items; keeps only watched filers", async () => {
    const r = await run(source({ adapter: "sec.edgar", config: { forms: ["8-K"], watch: ["group 1 automotive"], allFilersForms: [] } }), [
      { match: /sec\.gov/, body: fixture("sec-getcurrent.atom"), headers: xml },
    ]);
    assert.equal(r.result.items!.length, 1);
    const i = r.result.items![0];
    assert.equal(i.externalId, "0001031203-26-000139");
    assert.equal(i.title, "8-K — GROUP 1 AUTOMOTIVE INC: Completion of Acquisition or Disposition of Assets · Financial Statements and Exhibits");
    assert.ok((i.weight ?? 0) >= 0.7);
    assert.deepEqual(i.entities, ["GROUP 1 AUTOMOTIVE INC", "CIK0001031203"]);
  });
});

describe("exchange.markets", () => {
  const list = JSON.parse(fixture("upbit-market-all.json")) as Array<Record<string, unknown>>;
  const src = source({ adapter: "exchange.markets", config: { exchange: "upbit", quotes: ["KRW", "USDT"] } });

  it("first run stores a baseline without items", async () => {
    const r = await run(src, [{ match: /upbit/, body: JSON.stringify(list) }]);
    assert.equal(r.result.items, undefined);
    assert.equal(Object.keys((r.state.markets as object) ?? {}).length, 11);
  });

  it("reports listings, warnings and delistings against the baseline", async () => {
    const base = await run(src, [{ match: /upbit/, body: JSON.stringify(list) }]);
    const next = list
      .filter((m) => m.market !== "KRW-STRAX")
      .map((m) => (m.market === "KRW-GEOD" ? { ...m, market_event: { warning: true, caution: {} } } : m));
    next.push({ market: "KRW-NEWC", korean_name: "뉴코인", english_name: "Newcoin", market_event: { warning: false, caution: {} } });
    const r = await run({ ...src, state: base.state }, [{ match: /upbit/, body: JSON.stringify(next) }]);
    const titles = r.result.items!.map((i) => i.title).sort();
    assert.deepEqual(titles, ["업비트 거래지원 종료: 저트라(STRAX) KRW 마켓", "업비트 신규 거래지원: 뉴코인(NEWC) KRW 마켓", "업비트 유의 종목 지정: 지오드넷(GEOD)"]);
  });

  it("ignores a list that lost many markets at once", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ market: `KRW-C${i}`, korean_name: `코인${i}`, market_event: { warning: false, caution: {} } }));
    const base = await run(src, [{ match: /upbit/, body: JSON.stringify(many) }]);
    await assert.rejects(run({ ...src, state: base.state }, [{ match: /upbit/, body: JSON.stringify(many.slice(0, 20)) }]), /missing at once/);
  });
});

describe("dart.list", () => {
  it("keeps major filings by report name and listing class", async () => {
    const calls: string[] = [];
    const r = await run(source({ adapter: "dart.list", config: {} }), [{ match: /opendart/, body: fixture("dart-list.json") }], { env: { DART_API_KEY: "k" }, calls });
    assert.ok(calls[0].includes("crtfc_key=k") && calls[0].includes("bgn_de=20261022"));
    assert.deepEqual(
      r.result.items!.map((i) => i.title),
      ["삼성전자 — 연결재무제표기준영업(잠정)실적(공정공시)", "가나다바이오 — 주요사항보고서(유상증자결정)"],
    );
    assert.equal(r.result.items![1].weight, 0.95);
    assert.equal(r.result.items![0].url, "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261021800123");
    assert.equal(r.result.nextRunInSec, 900); // 03:00 KST: quiet hours
  });

  it("missing or rejected keys are configuration problems, not outages", async () => {
    await assert.rejects(run(source({ adapter: "dart.list", config: {} }), []), (e) => e instanceof ConfigError && /DART_API_KEY/.test(e.message));
    await assert.rejects(
      run(source({ adapter: "dart.list", config: {} }), [{ match: /opendart/, body: fixture("dart-badkey.json") }], { env: { DART_API_KEY: "bad" } }),
      (e) => e instanceof ConfigError,
    );
  });
});

describe("ecos.series", () => {
  it("stores the series as metrics and announces a new period only after a baseline", async () => {
    const src = source({ adapter: "ecos.series", config: { series: [{ code: "722Y001", cycle: "M", item1: "0101000", name: "한국은행 기준금리", metric: "kr_base_rate" }] } });
    const env = { ECOS_API_KEY: "sample" };
    const first = await run(src, [{ match: /ecos/, body: fixture("ecos-series.json") }], { env });
    assert.equal(first.result.metrics!.length, 3);
    assert.equal(first.result.metrics![2].value, 2.5);
    assert.equal(first.result.items!.length, 0);
    const state = { last: { "722Y001:0101000": "202609" } };
    const second = await run({ ...src, state }, [{ match: /ecos/, body: fixture("ecos-series.json") }], { env });
    assert.equal(second.result.items![0].title, "한국은행 기준금리 2026.10: 2.5% (−0.25)");
  });
});

describe("market adapters", () => {
  it("binance spot → USD quotes with a sparkline and closed-candle metrics", async () => {
    const r = await run(
      source({ adapter: "market.binance", config: { pairs: [{ pair: "BTCUSDT", symbol: "BTC", name: "비트코인", inTicker: true }] } }),
      [
        { match: /ticker\/24hr/, body: fixture("binance-24hr.json") },
        { match: /klines/, body: fixture("binance-klines.json") },
      ],
      { now: new Date(1792605700000) },
    );
    const q = r.result.quotes![0];
    assert.equal(q.price, 84628.62);
    assert.equal(q.changePct, 2.118);
    assert.deepEqual(q.spark, [84552, 84628.61]);
    assert.equal(r.result.metrics!.length, 2);
  });

  it("upbit KRW quotes use the exchange's signed change rate", async () => {
    const r = await run(
      source({ adapter: "market.krw", config: { markets: [{ market: "KRW-BTC", symbol: "KRW-BTC", name: "비트코인 원화" }] } }),
      [
        { match: /ticker/, body: fixture("upbit-ticker.json") },
        { match: /candles/, body: "[]" },
      ],
    );
    assert.equal(r.result.quotes![0].price, 112457000);
    assert.equal(r.result.quotes![0].changePct, 1.8845);
  });

  it("treasury → latest 10-year yield and its change", async () => {
    const r = await run(source({ adapter: "rates.treasury", config: {} }), [{ match: /treasury\.gov/, body: fixture("treasury.xml"), headers: xml }]);
    const q = r.result.quotes![0];
    assert.equal(q.symbol, "US10Y");
    assert.equal(q.price, 5.2);
    assert.equal(q.changePct, -0.7634);
  });

  it("fear & greed → daily metrics", async () => {
    const r = await run(source({ adapter: "index.feargreed", config: {} }), [{ match: /alternative\.me/, body: fixture("fng.json") }]);
    assert.deepEqual(
      r.result.metrics!.map((m) => m.value),
      [63, 55],
    );
  });
});

describe("papers and stories", () => {
  it("hf.papers dates items by the day they were featured", async () => {
    const r = await run(source({ adapter: "hf.papers", config: {} }), [{ match: /huggingface/, body: fixture("hf-papers.json") }]);
    const i = r.result.items![0];
    assert.equal(i.publishedAt!.toISOString(), "2026-10-21T00:00:00.000Z");
    assert.equal(i.url, "https://huggingface.co/papers/2610.25459");
    assert.ok((i.weight ?? 0) > 0.8);
  });

  it("hn links the discussion when a story has no URL", async () => {
    const r = await run(source({ adapter: "hn", config: { minPoints: 100 } }), [{ match: /algolia/, body: fixture("hn.json") }]);
    assert.equal(r.result.items![1].url, "https://news.ycombinator.com/item?id=50182000");
  });

  it("arxiv keeps new announcements once, with the abstract only", async () => {
    const r = await run(source({ adapter: "arxiv", config: {} }), [{ match: /arxiv/, body: fixture("arxiv.rss"), headers: xml }]);
    assert.equal(r.result.items!.length, 1);
    assert.equal(r.result.items![0].externalId, "2610.26887");
    assert.match(r.result.items![0].summary!, /^Large language model \(LLM\) agents/);
  });
});

describe("social", () => {
  it("telegram.channel emits only messages after the last seen id", async () => {
    const src = source({ adapter: "telegram.channel", config: { channel: "coinnesskr" } });
    const r = await run({ ...src, state: { lastId: 234970 } }, [{ match: /t\.me\/s\/coinnesskr$/, body: fixture("telegram-channel.html"), headers: html }]);
    assert.deepEqual(
      r.result.items!.map((i) => i.externalId),
      ["234971"],
    );
    assert.equal(r.state.lastId, 234972);
  });

  it("html.list honours robots.txt and records why when it may not", async () => {
    const src = source({
      adapter: "html.list",
      url: "https://gall.dcinside.com/board/lists/?id=stock_new2",
      config: { row: "tr.ub-content.us-post", fields: { id: { attr: "data-no" }, title: { sel: "td.gall_tit a" } } },
    });
    await assert.rejects(run(src, [{ match: /robots\.txt/, body: fixture("robots-dc.txt"), headers: { "content-type": "text/plain" } }]), (e) => e instanceof ConfigError && /robots\.txt/.test(e.message));
    await assert.rejects(run({ ...src, config: { ...src.config, respectRobots: false } }, []), /robotsOverride/);
  });

  it("html.list follows a cookie check, then reads the rows", async () => {
    let served = 0;
    const routes: Route[] = [
      { match: /robots\.txt/, body: "User-agent: *\nAllow: /zboard/\n", headers: { "content-type": "text/plain" } },
      {
        match: /ppck=1/,
        body: (url, init) => {
          const cookie = (init?.headers as Record<string, string>).cookie ?? "";
          if (!cookie.includes("pp_ck=1")) throw new Error(`no cookie on ${url}`);
          served++;
          return fixture("ppomppu-list.html");
        },
        headers: html,
      },
      { match: /zboard\.php\?id=stock$/, status: 302, body: "", headers: { location: "zboard.php?id=stock&ppck=1", "set-cookie": "pp_ck=1; path=/" } },
    ];
    const r = await run(
      source({
        adapter: "html.list",
        url: "https://www.ppomppu.co.kr/zboard/zboard.php?id=stock",
        config: {
          row: "tr.baseList",
          fields: { id: { sel: "td.baseList-numb" }, title: { sel: "a.baseList-title" }, time: { sel: "time.baseList-time", attr: "title" } },
          cookieCheck: true,
          maxAgeDays: 30,
        },
      }),
      routes,
    );
    assert.equal(served, 1);
    assert.equal(r.result.posts!.length, 2);
    assert.equal(r.result.posts![0].text, '트럼프 계좌 "반도체 팔고, 메타 샀다"');
  });

  it("x.accounts groups accounts into queries under the length limit", () => {
    const accounts = Array.from({ length: 80 }, (_, i) => `account_${String(i).padStart(3, "0")}`);
    const qs = buildQueries({ accounts, includeReplies: false, includeReposts: false, extra: "" });
    assert.ok(qs.length > 1);
    for (const q of qs) assert.ok(q.length <= 512, String(q.length));
    assert.equal(qs.join(" ").match(/from:/g)!.length, 80);
    assert.match(qs[0], /\) -is:retweet -is:reply$/);
  });

  it("x.accounts stops at the monthly cap without calling the API", async () => {
    const calls: string[] = [];
    const r = await run(
      source({ adapter: "x.accounts", config: { accounts: ["OpenAI"], monthlyPostCap: 100 }, state: { usage: { month: "2026-10", posts: 100 } } }),
      [],
      { env: { X_BEARER_TOKEN: "t" }, calls },
    );
    assert.equal(calls.length, 0);
    assert.match(r.result.note!, /월 한도/);
  });
});

describe("validateConfig", () => {
  it("names the field that is wrong", () => {
    const v = validateConfig("telegram.channel", { channel: "no spaces allowed" });
    assert.equal(v.ok, false);
    assert.match((v as { message: string }).message, /^channel:/);
  });
});

void NOW;
