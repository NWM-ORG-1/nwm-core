import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CheckResult } from "@/db/schema";
import type { Draft } from "@/lib/content/blocks";
import { ago, cardKeyboard, cardText, escapeHtml, openChecks, parseCallback, parseQuickEdits, REJECT_REASONS, statusText, type CardInput, type StatusSnapshot } from "@/server/telegram/format";

/* fixtures — fictional companies only */
const ID = "3f2b7c1e-8a4d-4f6b-9c2e-1d5a7b9c0e12";
const draft = (over: Partial<Draft> = {}): Draft => ({
  title: "누리AI랩, 언어모델 누리-3 공개",
  dek: "누리AI랩이 **700억 개** 매개변수 모델을 공개했다.",
  blocks: [
    { type: "why", items: ["국내 AI 기업의 자체 모델 경쟁이 이어진다."] },
    { type: "numbers", items: [{ value: "700억 개", label: "매개변수", trend: "up" }] },
    { type: "section", label: "context", text: "기업용 API로 먼저 <제공>한다.", bullets: ["오픈소스는 내년"] },
    { type: "next", items: ["오픈소스 버전 공개 시점"] },
  ],
  tags: [],
  tickers: [],
  sources: [{ name: "누리AI랩 보도자료", kind: "press" }],
  ...over,
});
const check = (id: CheckResult["id"], ok: boolean, message = "", blocking = true): CheckResult => ({ id, ok, blocking, message });
const card = (over: Partial<CardInput> = {}): CardInput => ({
  candidateId: ID,
  draft: draft(),
  beat: "ai",
  mode: "feed_draft",
  desk: { score: 78, lowRisk: false },
  checks: [check("legal", false, "편집자가 직접 확인해야 합니다"), check("ai_label", false, "책임 편집자가 필요합니다"), check("license", false, "라이선스 미검토: 누리AI랩 보도자료")],
  aiNote: "AI 데스크 78점 (AI 모델 공개): 공식 발표 · 원문에서 찾지 못한 수치 1건 · 세 번째 메모",
  ...over,
});

describe("telegram card", () => {
  it("shows the desk's call, the whole draft and what still blocks it — escaped", () => {
    const t = cardText(card());
    assert.match(t, /^🆕 <b>AI 데스크 초안<\/b> · 78점 · AI$/m);
    assert.match(t, /<b>누리AI랩, 언어모델 누리-3 공개<\/b>/);
    assert.match(t, /<b>700억 개<\/b> 매개변수 모델/, "**bold** in the draft becomes <b>");
    assert.match(t, /기업용 API로 먼저 &lt;제공&gt;한다\./, "draft text is escaped");
    assert.match(t, /▲ <b>700억 개<\/b> 매개변수/);
    assert.match(t, /⚠️ 라이선스·인용 범위: 라이선스 미검토/);
    assert.doesNotMatch(t, /법률 검토|책임 편집자/, "legal and the editor's name come with 발행, not as warnings");
    assert.match(t, /💬 AI 데스크 78점 \(AI 모델 공개\): 공식 발표 \/ 원문에서 찾지 못한 수치 1건$/m);
    assert.match(cardText(card({ desk: null, mode: "data_auto" })), /^🆕 <b>자동 기사 초안<\/b> · AI$/m);
    assert.match(cardText(card({ desk: { score: 55, lowRisk: true, explore: true } })), /55점 · AI · 저위험 · 탐색$/m);
  });

  it("puts the outcome first and stays under Telegram's length limit", () => {
    assert.match(cardText(card(), { kind: "published", by: "한서윤", at: "10.24 09:12" }), /^✅ <b>발행됨<\/b> · 한서윤 · 10\.24 09:12\n🆕/);
    assert.match(cardText(card(), { kind: "rejected", reason: "홍보성", by: null }), /^🗑 <b>반려<\/b> · 홍보성\n/);
    const long = draft({ blocks: Array.from({ length: 16 }, () => ({ type: "section" as const, label: "context" as const, text: "가".repeat(590) })) });
    const t = cardText(card({ draft: long }), { kind: "replaced" });
    assert.ok(t.length < 4096, `${t.length} characters`);
    assert.match(t, /나머지는 미리보기에서 보세요/);
    assert.match(t, /⚠️ 라이선스·인용 범위/, "the checks survive the cut");
    assert.equal(escapeHtml(`<a href="x">&</a>`), `&lt;a href="x"&gt;&amp;&lt;/a&gt;`);
  });

  it("lists only the checks an editor still has to clear", () => {
    const ids = openChecks([check("legal", false), check("ai_label", false), check("numbers", false, "", false), check("format", true), { ...check("license", false), overridden: { by: "a", reason: "b", at: "c" } }]).map((c) => c.id);
    assert.deepEqual(ids, ["numbers"]);
  });
});

