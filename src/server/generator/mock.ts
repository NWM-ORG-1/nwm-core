import type { Block, Draft, KeyNumber } from "@/lib/content/blocks";
import type { Beat } from "@/db/schema";
import { hashString } from "@/lib/format";
import type { AssistAction, AssistResult, DraftGenerator, GenItem, GeneratedDraft } from "./types";

/**
 * Deterministic mock generator (phase 1). It never invents facts: every sentence
 * is either lifted from the input items or a clearly generic template, so the
 * newsroom flow can be exercised end-to-end before a real model is connected.
 */

const WHY: Record<Beat, string[]> = {
  ai: [
    "국내 AI 생태계의 경쟁 구도와 비용 구조가 바뀔 수 있는 신호다.",
    "모델·인프라 투자 흐름이 어디로 쏠리는지 보여준다.",
    "기업들의 AI 도입 속도와 규제 대응 전략에 직접 영향을 준다.",
  ],
  crypto: [
    "디지털자산 시장의 유동성과 투자자 심리에 바로 반영되는 변화다.",
    "온체인 자금 흐름이 가격보다 먼저 방향을 알려주는 경우가 많다.",
    "거래소·프로토콜 리스크가 개인투자자 손익으로 직결된다.",
  ],
  economy: [
    "금리·환율 경로에 대한 시장의 기대를 다시 계산하게 만든다.",
    "가계와 기업의 자금 조달 비용에 영향을 준다.",
    "수출과 내수의 온도 차가 어디서 벌어지는지 보여준다.",
  ],
  tech: [
    "공급망과 고객사 구도가 바뀌면 실적 전망 전체가 움직인다.",
    "기술 경쟁의 승부처가 어디로 옮겨가는지 보여준다.",
    "제품 일정과 규제 이슈가 시장 기대에 바로 반영된다.",
  ],
  sentiment: [
    "군중 심리의 급변은 가격 변동성의 선행 지표가 되곤 한다.",
    "개인투자자 쏠림이 커질수록 반대 방향 리스크도 커진다.",
    "심리 지표와 실제 자금 흐름의 괴리가 다음 국면의 힌트다.",
  ],
};

const NEXT: Record<Beat, string[]> = {
  ai: ["경쟁사의 대응 발표", "실사용 벤치마크와 비용 데이터", "규제 당국의 가이드라인 해석"],
  crypto: ["거래소 순유입·순유출 추이", "펀딩비와 미결제약정 변화", "후속 공지와 일정 확정 여부"],
  economy: ["다음 통계 발표 일정", "환율 1,400원선 공방", "채권시장 금리 반응"],
  tech: ["고객사 공급 계약 공시", "수율·증설 관련 후속 발표", "경쟁사 제품 로드맵"],
  sentiment: ["심리 지표의 24시간 내 되돌림 여부", "레버리지 상품 자금 흐름", "커뮤니티 언급량 정점 통과 시점"],
};

const PREFIX = /^\s*(\[[^\]]{1,20}\]\s*)+/;
const NOISE = /\s*\((모의|sample|신호용)\)\s*/gi;

export function cleanTitle(t: string): string {
  let s = t.replace(PREFIX, "").replace(NOISE, " ").replace(/\s+—\s+.*$/, "").replace(/\s+/g, " ").trim();
  if (s.length > 40) {
    const cut = s.slice(0, 40);
    const sp = cut.lastIndexOf(" ");
    s = (sp > 20 ? cut.slice(0, sp) : cut).trim();
  }
  return s;
}

export function firstSentence(t: string, max = 95): string {
  const s = t.replace(NOISE, " ").replace(/\s+/g, " ").trim();
  const m = s.match(/^(.+?[.!?。]|.+?(?:다|요)\.)(\s|$)/);
  const out = (m ? m[1] : s).trim();
  return out.length > max ? `${out.slice(0, max - 1).trim()}…` : out;
}

const NUM_RE = /([+\-−]?\$?₩?\d[\d,]*(?:\.\d+)?\s?(?:%p|%|조\s?원|억\s?원|만\s?원|조|억|만|달러|원|bp|개|배|건|명)?)/g;

export function extractNumbers(texts: string[], max = 3): KeyNumber[] {
  const out: KeyNumber[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(NUM_RE)) {
      const raw = m[1].trim();
      if (!/[%조억만달러원bp개배건명$₩]/.test(raw)) continue; // bare integers (years, ids) are noise
      if (seen.has(raw)) continue;
      seen.add(raw);
      const before = text.slice(Math.max(0, (m.index ?? 0) - 18), m.index).replace(/[\[\]()·,]/g, " ").trim();
      const label = before.split(/\s+/).slice(-3).join(" ") || "핵심 수치";
      const trend = /^[+]|증가|상승|급등|순유입/.test(raw + before) ? "up" : /^[-−]|감소|하락|급락|순유출/.test(raw + before) ? "down" : undefined;
      out.push({ value: raw.replace(/\s+/g, ""), label: label.slice(0, 20), ...(trend ? { trend } : {}) });
      if (out.length >= max) return out;
    }
  }
  return out;
}

function pick<T>(arr: T[], seed: number, n: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < arr.length && out.length < n; i++) out.push(arr[(seed + i) % arr.length]);
  return out;
}

export function sourceKind(kind: string, tier: number): "filing" | "press" | "data" | "social" | "report" | "news" | "paper" {
  if (tier >= 3) return "social"; // community / unverified sources are never labelled primary
  if (kind === "api" || kind === "ws") return "data";
  if (kind === "press_pdf" || kind === "rss") return "press";
  if (kind === "scrape") return "social";
  return "news";
}

