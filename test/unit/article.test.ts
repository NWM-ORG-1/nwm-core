import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractArticleText, pdfLinks } from "@/ingest/article";
import { bodyFetcher, cleanPdfText } from "@/ingest/fetch-body";
import { HostLimiter } from "@/ingest/http";
import { materialChars, mayFetchBody, MIN_MATERIAL, type EnrichItem } from "@/server/desk/enrich";

/* fixtures — a fictional ministry */
const PAGE = `<!doctype html><html><head><title>보도자료 | 가상부</title><script>var tracking = "본문 아님";</script><style>.x{}</style></head>
<body>
<div id="skip"><a href="#content">본문 바로가기</a></div>
<div class="header"><ul class="gnb"><li><a href="/a">정책</a></li><li><a href="/b">알림·뉴스</a></li><li><a href="/c">정보공개</a></li></ul><div class="util">로그인 회원가입 사이트맵</div></div>
<div class="container">
  <div class="lnb"><h2>알림·뉴스</h2><ul><li><a href="/p">보도자료</a></li><li><a href="/q">해명자료</a></li></ul></div>
  <div class="content">
    <div class="location">홈 &gt; 알림·뉴스 &gt; 보도자료</div>
    <div class="board_view">
      <h3 class="subject">가상부, 반도체 규제 합리화 방안 발표</h3>
      <div class="view_cont">
        <p>가상부는 23일 반도체 투자 인허가 기간을 평균 18개월에서 9개월로 줄이는 규제 합리화 방안을 발표했다.</p>
        <p>방안에는 산업단지 용수·전력 인허가를 한 번에 처리하는 &lsquo;통합 심사&rsquo; 절차가 담겼다.<br>심사 창구는 가상부 반도체과로 일원화한다.</p>
        <table><tr><th>구분</th><th>현행</th><th>개선</th></tr><tr><td>인허가 기간</td><td>18개월</td><td>9개월</td></tr></table>
        <p>가상부는 다음 달 관계부처 협의를 거쳐 세부 지침을 확정할 계획이다.</p>
        <p>통합 심사는 내년 1월 신청분부터 적용하며, 이미 접수된 인허가 신청은 기존 절차와 새 절차 가운데 기업이 고를 수 있게 했다.</p>
      </div>
      <div class="file">
        <a href="/files/press.hwp">[보도자료] 반도체 규제 합리화.hwp</a>
        <a href="/files/table.pdf">[붙임] 통계표.pdf</a>
        <a href="/files/press.pdf" title="[보도자료] 반도체 규제 합리화.pdf">내려받기</a>
        <a href="/static/viewer.html?file=/files/press.pdf">바로보기</a>
      </div>
      <div class="btn_area"><a href="/list">목록</a></div>
      <ul class="prev_next"><li>이전글 <a href="/1">가상부, 수출 동향 발표</a></li><li>다음글 <a href="/2">가상부, 설명회 개최</a></li></ul>
    </div>
  </div>
</div>
<div class="footer"><p>(30100) 세종특별자치시 가상로 1 · 대표전화 044-000-0000</p><p>Copyright © 가상부. All rights reserved.</p></div>
</body></html>`;

const DOWNLOAD_ONLY = `<html><body><div class="header"><a href="/">가상은행</a></div><div class="bd-view"><h2>2026년 9월 가상물가지수</h2>
<dl><dt>등록일</dt><dd>2026.10.16</dd></dl><ul><li><a href="/fileSrc/1/press.hwp">[보도자료] 가상물가지수.hwp</a></li><li><a href="/fileSrc/1/press.pdf">[보도자료] 가상물가지수.pdf</a></li></ul></div></body></html>`;

describe("article text", () => {
  it("keeps the article and drops menus, footers, scripts and page furniture", () => {
    const t = extractArticleText(PAGE);
    assert.match(t, /^가상부는 23일 반도체 투자 인허가 기간을 평균 18개월에서 9개월로/);
    assert.match(t, /‘통합 심사’ 절차가 담겼다\.\n심사 창구는/, "entities decoded, <br> kept as a line break");
    assert.match(t, /인허가 기간\n18개월\n9개월/, "table cells survive");
    assert.match(t, /세부 지침을 확정할 계획이다\.\n통합 심사는 내년 1월/);
    assert.match(t, /기업이 고를 수 있게 했다\.$/);
    for (const junk of ["본문 바로가기", "로그인", "보도자료\n해명자료", "세종특별자치시", "Copyright", "이전글", "목록", "본문 아님"]) assert.ok(!t.includes(junk), junk);
    assert.equal(extractArticleText(DOWNLOAD_ONLY), "", "a download list is not an article");
  });

  it("finds the press release PDF before the appendix, never the viewer", () => {
    assert.deepEqual(pdfLinks(PAGE, "https://www.example.go.kr/view/1"), ["https://www.example.go.kr/files/press.pdf", "https://www.example.go.kr/files/table.pdf"]);
  });

  it("cleans pdftotext output", () => {
    assert.equal(cleanPdfText("제목\n- 1 -\n\n본문   문장\n2 / 5\n\f다음 쪽\n-3-"), "제목\n본문 문장\n다음 쪽");
  });
});

