import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Built once at build time (static route), so reading the font files here is fine.
const fontDir = join(process.cwd(), "node_modules/pretendard/dist/public/static");
const [black, bold] = await Promise.all([readFile(join(fontDir, "Pretendard-Black.otf")), readFile(join(fontDir, "Pretendard-Bold.otf"))]);

const ICE = "#9ec5ff";

/** Brand card: ⌜NWM⌟, the name and the tagline. */
export default function OG() {
  const arm = 56;
  const stroke = 12;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "84px 88px", background: "#05060a", fontFamily: "Pretendard" }}>
        <div style={{ display: "flex", position: "relative", padding: "30px 40px", alignSelf: "flex-start" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: arm, height: arm, borderLeft: `${stroke}px solid ${ICE}`, borderTop: `${stroke}px solid ${ICE}` }} />
          <div style={{ fontSize: 150, fontWeight: 900, letterSpacing: -7, lineHeight: 1, color: "#f2f5fb" }}>NWM</div>
          <div style={{ position: "absolute", right: 0, bottom: 0, width: arm, height: arm, borderRight: `${stroke}px solid ${ICE}`, borderBottom: `${stroke}px solid ${ICE}` }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: -2, color: "#f2f5fb" }}>{SITE.name}</div>
          <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1, color: "#a7b1c6" }}>{SITE.tagline}</div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 4, color: "#4f5870", marginTop: 10 }}>{SITE.domain.toUpperCase()}</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Pretendard", data: black, weight: 900, style: "normal" },
        { name: "Pretendard", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
