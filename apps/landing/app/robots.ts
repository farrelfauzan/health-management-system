import type { MetadataRoute } from 'next';

import { SITE_URL } from '#lib/landing/site-url';

/** Everything is public; point crawlers at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
