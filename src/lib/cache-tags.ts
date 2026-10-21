/**
 * Cache tags for `'use cache'` data. Invalidated from Server Actions with
 * `updateTag` and from route handlers with `revalidateTag(tag, { expire: 0 })`.
 *
 * Rule: article pages never carry `feed`, so publishing one story does not
 * re-render every existing article page.
 */
export const T = {
  /** every list: home, beats, latest, days, stories, search index, rss */
  feed: "feed",
  /** "related" rails on article pages */
  rel: "rel",
  article: (slug: string) => `a:${slug}`,
  story: (id: string) => `story:${id}`,
  editors: "editors",
  corrections: "corrections",
  quotes: "quotes",
  sentiment: "sentiment",
  site: "site",
} as const;
