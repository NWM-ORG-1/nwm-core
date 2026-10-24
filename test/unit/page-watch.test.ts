import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pageLinks, pageLines } from "@/ingest/adapters/generic/page-watch";
import { changedChars, changesOf, diffLines, docDate, isoDay, renderChange, wordDiff } from "@/ingest/diff";
import { ConfigError } from "@/ingest/types";
import { NOW, run, source, type Route } from "../helpers";

/* fixtures — a fictional company's terms and a fictional notice board */

const html = { "content-type": "text/html; charset=utf-8" };

const terms = (o: { date?: string; liability?: string; extra?: string; counter?: number } = {}) => `<!doctype html><html><head><title>Hanbit Cloud Business Terms</title></head><body>
<nav><a href="/">Home</a> <a href="/legal">Legal</a> <a href="/pricing">Pricing</a></nav>
<main><article>
<h1>Hanbit Cloud Business Terms</h1>
<p>Last updated: ${o.date ?? "July 1, 2026"}</p>
<h2>1. Services</h2>
<p>Hanbit Cloud provides hosted models and tools to business customers under these terms and the order form.</p>
<h2>7. AI Output</h2>
<p>${o.liability ?? "Hanbit Cloud is responsible for errors in AI output that cause direct damages to the Customer."}</p>
${o.extra ?? ""}
<h2>9. Governing Law</h2>
<p>These terms are governed by the laws of the Republic of Korea and disputes go to the Seoul Central District Court.</p>
<p>Visitors today: ${o.counter ?? 1}</p>
</article></main>
<footer>© 2026 Hanbit Cloud</footer></body></html>`;

const robots = (body = "User-agent: *\nDisallow: /private/") => ({ match: /robots\.txt$/, body, headers: { "content-type": "text/plain" } }) satisfies Route;
const page = (body: string, onCall?: (init?: RequestInit) => void): Route => ({ match: /hanbit\.example/, body: (_u, init) => (onCall?.(init), body), headers: html });

const src = source({
  adapter: "page.watch",
  name: "한빛클라우드 약관",
  url: "https://hanbit.example/legal/business-terms",
  lang: "en",
  config: { label: "Hanbit Cloud Business Terms", ignore: ["^Visitors today"] },
});

describe("paragraph and word diffs", () => {
  it("keeps order, pairs a reworded paragraph and finds the heading above it", () => {
    const a = ["1. Services", "We host models.", "7. AI Output", "We are responsible for errors in AI output.", "9. Law", "Korean law applies."];
    const b = ["1. Services", "We host models.", "7. AI Output", "The Customer is responsible for errors in AI output.", "The Customer must review all output.", "9. Law", "Korean law applies."];
    const ch = changesOf(diffLines(a, b));
    assert.deepEqual(
      ch.map((c) => [c.kind, c.under]),
      [
        ["reworded", "7. AI Output"],
        ["added", "7. AI Output"],
      ],
    );
    assert.equal(renderChange(ch[0], 1), "[수정 1 · ‘7. AI Output’ 아래] 이전: “We are responsible for errors in AI output.” → 이후: “The Customer is responsible for errors in AI output.”");
    assert.equal(renderChange(ch[1], 2), "[추가 2 · ‘7. AI Output’ 아래] “The Customer must review all output.”");
  });

  it("marks the changed words in a long paragraph, with context around them", () => {
    const before = `${"Lorem ipsum dolor sit amet ".repeat(12)}the provider shall be liable for any damages caused by the output ${"and so on ".repeat(10)}`;
    const after = before.replace("shall be liable", "shall not be liable");
    assert.match(wordDiff(before, after), /^… .*the provider shall {\+not\+} be liable for any damages caused by .* …$/);
    assert.equal(changedChars(changesOf(diffLines([before], [after]))), 3);
  });

  it("compares Japanese by characters", () => {
    const a = "本規約は二〇二六年十一月一日から施行し、利用者は生成物について一切の責任を負うものとします。";
    const b = "本規約は二〇二六年十一月一日から施行し、当社は生成物について一切の責任を負わないものとします。";
    assert.match(wordDiff(a, b), /\[-利用者-\]{\+当社\+}は生成物について一切の責任を負\[-う-\]{\+わない\+}/);
  });

  it("reads the document's own date, the latest one when there are several", () => {
    assert.deepEqual(docDate("Terms\nLast updated: October 20, 2026\nPrevious version effective March 3, 2025"), { label: "Last updated: October 20, 2026", iso: "2026-10-20" });
    assert.equal(docDate("제1조(목적)\n시행일: 2026년 11월 1일")?.iso, "2026-11-01");
    assert.equal(docDate("부칙\n이 약관은 2025. 3. 1.부터 시행합니다.\n이 약관은 2026. 11. 1.부터 시행합니다.")?.iso, "2026-11-01");
    assert.equal(docDate("最終更新日：2026年10月1日")?.iso, "2026-10-01");
    assert.equal(docDate("no dates here"), null);
    assert.equal(isoDay("2026-13-40"), null);
    assert.equal(isoDay("1 Sept 2026"), "2026-09-01");
  });

  it("folds spaces and drops invisible characters and ignored lines", () => {
    assert.deepEqual(pageLines("  a\u200b  b \n\nVisitors today: 5\n c ", [/^visitors today/i]), ["a b", "c"]);
  });
});

