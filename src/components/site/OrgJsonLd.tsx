import { PENDING, SITE, type Legal } from "@/lib/site";

/**
 * Who publishes this site, for search engines (schema.org NewsMediaOrganization
 * + WebSite) — Google News looks for the publisher, its contact and its
 * standards. Fields still "등록 예정" are left out rather than published as such.
 */

export const ORG_ID = `${SITE.url}/#org`;
export const LOGO_URL = `${SITE.url}/brand/nwm-logo-512.png`;

export function OrgJsonLd({ legal }: { legal: Legal }) {
  const known = (v: string | undefined) => (v && v.trim() && v !== PENDING ? v.trim() : undefined);
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "NewsMediaOrganization",
      "@id": ORG_ID,
      name: SITE.name,
      alternateName: [SITE.short, SITE.nameEn],
      url: SITE.url,
      logo: { "@type": "ImageObject", url: LOGO_URL, width: 512, height: 512 },
      description: SITE.description,
      email: known(legal.email) ?? SITE.email,
      telephone: known(legal.phone),
      address: known(legal.address),
      foundingDate: known(legal.foundedAt),
      legalName: known(legal.company),
      publishingPrinciples: `${SITE.url}/about`,
      correctionsPolicy: `${SITE.url}/policy/corrections`,
      actionableFeedbackPolicy: `${SITE.url}/policy/corrections`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE.url}/#website`,
      name: SITE.name,
      alternateName: SITE.short,
      url: SITE.url,
      inLanguage: "ko-KR",
      publisher: { "@id": ORG_ID },
    },
  ];
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
