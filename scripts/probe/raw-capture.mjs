/**
 * Prints what feed endpoints really return (status, type, and excerpts) so
 * parsers can be checked against live responses. Runs in GitHub Actions
 * (feeds-probe workflow); no dependencies, no credentials.
 *
 *   node scripts/probe/raw-capture.mjs [name-filter]
 */
const UA = "NWM-FeedProbe/1.0 (+https://newweb.media)";
/** what the collector itself sends (src/ingest/http.ts) */
const BOT_UA = "NWM-FeedBot/1.0 (+https://newweb.media)";

/**
 * marker: print windows around the first `count` occurrences instead of the head
 * tally: occurrences of each listed string, then the window after the first `marker` (or `fallback`)
 */
const CLIEN_TALLY = ['class="list_item', "symph_row", "data-board-sn", "<body", "list_subject", "subject_fixed"];
const TARGETS = [
  // ── batch 4: Clien rows parse from the probe's capture but not in the collector — same page for both agents? ──
  { name: "clien.probe-ua", url: "https://www.clien.net/service/board/cm_stock", tally: CLIEN_TALLY, marker: 'class="list_item', fallback: "<body", width: 1500 },
  { name: "clien.bot-ua", url: "https://www.clien.net/service/board/cm_stock", ua: BOT_UA, tally: CLIEN_TALLY, marker: 'class="list_item', fallback: "<body", width: 1500 },
];

function charsetOf(contentType, bytes) {
  const m = /charset=["']?([\w-]+)/i.exec(contentType ?? "");
  if (m) return m[1].toLowerCase();
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head) ?? /<\?xml[^>]+encoding=["']([\w-]+)/i.exec(head);
  return meta ? meta[1].toLowerCase() : "utf-8";
}

/** Some boards set a cookie and redirect once (cookie check); carry cookies by hand. */
async function followWithCookies(url, ua = UA) {
  const jar = new Map();
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(current, {
      headers: {
        "user-agent": ua,
        accept: "*/*",
        "accept-language": "ko-KR,ko;q=0.9,en;q=0.8",
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    console.log(`  hop ${hop}: ${res.status} ${current} cookies=[${[...jar.keys()].join(",")}]`);
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("too many redirects");
}

const clip = (s) => s.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");

async function capture(t) {
  const started = Date.now();
  try {
    const res = t.cookies ? await followWithCookies(t.url, t.ua) : await fetch(t.url, {
      method: t.method ?? "GET",
      headers: { "user-agent": t.ua ?? UA, accept: "*/*", "accept-language": "ko-KR,ko;q=0.9,en;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const cs = charsetOf(res.headers.get("content-type"), bytes);
    let text;
    try {
      text = new TextDecoder(cs).decode(bytes);
    } catch {
      text = new TextDecoder("utf-8").decode(bytes);
    }
    const lines = [
      `status=${res.status} type=${res.headers.get("content-type")} charset=${cs} bytes=${bytes.length} ms=${Date.now() - started}`,
      `final=${res.url}`,
    ];
    for (const h of ["etag", "last-modified", "retry-after", "server", "cf-ray", "x-cache"]) {
      const v = res.headers.get(h);
      if (v) lines.push(`${h}: ${v}`);
    }
    if (t.head) lines.push("--- head ---", clip(text.slice(0, t.head)));
    if (t.tally) {
      lines.push(`--- counts: ${t.tally.map((k) => `${k}=${text.split(k).length - 1}`).join(" · ")}`);
      const key = text.includes(t.marker) ? t.marker : t.fallback;
      const at = key ? text.indexOf(key) : -1;
      lines.push(`--- window after ${JSON.stringify(key)} @${at} ---`, at < 0 ? "(none)" : text.slice(at, at + (t.width ?? 800)).replace(/\s+/g, " "));
    } else if (t.marker) {
      let from = 0;
      for (let i = 0; i < (t.count ?? 1); i++) {
        const at = t.ci ? text.toLowerCase().indexOf(t.marker.toLowerCase(), from) : text.indexOf(t.marker, from);
        if (at < 0) {
          lines.push(`--- marker ${JSON.stringify(t.marker)} #${i + 1}: not found ---`);
          break;
        }
        const start = Math.max(0, at - (t.before ?? 0));
        lines.push(`--- marker ${JSON.stringify(t.marker)} #${i + 1} @${at} ---`, clip(text.slice(start, at + (t.width ?? 800))));
        from = at + t.marker.length;
      }
    }
    return lines.join("\n");
  } catch (err) {
    return `ERROR ${err?.cause?.code ?? ""} ${err?.message ?? err} ms=${Date.now() - started}`;
  }
}

const filter = process.argv[2];
for (const t of TARGETS) {
  if (filter && !t.name.includes(filter)) continue;
  console.log(`\n===== ${t.name} ===== ${t.url}`);
  console.log(await capture(t));
  await new Promise((r) => setTimeout(r, 400));
}
