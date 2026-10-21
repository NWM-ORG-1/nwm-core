import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFeed, parseXml } from "@/ingest/feed";
import { fixture } from "../helpers";

describe("parseFeed", () => {
  it("reads GitHub release Atom with escaped HTML content", () => {
    const f = parseFeed(fixture("github-releases.atom"), "https://github.com/vercel/next.js/releases.atom");
    assert.equal(f.format, "atom");
    assert.equal(f.entries.length, 1);
    const e = f.entries[0];
    assert.equal(e.title, "v16.5.0-canary.21");
    assert.equal(e.link, "https://github.com/vercel/next.js/releases/tag/v16.5.0-canary.21");
    assert.match(e.summary, /^Core Changes\n+Defer app router HMR refresh until the router is initialized: #100113$/);
    assert.ok(!e.summary.includes("<"));
    assert.deepEqual(e.authors, ["next-js-bot[bot]"]);
  });

  it("trims CDATA padding and reads Korean date-only pubDate as KST", () => {
    const f = parseFeed(fixture("kisa.rss"), "https://www.boho.or.kr/kr/rss.do?bbsId=B0000133");
    assert.equal(f.entries[0].title, "PHP 제품 보안 업데이트 권고");
    assert.ok(f.entries[0].link!.startsWith("https://www.boho.or.kr/kr/bbs/view.do?"));
    assert.equal(f.entries[0].published!.toISOString(), "2026-10-20T15:00:00.000Z");
  });

  it("turns HTML that was escaped inside CDATA into plain text (BOK)", () => {
    const f = parseFeed(fixture("bok.rss"), "https://www.bok.or.kr/");
    assert.equal(f.entries[0].summary, "*자세한 내용은 첨부파일을 참조하시길 바랍니다.");
  });

  it("keeps namespaced extras (arXiv announce type)", () => {
    const f = parseFeed(fixture("arxiv.rss"), "https://rss.arxiv.org/rss/cs.AI");
    assert.equal(f.entries[0].extra["arxiv:announce_type"], "new");
    assert.equal(f.entries[1].extra["arxiv:announce_type"], "replace");
  });

  it("survives entity-heavy feeds (SEC getcurrent × 150 entries)", () => {
    const xml = fixture("sec-getcurrent.atom");
    const entry = xml.slice(xml.indexOf("<entry>"), xml.indexOf("</entry>") + 8);
    const big = xml.replace("</feed>", `${entry.repeat(150)}</feed>`);
    const f = parseFeed(big, "https://www.sec.gov/");
    assert.equal(f.entries.length, 153);
    assert.match(f.entries[0].summary, /Item 8\.01: Other Events/);
  });

  it("never expands DOCTYPE entities", () => {
    const evil = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><rss><channel><title>&b;</title></channel></rss>`;
    const f = parseFeed(evil, "https://x.test/");
    assert.ok(f.title.length < 20, f.title);
  });

  it("rejects non-XML bodies with a readable error", () => {
    assert.throws(() => parseFeed("현재 RSS 서비스 점검 중입니다.", "https://www.fsc.go.kr/"), /not XML/);
  });

  it("exposes OData property bags (Treasury)", () => {
    const doc = parseXml(fixture("treasury.xml")) as { feed: { entry: Array<{ content: { "m:properties": Record<string, { "#text": string }> } }> } };
    assert.equal(doc.feed.entry[1].content["m:properties"]["d:BC_10YEAR"]["#text"], "5.20");
  });
});
