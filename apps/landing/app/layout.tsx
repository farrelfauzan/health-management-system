import type { Metadata } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactElement, ReactNode } from 'react';

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

export const metadata: Metadata = {
  title: 'MetaKlinik — Sistem manajemen klinik yang terhubung SATUSEHAT',
  description:
    'Pendaftaran, pemeriksaan, apotek, kasir, pajak, sampai laporan SATUSEHAT dalam satu sistem. Pasien bisa daftar sendiri lewat WhatsApp bersama Miko.',
  openGraph: {
    title: 'MetaKlinik',
    description:
      'Lebih dari sekadar RME: satu sistem untuk seluruh perjalanan pasien di klinik Anda.',
    locale: 'id_ID',
    type: 'website',
  },
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
