/**
 * Google Analytics 4 measurement ID, from NEXT_PUBLIC_GA_ID at build time.
 * Unset in development and CI, so those builds make no third-party requests and
 * the privacy policy leaves out the analytics section. Anything that is not a
 * GA4 ID is ignored (it ends up inside an inline script).
 */
const raw = process.env.NEXT_PUBLIC_GA_ID?.trim() ?? "";

export const GA_ID = /^G-[A-Z0-9]{4,20}$/.test(raw) ? raw : "";
