import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import type { ReactNode } from 'react';

import { ReactQueryProvider } from '#components/client/react-query-provider';
import { AppToaster } from '#components/client/shared/app-toaster';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Saling Jaga',
  description: 'Saling Jaga health management system',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${inter.variable} ${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <ReactQueryProvider>{children}</ReactQueryProvider>
        <AppToaster />
      </body>
    </html>
  );
}
