import type { Adapter } from "../../types";
import { arxivAdapter } from "./arxiv";
import { dartAdapter } from "./dart";
import { ecosKeyStatsAdapter, ecosSeriesAdapter } from "./ecos";
import { exchangeMarketsAdapter } from "./exchange-markets";
import { hfPapersAdapter } from "./hf-papers";
import { hnAdapter } from "./hn";
import { kosisAdapter } from "./kosis";
import { rssAdapter } from "./rss";
import { secAdapter } from "./sec";

export const officialAdapters: Adapter[] = [
  rssAdapter,
  arxivAdapter,
  hfPapersAdapter,
  hnAdapter,
  secAdapter,
  exchangeMarketsAdapter,
  dartAdapter,
  ecosKeyStatsAdapter,
  ecosSeriesAdapter,
  kosisAdapter,
];
