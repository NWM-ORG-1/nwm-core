import { db } from "@/db/client";
import { runAutoArticles } from "@/server/auto/run";
import type { Job } from "../jobs";

/**
 * The automatic desk (자동 기사): daily briefs at their time, sharp moves and
 * exchange market changes as they happen. Candidates go to 검토 or, for types
 * set to automatic, to the publishing scheduler of the web service.
 */
export const autoArticlesJob: Job = {
  name: "auto.articles",
  everySec: 60,
  offsetSec: 20,
  async run(now) {
    const r = await runAutoArticles(db, now);
    const made = r.created.map((c) => `${c.title} (${c.status === "scheduled" ? "자동 발행" : "검토"})`);
    return {
      inserted: r.created.length,
      note: made.length ? made.join(" · ").slice(0, 300) : r.skipped.slice(0, 2).join(" · ") || "대기",
      meta: { created: r.created, skipped: r.skipped },
    };
  },
};
