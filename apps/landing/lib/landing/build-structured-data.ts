import { FAQ_ITEMS } from '#lib/landing/faq-items';
import { LANDING_MODULES } from '#lib/landing/landing-modules';
import { SCREEN_SLIDES } from '#lib/landing/screen-slides';
import { SITE_CONTACT } from '#lib/landing/site-contact';
import { SITE_SEO } from '#lib/landing/site-seo';
import { SITE_URL } from '#lib/landing/site-url';
import type { StructuredDataGraph } from '#lib/landing/structured-data-graph';

/**
 * The page's schema.org graph: the organisation behind MetaKlinik, the website, and the
 * product as a web SoftwareApplication, and the FAQ. No price or rating is claimed; neither is public.
 */
export function buildStructuredData(): StructuredDataGraph {
  const organizationId = `${SITE_URL}/#organization`;
  const screenshots = SCREEN_SLIDES.flatMap((slide) =>
    slide.imageSrc ? [`${SITE_URL}${slide.imageSrc}`] : [],
  );
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: 'MetaKlinik',
        url: SITE_URL,
        logo: `${SITE_URL}/icon.png`,
        email: SITE_CONTACT.email,
        contactPoint: [
          {
            '@type': 'ContactPoint',
            telephone: SITE_CONTACT.phoneE164,
            contactType: 'sales',
            areaServed: 'ID',
            availableLanguage: ['Indonesian'],
          },
        ],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: 'MetaKlinik',
        inLanguage: 'id-ID',
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#software`,
        name: 'MetaKlinik',
        url: SITE_URL,
        description: SITE_SEO.description,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Sistem informasi manajemen klinik',
        operatingSystem: 'Web',
        inLanguage: 'id-ID',
        featureList: LANDING_MODULES.map((module) => module.name),
        screenshot: screenshots,
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        inLanguage: 'id-ID',
        mainEntity: FAQ_ITEMS.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ],
  };
}
