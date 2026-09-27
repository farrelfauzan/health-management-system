import type { MetadataRoute } from 'next';

import { SCREEN_SLIDES } from '#lib/landing/screen-slides';
import { SITE_URL } from '#lib/landing/site-url';

/** The landing site is one page; its screenshots are listed so image search can find them. */
export default function sitemap(): MetadataRoute.Sitemap {
  const images = SCREEN_SLIDES.flatMap((slide) =>
    slide.imageSrc ? [`${SITE_URL}${slide.imageSrc}`] : [],
  );
  return [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'monthly', priority: 1, images },
  ];
}
