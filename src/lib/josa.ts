/**
 * Korean particles that agree with the word they follow: 비트코인이 / 솔라나가.
 * For a name with a ticker in parentheses the particle follows the parenthesis
 * but agrees with the name: 솔라나(SOL)를.
 */

export type JosaPair = "이/가" | "을/를" | "은/는" | "과/와" | "으로/로";

/** Final consonant of the word's last sound: 0 = none, 8 = ㄹ, other = some batchim. */
function finalConsonant(word: string): number | null {
  const ch = word.trim().replace(/[\s)\]"'’”.,!?]+$/u, "").slice(-1);
  if (!ch) return null;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28;
  // digits and Latin letters read aloud: 1 일, 3 삼, 6 육, 7 칠, 8 팔, 0 영 / L 엘, M 엠, N 엔, R 알
  const spoken: Record<string, number> = { "0": 21, "1": 8, "3": 16, "6": 1, "7": 8, "8": 8, l: 8, m: 16, n: 4, r: 8 };
  const k = ch.toLowerCase();
  if (k in spoken) return spoken[k];
  if (/[0-9a-z]/.test(k)) return 0;
  return null;
}

export function particle(word: string, pair: JosaPair): string {
  const [withBatchim, without] = pair.split("/");
  const f = finalConsonant(word);
  if (f == null) return `${withBatchim}(${without})`;
  if (pair === "으로/로") return f === 0 || f === 8 ? without : withBatchim;
  return f === 0 ? without : withBatchim;
}

/** "솔라나" + "을/를" → "솔라나를" */
export function josa(word: string, pair: JosaPair): string {
  return `${word}${particle(word, pair)}`;
}

/** "솔라나", "SOL", "을/를" → "솔라나(SOL)를" */
export function named(name: string, ticker: string | null | undefined, pair?: JosaPair): string {
  const label = ticker && ticker !== name ? `${name}(${ticker})` : name;
  return pair ? `${label}${particle(name, pair)}` : label;
}
