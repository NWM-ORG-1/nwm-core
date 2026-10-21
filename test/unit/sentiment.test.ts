import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { combine, confidence, marketComponent, socialAggregate, topKeywords, type PostIn } from "@/sentiment/compute";
import { lexiconScore } from "@/sentiment/lexicon";
import { mad, median, robustZ, rollingChange, smooth, toScore } from "@/sentiment/stats";

describe("lexicon", () => {
  it("reads community slang in both directions", () => {
    assert.equal(lexiconScore("비트 1억 가즈아 🚀").label, "bull");
    assert.equal(lexiconScore("떡락 각이다 한강 간다").label, "bear");
    assert.equal(lexiconScore("오늘 점심 뭐 먹지").label, "neutral");
  });
  it("flips negated terms and ignores substrings of English words", () => {
    assert.ok(lexiconScore("이번엔 안 오른다").stance < 0);
    assert.equal(lexiconScore("bullet train").hits, 0);
  });
});

describe("stats", () => {
  it("median / MAD / robust z with a prior until history exists", () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.ok(Math.abs(mad([1, 2, 3, 4, 100]) - 1.4826) < 1e-9);
    const hist = Array.from({ length: 60 }, (_, i) => (i % 2 ? 1 : -1));
    assert.equal(robustZ(10, hist, { median: 0, scale: 1 }).z, 3);
    assert.deepEqual(robustZ(0.5, [], { median: 0, scale: 0.5 }), { z: 1, mature: false });
  });
  it("score mapping, smoothing and rolling change", () => {
    assert.equal(toScore(0), 0);
    assert.ok(Math.abs(toScore(2) - 76.159) < 0.01);
    assert.equal(smooth(undefined, 40, 1), 40);
    assert.ok(Math.abs(smooth(0, 60, 1) - 60 * (1 - 2 ** (-1 / 6))) < 1e-9); // one hourly step of a 6 h half-life
    assert.equal(smooth(10, 60, 5), 60); // a gap restarts the smoothing
    assert.deepEqual(rollingChange([100, 110, 121], 1).map((x) => Math.round(x)), [10, 10]);
  });
});

describe("index aggregation", () => {
  const post = (stance: number, group: PostIn["group"] = "국내 커뮤니티", views = 100): PostIn => ({ group, trustTier: 4, stance, engagement: { views }, llm: false, text: null });

  it("bull/bear shares and per-group scores", () => {
    const agg = socialAggregate([post(0.9), post(0.8), post(0.7), post(-0.6), post(0, "텔레그램")]);
    assert.ok(agg.raw > 0);
    assert.ok(agg.bullish > agg.bearish);
    assert.equal(agg.volume, 5);
    assert.deepEqual(
      agg.groups.map((g) => g.name),
      ["국내 커뮤니티", "텔레그램"],
    );
  });

  it("market inputs are signed (volatility is fear) and combined by weight", () => {
    const m = marketComponent([
      { name: "funding_rate", value: 0.03, history: [], sign: 1 },
      { name: "volatility_24h", value: 1.5, history: [], sign: -1 },
    ])!;
    const inputs = (m.detail as { inputs: Array<{ name: string; z: number }> }).inputs;
    assert.ok(inputs[0].z > 0 && inputs[1].z < 0);
    const { z, coverage } = combine({ social: { z: 1, weight: 0.4, mature: true }, market: null, attention: { z: -1, weight: 0.15, mature: true } });
    assert.ok(Math.abs(z - 0.25 / 0.55) < 1e-9);
    assert.equal(coverage, 0.55);
    assert.ok(confidence(300, 1, 1) === 1 && confidence(30, 0.4, 0) < 0.1);
  });

  it("keywords skip stopwords, numbers, profanity and excluded names", () => {
    const k = topKeywords(["존나 오른다 반감기", "반감기 온다 비트코인", "반감기 씨발 1000", "비트코인 반감기"], 5, ["비트코인"]);
    assert.equal(k[0], "반감기");
    assert.ok(!k.some((w) => /존나|씨발|비트코인|1000/.test(w)));
  });
});
