/**
 * Prints what feed endpoints really return (status, type, and excerpts) so
 * parsers can be checked against live responses. Runs in GitHub Actions
 * (feeds-probe workflow); no dependencies, no credentials.
 *
 *   node scripts/probe/raw-capture.mjs [name-filter]
 */
const UA = "NWM-FeedProbe/1.0 (+https://newweb.media)";

/** marker: print windows around the first `count` occurrences instead of the head */
const TARGETS = [
  // ── telegram message internals ──
  { name: "tg.text", url: "https://t.me/s/durov", marker: "tgme_widget_message_text", count: 2, width: 700, before: 80 },
  { name: "tg.views", url: "https://t.me/s/durov", marker: "tgme_widget_message_views", count: 2, width: 160, before: 60 },
  { name: "tg.time", url: "https://t.me/s/durov", marker: "<time", count: 2, width: 200, before: 400 },
  { name: "tg.photo", url: "https://t.me/s/durov", marker: "tgme_widget_message_photo_wrap", count: 1, width: 400, before: 40 },
  { name: "tg.kr", url: "https://t.me/s/coinnesskr", marker: "tgme_widget_message_text", count: 2, width: 900, before: 80 },
  { name: "tg.kr.forward", url: "https://t.me/s/coinnesskr", marker: "forwarded_from", count: 1, width: 500, before: 100 },
  // ── dcinside normal rows + full robots ──
  { name: "dc.txt-row", url: "https://gall.dcinside.com/board/lists/?id=bitcoins_new1", marker: 'data-type="icon_txt"', count: 2, width: 1500, before: 60 },
  { name: "dc.pic-row", url: "https://gall.dcinside.com/board/lists/?id=bitcoins_new1", marker: 'data-type="icon_pic"', count: 1, width: 1500, before: 60 },
  { name: "dc.mgallery", url: "https://gall.dcinside.com/mgallery/board/lists/?id=coin", marker: 'data-type="icon_txt"', count: 1, width: 1500, before: 60 },
  { name: "dc.robots-full", url: "https://gall.dcinside.com/robots.txt", head: 4600 },
  // ── where the official RSS links live ──
  { name: "korea.kr.press", url: "https://www.korea.kr/briefing/pressReleaseList.do", marker: "rss", ci: true, count: 6, width: 260, before: 160 },
  { name: "korea.kr.rss-root", url: "https://www.korea.kr/rss/", head: 500, marker: ".xml", count: 8, width: 120, before: 80 },
  { name: "motir.press", url: "https://www.motir.go.kr/kor/article/ATCL3f49a5a8c", marker: "rss", ci: true, count: 4, width: 300, before: 200 },
  { name: "customs.main", url: "https://www.customs.go.kr/kcs/main.do", marker: "rss", ci: true, count: 4, width: 300, before: 200 },
  { name: "bok.main", url: "https://www.bok.or.kr/portal/main/main.do", marker: "rss", ci: true, count: 6, width: 260, before: 200 },
  { name: "fsc.press", url: "https://www.fsc.go.kr/no010101", marker: "rss", ci: true, count: 4, width: 300, before: 200 },
  { name: "fsc.rss-retry", url: "https://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111", head: 1200 },
  { name: "fss.main", url: "https://www.fss.or.kr/fss/main/main.do", marker: "rss", ci: true, count: 4, width: 300, before: 200 },
  { name: "msit.press", url: "https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=208&mId=307", marker: "rss", ci: true, count: 4, width: 300, before: 200 },
  // ── details ──
  { name: "hf.upvotes", url: "https://huggingface.co/api/daily_papers?limit=1", marker: '"upvotes"', count: 1, width: 300, before: 300 },
  { name: "hf.comments", url: "https://huggingface.co/api/daily_papers?limit=1", marker: '"numComments"', count: 1, width: 400, before: 300 },
  { name: "upbit.announcements", url: "https://api-manager.upbit.com/api/v1/announcements?os=web&page=1&per_page=3&category=trade", head: 1600 },
  { name: "upbit.robots", url: "https://upbit.com/robots.txt", head: 800 },
  { name: "bithumb.notice", url: "https://feed.bithumb.com/notice", head: 400, marker: "notice", count: 2, width: 400, before: 100 },
  { name: "ppomppu.cookie", url: "https://www.ppomppu.co.kr/zboard/zboard.php?id=stock", cookies: true, head: 300, marker: "baseList", count: 2, width: 1400, before: 40 },
  { name: "ppomppu.coin", url: "https://www.ppomppu.co.kr/zboard/zboard.php?id=coin", cookies: true, marker: "baseList", count: 1, width: 1400, before: 40 },
];

function charsetOf(contentType, bytes) {
  const m = /charset=["']?([\w-]+)/i.exec(contentType ?? "");
  if (m) return m[1].toLowerCase();
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head) ?? /<\?xml[^>]+encoding=["']([\w-]+)/i.exec(head);
  return meta ? meta[1].toLowerCase() : "utf-8";
}

/** Some boards set a cookie and redirect once (cookie check); carry cookies by hand. */
async function followWithCookies(url) {
  const jar = new Map();
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(current, {
      headers: {
        "user-agent": UA,
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
    const res = t.cookies ? await followWithCookies(t.url) : await fetch(t.url, {
      headers: { "user-agent": UA, accept: "*/*", "accept-language": "ko-KR,ko;q=0.9,en;q=0.8" },
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
    if (t.marker) {
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
