import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife, cacheTag } from "next/cache";
import { ImageResponse } from "next/og";
import { getArticle } from "@/data/public";
import { BEATS } from "@/lib/beats";
import { T } from "@/lib/cache-tags";
import { dateKST } from "@/lib/format";
import { SITE } from "@/lib/site";

/**
 * /a/{slug}/image — the article's share and search image (1200×675, 16:9):
 * beat, headline and date on the brand card. Google News and Discover want
 * an image at least 1200 px wide for the large card; the article page names
 * it in og:image and in its NewsArticle data. A route of its own keeps the
 * URL stable. The fonts are traced into the server bundle (next.config.ts).
 */

const SIZE = { width: 1200, height: 675 };

const fontDir = join(process.cwd(), "node_modules/pretendard/dist/public/static");
const fonts = Promise.all([readFile(join(fontDir, "Pretendard-Black.otf")), readFile(join(fontDir, "Pretendard-Bold.otf"))]);

const ICE = "#9ec5ff";
const ARM = 34;
const STROKE = 7;

/** headline size by length, so a long one still fits in three lines */
function titleSize(t: string): number {
  if (t.length <= 22) return 76;
  if (t.length <= 34) return 66;
  if (t.length <= 48) return 58;
  return 50;
}

/** The PNG, cached with the article: an edit or a correction (tag a:{slug}) draws it again. */
async function cardPng(slug: string): Promise<Uint8Array | null> {
  "use cache";
  cacheLife("article");
  cacheTag(T.article(slug));
  const [a, [black, bold]] = await Promise.all([getArticle(slug), fonts]);
  if (!a) return null;
  const beat = BEATS[a.beat];
  const title = a.title.length > 70 ? `${a.title.slice(0, 69)}…` : a.title;

  const res = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 76px", background: "#05060a", fontFamily: "Pretendard" }}>
        {/* faint orbit, the site's banner motif */}
        <div style={{ position: "absolute", right: -220, top: -260, width: 900, height: 620, borderRadius: "50%", border: "2px solid rgba(158,197,255,0.14)", transform: "rotate(-16deg)" }} />
        <div style={{ position: "absolute", right: -120, top: -170, width: 700, height: 460, borderRadius: "50%", border: "1px solid rgba(158,197,255,0.09)", transform: "rotate(-16deg)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ display: "flex", position: "relative", padding: "12px 16px" }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: ARM, height: ARM, borderLeft: `${STROKE}px solid ${ICE}`, borderTop: `${STROKE}px solid ${ICE}` }} />
            <div style={{ fontSize: 58, fontWeight: 900, letterSpacing: -2.6, lineHeight: 1, color: "#f2f5fb" }}>NWM</div>
            <div style={{ position: "absolute", right: 0, bottom: 0, width: ARM, height: ARM, borderRight: `${STROKE}px solid ${ICE}`, borderBottom: `${STROKE}px solid ${ICE}` }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 30, fontWeight: 700, color: beat.color }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, background: beat.color }} />
            {beat.label}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: titleSize(title), fontWeight: 900, letterSpacing: -1.5, lineHeight: 1.22, color: "#f2f5fb", wordBreak: "keep-all", maxWidth: 1040 }}>{title}</div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, fontWeight: 700, color: "#7b869c" }}>
          <div style={{ display: "flex" }}>{dateKST(a.publishedAt)}</div>
          <div style={{ display: "flex", letterSpacing: 3, color: "#4f5870" }}>{SITE.domain.toUpperCase()}</div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      fonts: [
        { name: "Pretendard", data: black, weight: 900, style: "normal" },
        { name: "Pretendard", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
  return new Uint8Array(await res.arrayBuffer());
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const png = await cardPng((await params).slug);
  if (!png) return new Response("not found", { status: 404 });
  return new Response(png as Uint8Array<ArrayBuffer>, {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
