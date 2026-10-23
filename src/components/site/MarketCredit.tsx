"use client";

import { usePulse } from "@/lib/client/pulse";

/** Data providers by their display names, in the order they are credited. */
const PROVIDER: Record<string, string> = {
  binance: "Binance",
  upbit: "업비트",
  bithumb: "빗썸",
  ecb: "ECB",
  koreaexim: "한국수출입은행",
  treasury: "美 재무부",
};

/**
 * Where the ticker's quotes come from, named after the providers actually on
 * the strip. Kept out of the strip itself so it scrolls quotes only. The delay
 * notice is in the server HTML, so the line is there before the quotes arrive.
 */
export function MarketCredit({ className = "" }: { className?: string }) {
  const pulse = usePulse();
  const used = new Set((pulse?.quotes ?? []).map((q) => q.src));
  const credits = Object.keys(PROVIDER)
    .filter((k) => used.has(k))
    .map((k) => PROVIDER[k]);
  return (
    <p className={className}>
      {credits.length > 0 && <>시세 정보 제공: {credits.join(" · ")}. </>}
      시세는 지연될 수 있습니다.
    </p>
  );
}
