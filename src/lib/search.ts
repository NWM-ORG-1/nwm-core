import type { Beat } from "@/db/schema";
import type { SearchRecord } from "@/data/dto";

/**
 * Client-side search over the compact index (/api/search-index).
 * Supports 초성 queries: "ㅎㅂㅂㄷ" finds "한빛반도체".
 */

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

export function choseong(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) out += CHO[Math.floor((c - 0xac00) / 588)];
    else out += ch;
  }
  return out;
}

const isChoseongOnly = (s: string) => /^[ㄱ-ㅎ\s]+$/.test(s);

export interface SearchHit {
  slug: string;
  title: string;
  dek: string;
  beat: Beat;
  publishedAt: number; // epoch ms
  score: number;
}

function norm(s: string) {
  return s.normalize("NFC").toLowerCase();
}

export function searchIndex(index: SearchRecord[], query: string, limit = 20): SearchHit[] {
  const q = norm(query.trim());
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const cho = isChoseongOnly(q);
  const out: SearchHit[] = [];
  for (const [slug, title, dek, beat, pm] of index) {
    const t = norm(title);
    const d = norm(dek);
    let score = 0;
    if (cho) {
      const tc = choseong(t).replace(/\s+/g, "");
      const qc = q.replace(/\s+/g, "");
      const i = tc.indexOf(qc);
      if (i < 0) continue;
      score = 60 - Math.min(i, 30);
    } else {
      let all = true;
      for (const tok of tokens) {
        const inT = t.indexOf(tok);
        const inD = d.indexOf(tok);
        if (inT < 0 && inD < 0) {
          all = false;
          break;
        }
        score += inT === 0 ? 40 : inT > 0 ? 25 : 8;
      }
      if (!all) continue;
    }
    // freshness tiebreak: newer first
    out.push({ slug, title, dek, beat, publishedAt: pm * 60_000, score: score + pm / 1e9 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
