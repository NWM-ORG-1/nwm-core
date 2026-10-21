/**
 * Prints what feed endpoints really return (status, type, and excerpts) so
 * parsers can be checked against live responses. Runs in GitHub Actions
 * (feeds-probe workflow); no dependencies, no credentials.
 *
 *   node scripts/probe/raw-capture.mjs [name-filter]
 */
const UA = "NWM-FeedProbe/1.0 (+https://newweb.media)";

/** marker: print windows around the first `count` occurrences instead of the head */
const TARGETS = [
  // ── market ──
  { name: "upbit.market-all", url: "https://api.upbit.com/v1/market/all?isDetails=true", head: 900, marker: '"CAUTION"', count: 1, width: 700 },
  { name: "upbit.market-all.event", url: "https://api.upbit.com/v1/market/all?isDetails=true", marker: '"warning":true', count: 1, width: 700 },
  { name: "upbit.ticker", url: "https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-USDT", head: 2400 },
  { name: "bithumb.market-all", url: "https://api.bithumb.com/v1/market/all?isDetails=true", head: 900, marker: '"CAUTION"', count: 1, width: 600 },
  { name: "bithumb.ticker", url: "https://api.bithumb.com/v1/ticker?markets=KRW-BTC", head: 1500 },
  { name: "binance-vision.24hr", url: `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${encodeURIComponent('["BTCUSDT","ETHUSDT"]')}`, head: 1800 },
  { name: "binance-vision.klines", url: "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=2", head: 800 },
  { name: "binance.api.24hr", url: "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT", head: 600 },
  { name: "binance.fapi.premium", url: "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT", head: 800 },
  { name: "binance.fapi.lsr", url: "https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=2", head: 800 },
  { name: "binance.fapi.oi-hist", url: "https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=2", head: 800 },
  { name: "bybit.tickers", url: "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT", head: 1800 },
  { name: "bybit.account-ratio", url: "https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1h&limit=2", head: 800 },
  { name: "bybit.open-interest", url: "https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1h&limit=2", head: 800 },
  { name: "alternative.fng", url: "https://api.alternative.me/fng/?limit=2", head: 900 },
  { name: "frankfurter.dev", url: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW", head: 400 },
  { name: "frankfurter.app", url: "https://api.frankfurter.app/latest?from=USD&to=KRW", head: 400 },
  { name: "treasury.xml", url: "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=202610", head: 1200, marker: "<entry>", count: 1, width: 2600 },
  { name: "koreaexim.nokey", url: "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=TEST&searchdate=20261020&data=AP01", head: 600 },
  // ── official ──
  { name: "sec.getcurrent", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&start=0&count=10&output=atom", head: 2600 },
  { name: "arxiv.rss", url: "https://rss.arxiv.org/rss/cs.AI", head: 3200 },
  { name: "hf.daily-papers", url: "https://huggingface.co/api/daily_papers?limit=1", head: 2600 },
  { name: "hn.algolia", url: "https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E%3D100&hitsPerPage=1&attributesToHighlight=none", head: 1500 },
  { name: "github.releases", url: "https://github.com/vercel/next.js/releases.atom", head: 1800 },
  { name: "korea.kr.mofe", url: "https://www.korea.kr/rss/dept_mofe.xml", head: 2000 },
  { name: "korea.kr.moef", url: "https://www.korea.kr/rss/dept_moef.xml", head: 600 },
  { name: "korea.kr.kcs", url: "https://www.korea.kr/rss/dept_kcs.xml", head: 1600 },
  { name: "korea.kr.motie", url: "https://www.korea.kr/rss/dept_motie.xml", head: 600 },
  { name: "korea.kr.msit", url: "https://www.korea.kr/rss/dept_msit.xml", head: 600 },
  { name: "korea.kr.fsc", url: "https://www.korea.kr/rss/dept_fsc.xml", head: 600 },
  { name: "korea.kr.pressrelease", url: "https://www.korea.kr/rss/pressrelease.xml", head: 600 },
  { name: "korea.kr.rss-index", url: "https://www.korea.kr/etc/rss.do", marker: "dept_", count: 6, width: 220 },
  { name: "fsc.rss", url: "https://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111", head: 1600 },
  { name: "bok.rss", url: "https://www.bok.or.kr/portal/bbs/B0000501/news.rss?menuNo=201264", head: 1200 },
  { name: "fed.press", url: "https://www.federalreserve.gov/feeds/press_all.xml", head: 1400 },
  { name: "sec.press", url: "https://www.sec.gov/news/pressreleases.rss", head: 1400 },
  { name: "kisa.boho", url: "https://www.boho.or.kr/kr/rss.do?bbsId=B0000133", head: 1200 },
  { name: "openai.news", url: "https://openai.com/news/rss.xml", head: 1400 },
  { name: "google.ai", url: "https://blog.google/technology/ai/rss/", head: 1400 },
  { name: "deepmind", url: "https://deepmind.google/blog/rss.xml", head: 1200 },
  { name: "nvidia.blog", url: "https://blogs.nvidia.com/feed/", head: 1200 },
  { name: "samsung.newsroom", url: "https://news.samsung.com/kr/feed", head: 1200 },
  { name: "skhynix.newsroom", url: "https://news.skhynix.co.kr/feed/", head: 1200 },
  { name: "dart.nokey", url: "https://opendart.fss.or.kr/api/list.json?crtfc_key=TEST&bgn_de=20261020&end_de=20261021", head: 400 },
  { name: "ecos.sample", url: "https://ecos.bok.or.kr/api/StatisticSearch/sample/json/kr/1/3/722Y001/M/202501/202610/0101000", head: 1500 },
  { name: "kosis.nokey", url: "https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&apiKey=TEST&itmId=T+&objL1=ALL&format=json&jsonVD=Y&prdSe=M&newEstPrdCnt=1&orgId=101&tblId=DT_1J22003", head: 500 },
  { name: "naver.datalab.nokey", url: "https://openapi.naver.com/v1/datalab/search", head: 400 },
  { name: "x.nokey", url: "https://api.x.com/2/tweets/search/recent?query=from%3AX", head: 400 },
  // ── social / community ──
  { name: "telegram.public", url: "https://t.me/s/durov", marker: 'class="tgme_widget_message ', count: 2, width: 2600, before: 120 },
  { name: "telegram.public.more", url: "https://t.me/s/durov", marker: "tme_messages_more", count: 1, width: 400, before: 200 },
  { name: "dc.list", url: "https://gall.dcinside.com/board/lists/?id=bitcoins_new1", marker: 'class="ub-content', count: 3, width: 1900, before: 20 },
  { name: "naver.board", url: "https://finance.naver.com/item/board.naver?code=005930", marker: 'class="title"', count: 2, width: 1300, before: 500 },
  { name: "clien.list", url: "https://www.clien.net/service/board/cm_stock", marker: "list_item symph_row", count: 2, width: 2400, before: 40 },
  { name: "ppomppu.list", url: "https://www.ppomppu.co.kr/zboard/zboard.php?id=stock", marker: "baseList", count: 3, width: 1500, before: 40 },
  { name: "fmkorea.list", url: "https://www.fmkorea.com/index.php?mid=stock", head: 1000, marker: "hotdeal_var8", count: 2, width: 1500, before: 600 },
  { name: "robots.dc", url: "https://gall.dcinside.com/robots.txt", head: 1500 },
  { name: "robots.naver-finance", url: "https://finance.naver.com/robots.txt", head: 1500 },
  { name: "robots.clien", url: "https://www.clien.net/robots.txt", head: 1500 },
  { name: "robots.ppomppu", url: "https://www.ppomppu.co.kr/robots.txt", head: 1500 },
  { name: "robots.fmkorea", url: "https://www.fmkorea.com/robots.txt", head: 1500 },
  { name: "robots.telegram", url: "https://t.me/robots.txt", head: 800 },
];

function charsetOf(contentType, bytes) {
  const m = /charset=["']?([\w-]+)/i.exec(contentType ?? "");
  if (m) return m[1].toLowerCase();
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head) ?? /<\?xml[^>]+encoding=["']([\w-]+)/i.exec(head);
  return meta ? meta[1].toLowerCase() : "utf-8";
}

const clip = (s) => s.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");

async function capture(t) {
  const started = Date.now();
  try {
    const res = await fetch(t.url, {
      headers: { "user-agent": UA, accept: "*/*", "accept-language": "ko-KR,ko;q=0.9,en;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const cs = charsetOf(res.headers.get("content-type"), bytes);
    let text;
    try {
      text = new TextDecoder(cs).decode(bytes);
    } catch {
      text = new TextDecoder("utf-8").decode(bytes);
    }
    const lines = [
      `status=${res.status} type=${res.headers.get("content-type")} charset=${cs} bytes=${bytes.length} ms=${Date.now() - started}`,
      `final=${res.url}`,
    ];
    for (const h of ["etag", "last-modified", "retry-after", "server", "cf-ray", "x-cache"]) {
      const v = res.headers.get(h);
      if (v) lines.push(`${h}: ${v}`);
    }
    if (t.head) lines.push("--- head ---", clip(text.slice(0, t.head)));
    if (t.marker) {
      let from = 0;
      for (let i = 0; i < (t.count ?? 1); i++) {
        const at = text.indexOf(t.marker, from);
        if (at < 0) {
          lines.push(`--- marker ${JSON.stringify(t.marker)} #${i + 1}: not found ---`);
          break;
        }
        const start = Math.max(0, at - (t.before ?? 0));
        lines.push(`--- marker ${JSON.stringify(t.marker)} #${i + 1} @${at} ---`, clip(text.slice(start, at + (t.width ?? 800))));
        from = at + t.marker.length;
      }
    }
    return lines.join("\n");
  } catch (err) {
    return `ERROR ${err?.cause?.code ?? ""} ${err?.message ?? err} ms=${Date.now() - started}`;
  }
}

const filter = process.argv[2];
for (const t of TARGETS) {
  if (filter && !t.name.includes(filter)) continue;
  console.log(`\n===== ${t.name} ===== ${t.url}`);
  console.log(await capture(t));
  await new Promise((r) => setTimeout(r, 400));
}
