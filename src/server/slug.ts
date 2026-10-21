import { randomBytes } from "node:crypto";
import { ymdKST } from "@/lib/format";

const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

/** Article slug: yyMMdd-xxxxxx (KST date + 6 random chars). */
export function newArticleSlug(at: Date): string {
  const ymd = ymdKST(at).replace(/-/g, "").slice(2);
  const bytes = randomBytes(6);
  let tail = "";
  for (const b of bytes) tail += ALPHABET[b % ALPHABET.length];
  return `${ymd}-${tail}`;
}

/** Readable slug for stories ("한빛 HBM" → "story-x7k2pq" fallback when not ascii). */
export function storySlugFrom(title: string): string {
  const ascii = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40)
    .replace(/-+$/, "");
  const bytes = randomBytes(4);
  let tail = "";
  for (const b of bytes) tail += ALPHABET[b % ALPHABET.length];
  return ascii.length >= 3 ? `${ascii}-${tail}` : `story-${tail}`;
}
