import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractAssets, guessBeat, passesKeywords, scoreItem } from "@/ingest/classify";

describe("extractAssets", () => {
  it("links slang and tickers to canonical ids, in order", () => {
    assert.deepEqual(extractAssets("비트코인 1억 돌파, $SOL 급등… 삼전 하닉 동반 상승"), ["BTC", "SOL", "005930", "000660"]);
  });
  it("reads community shorthand", () => {
    assert.deepEqual(extractAssets("비트 가즈아, 이더도 간다"), ["BTC", "ETH"]);
    assert.deepEqual(extractAssets("비트겟 상장 / 8비트 게임"), []);
  });
  it("avoids common false friends", () => {
    assert.deepEqual(extractAssets("ETH Zurich researchers / 도지사 선거 / 애플리케이션 / 이더넷 포트"), []);
    assert.deepEqual(extractAssets("sol de verano, Eth"), []);
  });
});

describe("guessBeat", () => {
  it("prefers words over the source's beat when they are clear", () => {
    assert.equal(guessBeat("엔비디아, 새 AI 칩 공개", "생성형 AI 추론 성능 2배", ["tech"]), "ai");
    assert.equal(guessBeat("업비트, 신규 코인 거래지원", "", ["economy"]), "crypto");
  });
  it("falls back to the source's first beat", () => {
    assert.equal(guessBeat("공지", "", ["economy", "tech"]), "economy");
    assert.equal(guessBeat("공지", "", []), null);
  });
});

describe("scoreItem", () => {
  const now = new Date("2026-10-21T18:00:00Z");
  it("ranks official breaking items high and duplicates low", () => {
    const hot = scoreItem({ trustTier: 1, signalOnly: false, weight: 0.9, title: "[속보] 업비트 유의 종목 지정", now });
    const dup = scoreItem({ trustTier: 1, signalOnly: false, weight: 0.9, title: "[속보] 업비트 유의 종목 지정", duplicate: true, now });
    const old = scoreItem({ trustTier: 3, signalOnly: true, weight: 0.2, title: "old", publishedAt: new Date("2026-10-10T00:00:00Z"), now });
    assert.ok(hot >= 80, String(hot));
    assert.equal(dup, 10);
    assert.ok(old <= 15, String(old));
  });
  it("stays within 0–100", () => {
    const s = scoreItem({ trustTier: 1, signalOnly: false, weight: 1, title: "속보 해킹 파산", boost: ["해킹", "파산", "속보"], now });
    assert.ok(s <= 100);
  });
});

describe("passesKeywords", () => {
  it("applies include and exclude case-insensitively", () => {
    assert.equal(passesKeywords("New LLM Agent", ["llm"], ["crypto"]), true);
    assert.equal(passesKeywords("LLM for crypto", ["llm"], ["crypto"]), false);
    assert.equal(passesKeywords("Other", ["llm"]), false);
  });
});
