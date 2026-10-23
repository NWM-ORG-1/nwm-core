import Script from "next/script";
import { GA_ID } from "@/lib/analytics";

/**
 * Google Analytics 4 on the public site (the newsroom is left out). Loads after
 * hydration, so it never delays the first paint. Google signals and ad
 * personalisation are off, as the privacy policy says. Client-side navigations
 * are counted by GA4's history-based page views.
 */
export function Analytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga4" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}',{allow_google_signals:false,allow_ad_personalization_signals:false});`}
      </Script>
    </>
  );
}
