import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Draft } from "@/lib/content/blocks";
import { cleanScope, draftDiff, lessonsFor, lessonsPrompt, lessonWeight, MAX_LESSONS, mergeLessons, type Lesson, type LessonCase, type LessonOut } from "@/server/desk/lessons";
import { draftPrompt } from "@/server/generator/claude";

/* fixtures — a fictional ministry and company */
const NOW = new Date("2026-10-24T03:00:00Z");
const DAY = 86_400_000;
const ai: Draft = {
  title: "가상부, 반도체 규제 손질로 투자·연구·지원 시간 재설계",
  dek: "가상부가 23일 반도체 인허가 기간을 절반으로 줄이는 방안을 내놨다.",
  blocks: [
    { type: "why", items: ["공장 가동 시점이 앞당겨질 수 있다."] },
    { type: "section", label: "big_picture", text: "반도체는 설비 투자 규모가 큰 산업이다." },
    { type: "section", label: "zoom_in", text: "통합 심사로 용수·전력 인허가를 함께 본다." },
    { type: "next", items: ["세부 지침 확정 시점"] },
  ],
  tags: [],
  tickers: [],
  sources: [],
};
const lesson = (over: Partial<Lesson> = {}): Lesson => ({ id: crypto.randomUUID(), text: "제목은 핵심 수치를 앞에 둔다.", scope: "all", hits: 2, lastSeenAt: new Date(NOW.getTime() - 5 * DAY), pinned: false, origin: "ai", ...over });
const kase = (n: number, over: Partial<LessonCase> = {}): LessonCase => ({ n, candidateId: `c${n}`, beat: "economy", sources: ["가상부 보도자료"], diff: ["제목: \"a\" → \"b\""], instructions: [], ...over });
const answer = (over: Partial<LessonOut> = {}): LessonOut => ({ lessons: [], drop: [], notes: "", ...over });

describe("draft diff", () => {
  it("is empty for a draft published as written", () => {
    assert.deepEqual(draftDiff(ai, structuredClone(ai)), []);
  });

  it("names what the editor rewrote, removed and added — with the reader-facing labels", () => {
    const final: Draft = {
      ...ai,
      title: "가상부, 반도체 인허가 18개월→9개월",
      blocks: [
        { type: "why", items: ["공장 가동이 최대 9개월 빨라진다."] },
        { type: "section", label: "zoom_in", text: "통합 심사로 용수·전력 인허가를 함께 본다." },
        { type: "next", items: ["세부 지침 확정 시점"] },
        { type: "section", label: "yes_but", text: "지자체 협의가 늦어지면 단축 효과가 줄어든다." },
      ],
    };
    assert.deepEqual(draftDiff(ai, final), [
      '제목: "가상부, 반도체 규제 손질로 투자·연구·지원 시간 재설계" → "가상부, 반도체 인허가 18개월→9개월"',
      '고친 블록 [왜 중요한가]: "공장 가동 시점이 앞당겨질 수 있다." → "공장 가동이 최대 9개월 빨라진다."',
      "뺀 블록 [넓게 보면]: 반도체는 설비 투자 규모가 큰 산업이다.",
      "더한 블록 [짚어볼 점]: 지자체 협의가 늦어지면 단축 효과가 줄어든다.",
    ]);
  });
});

