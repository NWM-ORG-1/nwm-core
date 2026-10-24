import type { Metadata, Viewport } from "next";
import { preload } from "react-dom";
import "./pretendard.css";
import "./globals.css";
import { SITE } from "@/lib/site";
import { PREFS_SCRIPT } from "@/lib/prefs";
import { mono, pixel } from "./fonts";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} | ${SITE.tagline}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: SITE.name,
    url: SITE.url,
  },
  twitter: { card: "summary_large_image" },
  alternates: {
    types: { "application/rss+xml": [{ url: "/rss.xml", title: `${SITE.name} 최신 기사` }] },
  },
  formatDetection: { telephone: false, address: false, email: false },
  // Search Console ownership by meta tag (a DNS record works too and needs nothing here)
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION.trim() } } : {}),
};

export const viewport: Viewport = {
  // theme-color is written by PREFS_SCRIPT so it follows the reader's light/dark choice.
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Pretendard slices covering Latin + the most frequent Hangul (~180KB); pages fetch these anyway — preloading only moves them ahead of first paint. */
const PRELOAD_FONTS = [91, 90, 89, 88, 86, 87, 85].map((n) => `/fonts/pretendard/1.3.9/PretendardVariable.subset.${n}.woff2`);

export default function RootLayout({ children }: LayoutProps<"/">) {
  for (const href of PRELOAD_FONTS) preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <html lang="ko" data-theme="dark" className={`${mono.variable} ${pixel.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
