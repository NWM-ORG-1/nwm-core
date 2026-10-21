import { ImageResponse } from "next/og";

export const alt = "NWM — newweb.media";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Static brand card (Latin only, so no Korean font has to be bundled). */
export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: "#05060a", color: "#e8eef9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="88" height="88" viewBox="0 0 24 24">
            <path d="M5 19 18.5 5.5M8.5 5.5h10v10" fill="none" stroke="#9ec5ff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -4, color: "#cfe2ff" }}>NWM</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 44, color: "#b9d6ff" }}>Signal, not noise.</div>
          <div style={{ fontSize: 28, color: "#7b869c", letterSpacing: 4 }}>AI · CRYPTO · MACRO · TECH · SENTIMENT</div>
        </div>
        <div style={{ fontSize: 26, color: "#4f5870", letterSpacing: 6 }}>NEWWEB.MEDIA</div>
      </div>
    ),
    size,
  );
}