describe("편집 노트 merge", () => {
  it("adds a note only with a case behind it, and reinforces the one it continues", () => {
    const n1 = lesson({ hits: 2 });
    const { keep, dropped } = mergeLessons(
      [n1],
      answer({
        lessons: [
          { keep: "N1", text: "제목은 핵심 수치를 앞에 쓴다.", scope: "all", cases: [1, 2, 9] },
          { keep: "", text: "정부 보도자료 기사에서 '넓게 보면' 단락은 빼고 시행 일정을 쓴다.", scope: "beat:economy", cases: [2] },
          { keep: "", text: "근거 없는 노트", scope: "all", cases: [] },
          { keep: "", text: "없는 사례를 댄 노트", scope: "all", cases: [7] },
        ],
      }),
      [kase(1), kase(2)],
      NOW,
    );
    assert.deepEqual(dropped, []);
    assert.equal(keep.length, 2);
    const kept = keep.find((l) => l.id === n1.id)!;
    assert.equal(kept.text, "제목은 핵심 수치를 앞에 쓴다.");
    assert.equal(kept.hits, 4, "two valid cases; case 9 does not exist");
    assert.equal(kept.lastSeenAt.getTime(), NOW.getTime());
    const fresh = keep.find((l) => !l.id)!;
    assert.equal(fresh.scope, "beat:economy");
    assert.equal(fresh.hits, 1);
  });

  it("never rewrites or drops a pinned note, but drops others on request", () => {
    const pinned = lesson({ text: "편집자가 고정한 노트", pinned: true, origin: "editor" });
    const other = lesson({ text: "곧 뺄 노트" });
    const { keep, dropped } = mergeLessons([pinned, other], answer({ lessons: [{ keep: "N1", text: "바꾼 문장", scope: "beat:ai", cases: [1] }], drop: ["N1", "n2"] }), [kase(1)], NOW);
    assert.deepEqual(dropped, [other.id]);
    assert.equal(keep[0].text, "편집자가 고정한 노트");
    assert.equal(keep[0].scope, "all");
    assert.equal(keep[0].hits, pinned.hits + 1, "evidence still counts");
  });

  it("lets notes fade: one sighting is gone in about a month unless pinned", () => {
    const old = lesson({ hits: 1, lastSeenAt: new Date(NOW.getTime() - 40 * DAY) });
    const strong = lesson({ text: "여러 번 확인된 노트", hits: 6, lastSeenAt: new Date(NOW.getTime() - 40 * DAY) });
    const pinned = lesson({ text: "고정", hits: 1, pinned: true, lastSeenAt: new Date(NOW.getTime() - 400 * DAY) });
    assert.ok(lessonWeight(old, NOW) < 0.5 && lessonWeight(strong, NOW) > 2);
    const { keep, dropped } = mergeLessons([old, strong, pinned], answer(), [], NOW);
    assert.deepEqual(dropped, [old.id]);
    assert.deepEqual(keep.map((l) => l.text).sort(), ["고정", "여러 번 확인된 노트"]);
  });

  it(`never keeps more than ${MAX_LESSONS}: the weakest go first`, () => {
    const many = Array.from({ length: MAX_LESSONS + 2 }, (_, i) => lesson({ text: `노트 ${i}`, hits: i + 1 }));
    const { keep, dropped } = mergeLessons(many, answer(), [], NOW);
    assert.equal(keep.length, MAX_LESSONS);
    assert.deepEqual(dropped, [many[0].id, many[1].id]);
  });

  it("keeps scopes it understands and skips a duplicate", () => {
    assert.equal(cleanScope("beat:crypto"), "beat:crypto");
    assert.equal(cleanScope("beat:sports"), "all");
    assert.equal(cleanScope("source:가상부 보도자료", ["가상부 보도자료"]), "source:가상부 보도자료");
    assert.equal(cleanScope("source:모르는 곳", ["가상부 보도자료"]), "all");
    const n1 = lesson();
    const { keep } = mergeLessons([n1], answer({ lessons: [{ keep: "", text: " 제목은 핵심 수치를 앞에 둔다. ", scope: "all", cases: [1] }] }), [kase(1)], NOW);
    assert.equal(keep.length, 1);
  });
});

describe("편집 노트 in prompts", () => {
  const notes = [
    lesson({ text: "모든 초안 노트", scope: "all", hits: 3 }),
    lesson({ text: "경제 노트", scope: "beat:economy", hits: 5 }),
    lesson({ text: "AI 노트", scope: "beat:ai", hits: 9 }),
    lesson({ text: "가상부 노트", scope: "source:가상부 보도자료", hits: 1 }),
  ];

  it("a draft reads the notes for all drafts, its beat and its sources, strongest first", () => {
    assert.deepEqual(lessonsFor(notes, { beat: "economy", sources: ["가상부 보도자료"] }, NOW), ["경제 노트", "모든 초안 노트", "가상부 노트"]);
    assert.deepEqual(lessonsFor(notes, { beat: "ai", sources: [] }, NOW, 1), ["AI 노트"]);
    const faded = lesson({ text: "빛바랜 노트", hits: 1, lastSeenAt: new Date(NOW.getTime() - 45 * DAY) });
    assert.deepEqual(lessonsFor([faded, lesson({ ...faded, text: "고정 노트", pinned: true })], { beat: "ai", sources: [] }, NOW), ["고정 노트"], "a faded note is out before the sweep");
    const p = draftPrompt({ items: [], beat: "economy", mode: "feed_draft", now: NOW, lessons: ["경제 노트"] });
    assert.match(p, /편집 노트 — 편집자들이 지난 초안을 고친 방향입니다[^\n]*\n- 경제 노트/);
    assert.doesNotMatch(draftPrompt({ items: [], beat: "economy", mode: "feed_draft", now: NOW }), /편집 노트/);
  });

  it("the review sees the current notes and each case with the editor's instructions", () => {
    const p = lessonsPrompt([notes[0], lesson({ text: "고정 노트", pinned: true })], [kase(1, { instructions: ["더 짧게"] }), kase(2)], NOW);
    assert.match(p, /^<지금 노트>\nN1 \[all · 근거 3건 · 마지막 5일 전\] 모든 초안 노트\nN2 \[all · 근거 2건 · 고정 · 마지막 5일 전\] 고정 노트\n<\/지금 노트>/);
    assert.match(p, /<사례 번호="1" 분야="economy" 출처="가상부 보도자료">\n제목: "a" → "b"\n편집자 지시: 더 짧게\n<\/사례>/);
    assert.match(p, /편집자가 고쳐서 발행한 초안 2건/);
  });
});
