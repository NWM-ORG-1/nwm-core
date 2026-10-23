/**
 * Where an article view came from, as a category only: the referrer itself is
 * never sent or stored. The AI desk reads the totals to tell an article that
 * found readers in search from one carried by the home page.
 */

export type TrafficSource = "search" | "social" | "direct" | "internal" | "other";
export const TRAFFIC_SOURCES = ["search", "social", "direct", "internal", "other"] as const satisfies readonly TrafficSource[];

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia|startpage|qwant|naver|daum|zum|nate)\.[a-z.]+$/;
/** portal hosts that are search only under a search.* name (news.naver.com is a portal page, not a search) */
const PORTALS = /(^|\.)(naver\.com|daum\.net|nate\.com|zum\.com)$/;
const SOCIAL =
  /(^|\.)(t\.co|twitter\.com|x\.com|facebook\.com|fb\.com|fb\.me|instagram\.com|threads\.net|threads\.com|linkedin\.com|lnkd\.in|reddit\.com|youtube\.com|youtu\.be|t\.me|telegram\.org|band\.us|kakao\.com|story\.kakao\.com|discord\.com|bsky\.app|news\.ycombinator\.com|blog\.naver\.com|cafe\.naver\.com|cafe\.daum\.net|dcinside\.com|clien\.net|fmkorea\.com|ppomppu\.co\.kr)$/;

export function trafficSource(referrer: string, ownHost: string): TrafficSource {
  if (!referrer) return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "other";
  }
  const own = ownHost.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  if (host === own || host.endsWith(`.${own}`)) return "internal";
  if (SOCIAL.test(host)) return "social";
  if (PORTALS.test(host)) return /(^|\.)search\./.test(host) ? "search" : "other";
  if (SEARCH.test(host)) return "search";
  return "other";
}
