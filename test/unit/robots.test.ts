import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRobots } from "@/ingest/robots";
import { fixture } from "../helpers";

describe("parseRobots", () => {
  it("DCInside: coin galleries allowed, stock galleries disallowed", () => {
    const r = parseRobots(fixture("robots-dc.txt"));
    assert.equal(r.isAllowed("/board/lists/?id=bitcoins_new1"), true);
    assert.equal(r.isAllowed("/mgallery/board/lists/?id=coin"), true);
    assert.equal(r.isAllowed("/board/lists/?id=stock_new2"), false);
  });
  it("Clien: boards allowed, sold/search/query pages not (longest rule wins, RFC 9309)", () => {
    const r = parseRobots(fixture("robots-clien.txt"));
    assert.equal(r.isAllowed("/service/board/cm_stock"), true);
    assert.equal(r.isAllowed("/service/board/sold/123"), false);
    assert.equal(r.isAllowed("/service/search?q=x"), false);
    assert.equal(r.isAllowed("/other?page=2"), false);
    // "Allow: /service/board/" is longer than "Disallow: /*?*", so board pages with a query stay allowed
    assert.equal(r.isAllowed("/service/board/cm_stock?po=1"), true);
  });
  it("Naver Finance: everything disallowed", () => {
    assert.equal(parseRobots(fixture("robots-naver-finance.txt")).isAllowed("/item/board.naver?code=005930"), false);
  });
  it("a group naming our bot wins over *", () => {
    const r = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: NWM-FeedBot\nAllow: /news/\nDisallow: /\n");
    assert.equal(r.isAllowed("/news/1"), true);
    assert.equal(r.isAllowed("/other"), false);
  });
  it("supports $ and empty Disallow", () => {
    const r = parseRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow:\n");
    assert.equal(r.isAllowed("/a.pdf"), false);
    assert.equal(r.isAllowed("/a.pdf?x"), true);
  });
});