const MOCK_ID = "mock-1";
const MOCK_VERSION = "1.0.0";

export const mockGenerator: DraftGenerator = {
  id: MOCK_ID,
  version: MOCK_VERSION,

  async draftFromItems({ items, beat, mode, idea }): Promise<GeneratedDraft> {
    const usable = items.filter((i) => !i.signalOnly);
    const primary = usable[0] ?? items[0];
    const seed = hashString((primary?.id ?? "") + (idea ?? "") + beat);
    const notes: string[] = [];

    let title: string;
    let dek: string;
    const blocks: Block[] = [];

    if (primary) {
      title = cleanTitle(primary.title);
      dek = firstSentence(primary.summary || primary.title);
    } else {
      const ideaText = (idea ?? "").trim();
      title = cleanTitle(ideaText.split(/[,.?!]/)[0] ?? "새 기획");
      dek = firstSentence(ideaText || "편집자 기획을 바탕으로 쟁점을 정리한다.");
      notes.push("원천 자료 없이 아이디어만으로 생성 — 1차 출처를 연결해야 발행할 수 있습니다.");
    }

    blocks.push({ type: "why", items: pick(WHY[beat], seed, 2) });

    const nums = extractNumbers(usable.flatMap((i) => [i.title, i.summary]));
    if (nums.length >= 2) blocks.push({ type: "numbers", items: nums });
    else if (nums.length === 1) notes.push("추출된 수치가 1건뿐 — 숫자 블록을 보강하세요.");

    const supporting = usable.slice(1, 4);
    if (supporting.length) {
      blocks.push({
        type: "section",
        label: "big_picture",
        bullets: supporting.map((s) => firstSentence(s.summary || s.title, 120)),
      });
    }
    if (idea) blocks.push({ type: "section", label: "context", text: firstSentence(idea, 280) });

    blocks.push({ type: "next", items: pick(NEXT[beat], seed, 2) });

    if (items.some((i) => i.signalOnly)) notes.push("신호 전용 소스 포함 — 해당 내용은 재작성·인용하지 말고 1차 자료로 확인하세요.");
    if (usable.length && usable.every((i) => i.trustTier >= 3)) notes.push("출처가 커뮤니티·미확인 등급뿐 — 1차 출처 보강 필요.");
    if (usable.length === 1) notes.push("단일 출처 — 교차 확인 필요.");
    if (mode === "data_auto") notes.push("데이터 자동 기사는 템플릿 생성 사용을 권장합니다.");

    const tags = [...new Set(usable.flatMap((i) => i.entities))].slice(0, 4);

    return {
      draft: {
        title,
        dek,
        blocks,
        tags,
        tickers: [],
        sources: usable.slice(0, 5).map((i) => ({ name: i.sourceName, kind: sourceKind(i.sourceKind, i.trustTier) })),
        sentiment: null,
      },
      aiNote: notes.length ? notes.join(" · ") : null,
      meta: {
        id: MOCK_ID,
        version: MOCK_VERSION,
        generatedAt: new Date().toISOString(),
        inputItemIds: items.map((i) => i.id),
      },
    };
  },

  async assist({ draft, beat, items, action }: { draft: Draft; beat: Beat; items: GenItem[]; action: AssistAction }): Promise<AssistResult> {
    const seed = hashString(draft.title + action);
    switch (action) {
      case "headlines": {
        const base = cleanTitle(draft.title || items[0]?.title || "제목");
        const num = extractNumbers([draft.dek, ...items.map((i) => i.title)], 1)[0];
        const entity = draft.tags[0] ?? items[0]?.entities[0];
        const titles = [
          base.length > 28 ? base.slice(0, 28).replace(/\s\S*$/, "") : base,
          num ? `${num.value}, ${base.split(" ").slice(0, 4).join(" ")}` : `${base} — 핵심은 속도`,
          entity ? `${entity}, 무엇이 달라지나` : `${base.split(" ").slice(0, 3).join(" ")}의 의미`,
        ].map((t) => t.trim());
        return { action, titles: [...new Set(titles)], note: "모의 생성 — 사실관계와 어감을 검토하세요." };
      }
      case "tighten": {
        const short = (t?: string) => (t ? firstSentence(t, 140) : t);
        const blocks = draft.blocks.map((b): Block => {
          if (b.type === "section") return { ...b, text: short(b.text), bullets: b.bullets?.slice(0, 3) };
          if (b.type === "why" || b.type === "next") return { ...b, items: b.items.slice(0, 2) };
          return b;
        });
        return { action, dek: firstSentence(draft.dek, 90), blocks, note: "각 단락을 첫 문장 중심으로 줄였습니다 (모의)." };
      }
      case "why":
        return { action, block: { type: "why", items: pick(WHY[beat], seed, 2) }, note: "분야 템플릿 기반 (모의)." };
      case "next":
        return { action, block: { type: "next", items: pick(NEXT[beat], seed, 2) }, note: "분야 템플릿 기반 (모의)." };
      case "numbers": {
        const nums = extractNumbers([draft.dek, ...draft.blocks.map((b) => JSON.stringify(b)), ...items.flatMap((i) => [i.title, i.summary])], 4);
        const fallback = [{ value: "—", label: "수치를 입력하세요" }];
        return {
          action,
          block: { type: "numbers", items: nums.length ? nums : fallback },
          note: nums.length ? "원문에서 추출한 수치 — 원문 대조 필수." : "추출할 수치를 찾지 못했습니다.",
        };
      }
    }
  },
};
