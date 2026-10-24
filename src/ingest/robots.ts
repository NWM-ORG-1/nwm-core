import type { Http } from "./http";
import { ConfigError } from "./types";

/**
 * robots.txt (RFC 9309): groups by user-agent, Allow/Disallow with * and $,
 * longest match wins, Allow wins ties. Our product token is "NWM-FeedBot".
 */

interface Rule {
  allow: boolean;
  pattern: string;
  re: RegExp;
}

export interface Robots {
  isAllowed(pathWithQuery: string): boolean;
}

export const BOT_TOKEN = "nwm-feedbot";

export function parseRobots(txt: string, token = BOT_TOKEN): Robots {
  const groups: Array<{ agents: string[]; rules: Rule[] }> = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "allow" || field === "disallow") {
      if (field === "disallow" && value === "") continue; // "Disallow:" = allow all
      current.rules.push({ allow: field === "allow", pattern: value, re: toRegex(value) });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && token.startsWith(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  return {
    isAllowed(path: string) {
      let best: Rule | null = null;
      for (const r of rules) {
        if (!r.re.test(path)) continue;
        if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
      }
      return best ? best.allow : true;
    },
  };
}

function toRegex(pattern: string): RegExp {
  let p = pattern.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  if (p.endsWith("\\$")) p = `${p.slice(0, -2)}$`;
  return new RegExp(`^${p}`);
}

/**
 * Stops a page reader before it reads a path robots.txt keeps from us. The
 * file is kept in the source's state for a day; a missing one (4xx) allows
 * everything, a server error fails the run so it is retried later.
 */
export async function assertRobotsAllow(http: Http, state: Record<string, unknown>, url: string, now: Date, headers?: Record<string, string>): Promise<void> {
  const u = new URL(url);
  const cached = state.robots as { at: number; txt: string } | undefined;
  let txt = cached && now.getTime() - cached.at < 86_400_000 ? cached.txt : undefined;
  if (txt === undefined) {
    const r = await http.request(`${u.origin}/robots.txt`, { okStatuses: [400, 401, 403, 404, 410, 451], timeoutMs: 15_000, headers });
    txt = r.status === 200 ? r.text.slice(0, 200_000) : "";
    state.robots = { at: now.getTime(), txt };
  }
  if (!parseRobots(txt).isAllowed(`${u.pathname}${u.search}`)) {
    throw new ConfigError(`robots.txt가 이 경로를 막고 있습니다 (${u.pathname}${u.search}). 협의가 있으면 respectRobots=false와 robotsOverride를 기록하세요.`);
  }
}
