import type { Adapter } from "../../types";
import { binanceSpotAdapter, krwSpotAdapter } from "./crypto";
import { binanceDerivsAdapter, bybitDerivsAdapter } from "./derivatives";
import { fearGreedAdapter, frankfurterAdapter, koreaeximAdapter, naverDatalabAdapter, treasuryAdapter } from "./macro";

export const marketAdapters: Adapter[] = [
  binanceSpotAdapter,
  krwSpotAdapter,
  bybitDerivsAdapter,
  binanceDerivsAdapter,
  frankfurterAdapter,
  koreaeximAdapter,
  treasuryAdapter,
  fearGreedAdapter,
  naverDatalabAdapter,
];
