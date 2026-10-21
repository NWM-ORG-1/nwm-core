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
