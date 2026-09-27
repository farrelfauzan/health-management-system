import type { MetadataRoute } from 'next';

import { SITE_SEO } from '#lib/landing/site-seo';

/** Web app manifest: name, colours and icon for "add to home screen" and browser UI. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MetaKlinik',
    short_name: 'MetaKlinik',
    description: SITE_SEO.description,
    start_url: '/',
    display: 'browser',
    lang: 'id',
    background_color: '#F8F9FF',
    theme_color: '#F8F9FF',
    icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
  };
}
