/**
 * CSRF defence in depth for the newsroom. Browsers attach Basic credentials to
 * cross-site requests, so anything that can change data (Server Actions,
 * fetches, form posts) must come from our own pages: Sec-Fetch-Site
 * same-origin, or none for a typed URL or bookmark.
 *
 * A top-level GET navigation may come from anywhere. Following a link from
 * mail, chat or the Railway dashboard only renders a page the linking site
 * cannot read. Browsers send Origin on every non-GET request and on CORS
 * fetches, never on a GET navigation, which tells the two apart.
 *
 * Requests without Sec-Fetch-Site come from non-browser clients, which hold
 * no one else's credentials, and pass.
 */
export function requestOriginAllowed(h: Pick<Headers, "get" | "has">): boolean {
  const site = h.get("sec-fetch-site");
  if (!site || site === "same-origin" || site === "none") return true;
  return h.get("sec-fetch-mode") === "navigate" && h.get("sec-fetch-dest") === "document" && !h.has("origin") && !h.has("next-action");
}
