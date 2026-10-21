import localFont from "next/font/local";

/**
 * Korean body text uses Pretendard's dynamic subset (imported as CSS in the root
 * layout: 92 unicode-range slices, the browser fetches only the glyphs a page
 * uses). Mono and pixel faces are decorative — never preloaded, never on the
 * LCP path — and subset to the glyphs the HUD uses (scripts/subset-fonts.sh):
 * mono 71KB → 21KB, pixel 29KB → 9KB. Anything outside falls back per glyph.
 */
export const mono = localFont({
  src: "../assets/fonts/GeistMono-Variable.subset.woff2",
  variable: "--font-mono-face",
  weight: "100 900",
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  adjustFontFallback: false,
});

export const pixel = localFont({
  src: "../assets/fonts/GeistPixel-Square.subset.woff2",
  variable: "--font-pixel-face",
  weight: "500",
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "monospace"],
  adjustFontFallback: false,
});
