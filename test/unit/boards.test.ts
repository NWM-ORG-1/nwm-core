import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readRows } from "@/ingest/adapters/social/html-list";
import { parseChannelPage } from "@/ingest/adapters/social/telegram";
import { CATALOG } from "@/ingest/catalog";
import { fixture } from "../helpers";

const cfg = (slug: string) => {
  const e = CATALOG.find((x) => x.slug === slug);
  if (!e) throw new Error(slug);
  return e.config as Parameters<typeof readRows>[2];
};
const NOW = new Date("2026-10-21T18:00:00Z");

describe("community list presets (live markup)", () => {
  it("DCInside: user posts only, with counts and KST times", () => {
    const rows = readRows(fixture("dc-list.html"), "https://gall.dcinside.com/board/lists/?id=bitcoins_new1", cfg("dc-bitcoin"), NOW);
    assert.deepEqual(
      rows.map((r) => r.id),
      ["9597149", "9597147"],
    );
    const [a, b] = rows;
    assert.equal(a.title, "또오 가격 안맞네");
    assert.equal(a.link, "https://gall.dcinside.com/board/view/?id=bitcoins_new1&no=9597149&page=1");
    assert.equal(a.time!.toISOString(), "2026-10-21T17:49:54.000Z");
    assert.equal(a.author, "고객만족도1점");
    assert.equal(a.views, 11);
    assert.equal(a.comments, 0);
    assert.equal(b.title, "비트 1억 3천 가즈아 & 존버");
    assert.equal(b.comments, 3);
    assert.equal(b.likes, 2);
  });

  it("Clien: title attribute, timestamp and data-* counts", () => {
    const rows = readRows(fixture("clien-list.html"), "https://www.clien.net/service/board/cm_stock", cfg("clien-stock"), NOW);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, "19280933");
    assert.equal(rows[0].title, "미국 신문 비지니스 1면 헤드라인 모음 10/21 수 (영문)");
    assert.equal(rows[0].time!.toISOString(), "2026-10-21T14:15:53.000Z");
    assert.equal(rows[0].views, 31);
    assert.equal(rows[0].author, "완전연소음메");
  });

  it("Ppomppu: skips notices, reads time from title, first number of '3 - 1'", () => {
    const rows = readRows(fixture("ppomppu-list.html"), "https://www.ppomppu.co.kr/zboard/zboard.php?id=stock", cfg("ppomppu-stock"), NOW);
    assert.deepEqual(
      rows.map((r) => r.id),
      ["445236", "445235"],
    );
    assert.equal(rows[0].title, '트럼프 계좌 "반도체 팔고, 메타 샀다"');
    assert.equal(rows[0].link, "https://www.ppomppu.co.kr/zboard/view.php?id=stock&page=1&divpage=86&no=445236");
    assert.equal(rows[0].time!.toISOString(), "2026-10-21T18:08:02.000Z");
    assert.equal(rows[0].likes, 3);
    assert.equal(rows[0].comments, 12);
    assert.equal(rows[0].author, "onlyonly1");
    assert.equal(rows[1].likes, undefined);
  });
});

describe("telegram t.me/s", () => {
  it("reads id, text, views and time; media without caption has empty text", () => {
    const page = parseChannelPage(fixture("telegram-channel.html"), "coinnesskr");
    assert.equal(page.before, 234970);
    assert.deepEqual(
      page.messages.map((m) => m.id),
      [234970, 234971, 234972],
    );
    const [m] = page.messages;
    assert.match(m.text, /^\[캐나다 P2P 암호화폐 거래량, 임시 비자 발급량과 동조화\]\n체이널리시스에 따르면/);
    assert.equal(m.views, 12300);
    assert.equal(m.date!.toISOString(), "2026-10-21T14:50:02.000Z");
    assert.equal(m.link, "https://t.me/coinnesskr/234970");
    assert.match(page.messages[1].text, /"BTC \$8\.5만~\$8\.75만/);
    assert.equal(page.messages[2].text, "");
  });
});
