import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactElement, ReactNode } from 'react';

import { SITE_SEO } from '#lib/landing/site-seo';
import { SITE_URL } from '#lib/landing/site-url';

import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-jakarta',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-jetbrains',
});

const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_SEO.title, template: '%s · MetaKlinik' },
  description: SITE_SEO.description,
  keywords: [...SITE_SEO.keywords],
  applicationName: 'MetaKlinik',
  category: 'health',
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'MetaKlinik',
    title: SITE_SEO.title,
    description: SITE_SEO.socialDescription,
    locale: 'id_ID',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_SEO.title,
    description: SITE_SEO.socialDescription,
  },
  verification: googleSiteVerification ? { google: googleSiteVerification } : undefined,
};

export const viewport: Viewport = {
  themeColor: '#F8F9FF',
};

type RootLayoutProps = {
  children: ReactNode;
};

/** Root layout: Indonesian document with the brand typefaces as CSS variables. */
export default function RootLayout({ children }: RootLayoutProps): ReactElement {
  return (
    <html lang="id" className={`${jakarta.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