describe("body fetcher", () => {
  const LONG = "가상은행은 16일 2026년 9월 가상물가지수가 전월보다 1.2% 올랐다고 밝혔다. ".repeat(6);
  function fake(routes: Record<string, { status?: number; body: string | Uint8Array<ArrayBuffer>; type?: string }>) {
    const asked: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url);
      asked.push(u);
      const r = routes[u];
      if (!r) return new Response("not found", { status: 404 });
      return new Response(r.body, { status: r.status ?? 200, headers: { "content-type": r.type ?? "text/html; charset=utf-8" } });
    }) as typeof fetch;
    return { fetchImpl, asked };
  }
  const limiter = () => new HostLimiter(() => 0);

  it("reads the page, or the PDF when the page is only a download list", async () => {
    const pdfBytes = new TextEncoder().encode("%PDF-1.7\n…");
    const seen: number[] = [];
    const { fetchImpl, asked } = fake({
      "https://www.example.go.kr/view/1": { body: PAGE },
      "https://www.example.or.kr/view/2": { body: DOWNLOAD_ONLY },
      "https://www.example.or.kr/fileSrc/1/press.pdf": { body: pdfBytes, type: "application/pdf" },
    });
    const get = bodyFetcher({ fetchImpl, limiter: limiter(), pdfText: async (b) => (seen.push(b.byteLength), `${LONG}\n- 1 -`) });

    const page = await get("https://www.example.go.kr/view/1");
    assert.equal(page?.from, "page");
    assert.match(page?.text ?? "", /^가상부는 23일/);
    assert.ok(!asked.some((u) => u.endsWith(".pdf")), "a full page needs no PDF");

    const pdf = await get("https://www.example.or.kr/view/2");
    assert.equal(pdf?.from, "pdf");
    assert.equal(pdf?.url, "https://www.example.or.kr/fileSrc/1/press.pdf");
    assert.equal(pdf?.text, LONG.trim());
    assert.deepEqual(seen, [pdfBytes.byteLength]);
    assert.equal(asked.filter((u) => u.endsWith("/robots.txt")).length, 2, "robots.txt once per site");
  });

  it("honours robots.txt and gives up quietly", async () => {
    const { fetchImpl, asked } = fake({
      "https://closed.example.go.kr/robots.txt": { body: "User-agent: *\nDisallow: /", type: "text/plain" },
      "https://down.example.go.kr/robots.txt": { status: 503, body: "busy" },
      "https://www.example.go.kr/empty": { body: "<html><body><p>짧다</p></body></html>" },
      "https://www.example.go.kr/short": { body: `<html><body><div class="view"><p>${"가상부는 23일 설명회를 연다고 밝혔다. ".repeat(6)}</p><a href="/gone.pdf">[보도자료].pdf</a></div></body></html>` },
    });
    const get = bodyFetcher({ fetchImpl, limiter: limiter() });
    assert.equal(await get("https://closed.example.go.kr/view/1"), null);
    assert.equal(await get("https://down.example.go.kr/view/1"), null, "an unreachable robots.txt allows nothing");
    assert.equal(await get("https://www.example.go.kr/empty"), null);
    const short = await get("https://www.example.go.kr/short");
    assert.equal(short?.from, "page", "a short page beats a headline when its PDF is gone");
    assert.ok(asked.includes("https://www.example.go.kr/gone.pdf"));
    assert.ok(!asked.includes("https://closed.example.go.kr/view/1") && !asked.includes("https://down.example.go.kr/view/1"));
  });
});

describe("desk material", () => {
  const item = (over: Partial<EnrichItem> = {}, src: Partial<EnrichItem["source"]> = {}): EnrichItem => ({
    id: "x",
    url: "https://www.example.go.kr/view/1",
    summary: "",
    payload: {},
    ...over,
    source: { adapter: "rss", trustTier: 1, signalOnly: false, licReviewedAt: null, licCommercialOk: null, ...src },
  });

  it("fetches public press pages always, company pages only once their licence allows it", () => {
    assert.equal(mayFetchBody(item()), true);
    assert.equal(mayFetchBody(item({ url: "https://www.federalreserve.gov/newsevents/x.htm" })), true);
    assert.equal(mayFetchBody(item({ url: "https://www.bok.or.kr/portal/bbs/view.do" })), true);
    assert.equal(mayFetchBody(item({ url: "https://blog.example.com/post" })), false);
    assert.equal(mayFetchBody(item({ url: "https://blog.example.com/post" }, { licReviewedAt: new Date(), licCommercialOk: true })), true);
    assert.equal(mayFetchBody(item({ summary: "가".repeat(300) })), false, "the feed already gave enough");
    assert.equal(mayFetchBody(item({ payload: { body: "이미 있음" } })), false);
    assert.equal(mayFetchBody(item({ payload: { bodyTried: "2026-10-24T00:00:00Z" } })), false, "one attempt only");
    assert.equal(mayFetchBody(item({}, { signalOnly: true })), false);
    assert.equal(mayFetchBody(item({}, { trustTier: 2 })), false);
    assert.equal(mayFetchBody(item({}, { adapter: "sec.edgar" })), false);
  });

  it("counts a headline, its echo and attachment boilerplate as nothing", () => {
    const t = { title: "가상부, 반도체 규제 합리화 방안 발표" };
    assert.equal(materialChars([{ ...item(), ...t }]), 0);
    assert.equal(materialChars([{ ...item({ summary: t.title }), ...t }]), 0);
    assert.ok(materialChars([{ ...item({ summary: "자세한 내용은 첨부파일을 참고하시기 바랍니다." }), ...t }]) < MIN_MATERIAL);
    assert.ok(materialChars([{ ...item({ payload: { body: "가".repeat(500) } }), ...t }]) >= 500);
    assert.equal(materialChars([{ ...item({ summary: "가".repeat(100) }, { signalOnly: true }), ...t }]), 0, "signal-only items are not material");
  });
});