describe("telegram buttons", () => {
  const site = "https://newweb.media";
  it("fit Telegram's 64-byte callback data and round-trip", () => {
    for (const mode of ["open", "confirm", "reject"] as const) {
      for (const b of cardKeyboard({ candidateId: ID, lockVersion: 123456, site }, mode).flat()) {
        if (b.callback_data) {
          assert.ok(Buffer.byteLength(b.callback_data) <= 64, b.callback_data);
          assert.ok(parseCallback(b.callback_data), b.callback_data);
        } else assert.match(b.url ?? "", /^https:\/\/newweb\.media\/admin\/candidates\//);
      }
    }
    assert.deepEqual(parseCallback(`ok:${ID}:7`), { action: "ok", id: ID, lockVersion: 7 });
    assert.deepEqual(parseCallback(`rj:${ID}:${REJECT_REASONS.length}`), { action: "rj", id: ID, reason: REJECT_REASONS.length });
    assert.equal(parseCallback(`rj:${ID}:${REJECT_REASONS.length + 1}`), null);
    assert.equal(parseCallback(`ok:${ID}:-1`), null);
    assert.equal(parseCallback("pub:not-a-uuid"), null);
    assert.equal(parseCallback(`drop:${ID}`), null);
    assert.equal(parseCallback(undefined), null);
    assert.deepEqual(cardKeyboard({ candidateId: ID, lockVersion: 1, site, slug: "261024-abcdef" }, "done"), [[{ text: "📰 기사 보기", url: `${site}/a/261024-abcdef` }]]);
    assert.deepEqual(cardKeyboard({ candidateId: ID, lockVersion: 1, site }, "done"), []);
  });

  it("reads 제목:/요약: replies as literal edits and anything else as an instruction", () => {
    assert.deepEqual(parseQuickEdits("제목: 새 제목\n요약：새 요약 문장"), { title: "새 제목", dek: "새 요약 문장" });
    assert.deepEqual(parseQuickEdits("  제목 :  띄어쓴 제목 "), { title: "띄어쓴 제목" });
    assert.equal(parseQuickEdits("제목: 새 제목\n둘째 단락은 빼 줘"), null);
    assert.equal(parseQuickEdits("더 짧게"), null);
    assert.equal(parseQuickEdits("   "), null);
  });
});

describe("/status", () => {
  const NOW = new Date("2026-10-24T07:55:00Z"); // 16:55 KST
  const minus = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  const snap = (over: Partial<StatusSnapshot> = {}): StatusSnapshot => ({
    workerBeatAt: minus(12_000),
    sources: { active: 22, paused: 3, error: 0, failing: [] },
    items: { hour: 18, day: 412, lastCheckAt: minus(60_000), lastNewAt: minus(300_000) },
    desk: { enabled: true, cadenceMin: 60, dailyDrafts: 10, draftedToday: 3, queued: 2, lastRun: { at: minus(14 * 60_000), seen: 12, stories: 4, drafted: 1, error: null }, spendUsd: 4.21, budgetUsd: 40, allUsd: 6.03, capUsd: 50 },
    newsroom: { review: 5, scheduled: 1, publishedToday: 2 },
    lessons: { notes: 3, waiting: 1 },
    ...over,
  });

  it("reads at a glance when everything runs", () => {
    assert.equal(
      statusText(snap(), NOW),
      [
        "📡 <b>뉴웹미디어 상태</b> · 10월 24일 (토) 16:55",
        "",
        "<b>워커</b> ✅ 정상 · 신호 12초 전",
        "<b>수집</b> 소스 22개 작동 · 쉼 3",
        " 새 자료 1시간 18건 · 24시간 412건 · 마지막 확인 1분 전",
        "<b>AI 데스크</b> 켜짐 · 1시간마다 · 오늘 초안 3/10 · 대기 2",
        " 마지막 실행 14분 전 — 자료 12건 · 사건 4건 · 초안 1건",
        " 이번 달 $4.21 / $40.00 · 뉴스룸 전체 $6.03 / $50.00",
        "<b>뉴스룸</b> 검토 대기 5 · 예약 1 · 오늘 발행 2",
        "<b>편집 노트</b> 3개 · 고친 초안 1건 대기",
      ].join("\n"),
    );
  });

  it("puts warnings first in the line: a quiet worker, failing sources, a failed run, a spent budget", () => {
    const t = statusText(
      snap({
        workerBeatAt: minus(9 * 60_000),
        sources: { active: 21, paused: 3, error: 1, failing: [{ name: "가상부 <보도자료>", error: "HTTP 503 Service Unavailable", lastSuccessAt: minus(3 * 3_600_000) }] },
        desk: { ...snap().desk, enabled: false, lastRun: { at: minus(2 * 86_400_000), seen: 0, stories: 0, drafted: 0, error: "ANTHROPIC_API_KEY가 없습니다" }, spendUsd: 40 },
      }),
      NOW,
    );
    assert.match(t, /^<b>워커<\/b> ⚠️ 신호 없음 · 마지막 9분 전/m);
    assert.match(t, /^<b>수집<\/b> 소스 21개 작동 · ⚠️ 오류 1 · 쉼 3$/m);
    assert.match(t, /^ ⚠️ 가상부 &lt;보도자료&gt; — HTTP 503 Service Unavailable \(마지막 성공 3시간 전\)$/m, "escaped");
    assert.match(t, /^<b>AI 데스크<\/b> 꺼짐 · 오늘 초안/m);
    assert.match(t, /^ ⚠️ 마지막 실행 2일 전 실패 — ANTHROPIC_API_KEY가 없습니다$/m);
    assert.match(t, /^ ⚠️ 이번 달 \$40\.00 \/ \$40\.00/m);
    assert.equal(ago(null, NOW), "기록 없음");
  });
});