describe("page.watch — text", () => {
  it("stores the page on the first run and files nothing", async () => {
    const r = await run(src, [robots(), page(terms())]);
    assert.equal(r.result.items, undefined);
    assert.match(r.result.note ?? "", /^처음 읽음 — 지금 모습을 기준으로 저장 \(\d+문단 [\d,]+자, Last updated: July 1, 2026\)/);
    assert.equal(typeof r.state.hash, "string");
    assert.ok(!String(r.state.text).includes("Pricing"), "menus are not the document");
    assert.ok(!String(r.state.text).includes("Visitors today"), "ignored lines are not kept");
  });

  it("asks in the source's language and files nothing while the page stays the same (counters ignored)", async () => {
    const first = await run(src, [robots(), page(terms())]);
    let lang = "";
    const r = await run({ ...src, state: first.state }, [robots(), page(terms({ counter: 99 }), (init) => (lang = (init?.headers as Record<string, string>)["accept-language"]))]);
    assert.equal(lang, "en-US,en;q=0.9");
    assert.equal(r.result.items, undefined);
    assert.equal(r.result.notModified, true);
  });

  it("files one item with the reworded and added paragraphs and the new document date", async () => {
    const first = await run(src, [robots(), page(terms())]);
    const changed = terms({
      date: "October 20, 2026",
      liability: "The Customer is responsible for errors in AI output, including direct damages to the Customer.",
      extra: "<p>The Customer must have a person review AI output before relying on it.</p>",
    });
    const later = new Date(NOW.getTime() + 6 * 3_600_000);
    const r = await run({ ...src, state: first.state }, [robots(), page(changed)], { now: later });
    const [item] = r.result.items!;
    assert.equal(r.result.items!.length, 1);
    assert.equal(item.title, "Hanbit Cloud Business Terms 변경 — 문단 2곳 수정·1곳 추가 (Last updated: October 20, 2026)");
    assert.equal(item.externalId, `v:${r.state.hash}`);
    assert.equal(item.url, "https://hanbit.example/legal/business-terms");
    assert.equal(item.publishedAt?.toISOString(), later.toISOString());
    assert.match(item.summary!, /^Hanbit Cloud Business Terms 페이지가 바뀌었습니다\(문단 2곳 수정·1곳 추가\)\. 문서 날짜: Last updated: October 20, 2026 \(이전: Last updated: July 1, 2026\)\./);
    assert.match(item.summary!, /\[수정 \d · ‘7\. AI Output’ 아래\] 이전: “Hanbit Cloud is responsible for errors in AI output that cause direct damages to the Customer\.” → 이후: “The Customer is responsible/);
    assert.match(item.summary!, /\[추가 \d · ‘7\. AI Output’ 아래\] “The Customer must have a person review AI output before relying on it\.”/);
    const p = item.payload!;
    assert.equal(p.watch, "text");
    assert.equal(p.docDate, "2026-10-20");
    assert.deepEqual(p.counts, { reworded: 2, added: 1, removed: 0 });
    assert.match(String(p.body), /^문서: Hanbit Cloud Business Terms \(https:\/\/hanbit\.example\/legal\/business-terms\)\n문서 날짜: /);
    assert.equal(p.bodyUrl, "https://hanbit.example/legal/business-terms");
    assert.equal(r.state.changedAt, later.toISOString());
  });

  it("files a page that flips back to an earlier version only once", async () => {
    const a = await run(src, [robots(), page(terms())]);
    const b = await run({ ...src, state: a.state }, [robots(), page(terms({ extra: "<p>A rotating promotion block that comes and goes.</p>" }))]);
    assert.equal(b.result.items!.length, 1);
    const back = await run({ ...src, state: b.state }, [robots(), page(terms())]);
    assert.equal(back.result.items, undefined);
    assert.equal(back.result.note, "전에 본 판으로 돌아감 — 올리지 않음");
  });

  it("keeps small edits below minChange to itself", async () => {
    const s = { ...src, config: { ...src.config, minChange: 20 } };
    const a = await run(s, [robots(), page(terms())]);
    const b = await run({ ...s, state: a.state }, [robots(), page(terms({ liability: "Hanbit Cloud is responsible for errors in AI output that cause direct damage to the Customer." }))]);
    assert.equal(b.result.items, undefined);
    assert.match(b.result.note ?? "", /^작은 변경\(\d+자\)/);
    assert.notEqual(b.state.hash, a.state.hash, "the kept copy follows the page");
  });

  it("stops where robots.txt says so, and needs a recorded reason to skip it", async () => {
    await assert.rejects(run(src, [robots("User-agent: *\nDisallow: /legal/"), page(terms())]), (e) => e instanceof ConfigError && /robots\.txt가 이 경로를 막고 있습니다/.test(e.message));
    await assert.rejects(run({ ...src, config: { ...src.config, respectRobots: false } }, [page(terms())]), ConfigError);
  });

  it("says so when a selector finds nothing", async () => {
    await assert.rejects(run({ ...src, config: { select: "#terms-body" } }, [robots(), page(terms())]), /선택자에 맞는 본문이 없습니다/);
  });
});

/* a notice board: newest first, posts opened with javascript */

const board = (rows: Array<[string, string, string]>) => `<html><body>
<header><a href="/main">메인</a></header>
<table class="board"><tbody>
${rows.map(([id, title, date]) => `<tr><td>${id}</td><td class="title"><a href="javascript:fn_view('${id}')">${title}</a></td><td>홍보담당관</td><td>${date}</td></tr>`).join("\n")}
</tbody></table>
<div class="paging"><a href="?page=2">2</a></div>
</body></html>`;

const boardSrc = source({
  adapter: "page.watch",
  url: "https://board.example/press/list.do",
  config: {
    mode: "links",
    select: "table.board",
    linkTemplate: { regex: "fn_view\\('(\\d+)'\\)", url: "https://board.example/press/view.do?id={1}" },
  },
});

describe("page.watch — links", () => {
  const rows: Array<[string, string, string]> = [
    ["103", "가상 플랫폼 3사에 과징금 부과", "2026-10-21"],
    ["102", "개인정보 처리 실태 점검 결과 발표", "2026-10-20"],
    ["101", "상반기 소비자 피해 동향", "2026-10-02"],
  ];

  it("builds post links from the board's script calls and keeps each row's date", () => {
    const links = pageLinks(board(rows), "https://board.example/press/list.do", { select: "table.board", linkTemplate: { regex: /fn_view\('(\d+)'\)/, url: "https://board.example/press/view.do?id={1}" } }, NOW);
    assert.deepEqual(
      links.map((l) => [l.url, l.text, l.date?.toISOString().slice(0, 10)]),
      [
        ["https://board.example/press/view.do?id=103", "가상 플랫폼 3사에 과징금 부과", "2026-10-20"],
        ["https://board.example/press/view.do?id=102", "개인정보 처리 실태 점검 결과 발표", "2026-10-19"],
        ["https://board.example/press/view.do?id=101", "상반기 소비자 피해 동향", "2026-10-01"],
      ],
    );
    assert.equal(links[0].row, "103 홍보담당관 2026-10-21");
  });

  it("files only recent rows on the first run, then each new link once", async () => {
    const first = await run(boardSrc, [robots(), { match: /board\.example\/press/, body: board(rows), headers: html }]);
    assert.deepEqual(
      first.result.items!.map((i) => i.title),
      ["가상 플랫폼 3사에 과징금 부과", "개인정보 처리 실태 점검 결과 발표"],
    );
    assert.equal(first.result.note, "처음 읽음 — 링크 3개 저장, 최근 2건 올림");

    const later = new Date(NOW.getTime() + 3_600_000);
    const next = await run({ ...boardSrc, state: first.state }, [robots(), { match: /board\.example\/press/, body: board([["104", "AI 서비스 약관 시정 권고", "2026-10-22"], ...rows]), headers: html }], { now: later });
    assert.equal(next.result.items!.length, 1);
    const [i] = next.result.items!;
    assert.equal(i.url, "https://board.example/press/view.do?id=104");
    assert.equal(i.publishedAt?.toISOString(), later.toISOString(), "found within a poll of its posting");
    assert.deepEqual(i.payload, { watch: "links", list: "https://board.example/press/list.do" });
  });

  it("does not file an old post that slides back onto the page, or a redesign", async () => {
    const first = await run(boardSrc, [robots(), { match: /board\.example\/press/, body: board(rows), headers: html }]);
    const old = await run({ ...boardSrc, state: first.state }, [robots(), { match: /board\.example\/press/, body: board([...rows, ["100", "작년 소비자 피해 동향", "2026-09-01"]]), headers: html }]);
    assert.deepEqual(old.result.items, []);
    assert.equal(old.result.note, "새 링크 1개 (오래된 1개 제외)");

    const redesigned = Array.from({ length: 30 }, (_, k): [string, string, string] => [String(500 + k), `새 게시판 글 ${k}`, "2026-10-21"]);
    const r = await run({ ...boardSrc, state: first.state }, [robots(), { match: /board\.example\/press/, body: board(redesigned), headers: html }]);
    assert.equal(r.result.items, undefined);
    assert.match(r.result.note ?? "", /페이지 개편으로 보고/);
  });
});
