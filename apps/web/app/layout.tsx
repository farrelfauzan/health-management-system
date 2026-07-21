import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';

import { AppAbilityProvider } from '#components/client/app-ability-provider';
import { ReactQueryProvider } from '#components/client/react-query-provider';
import { decodeAccessTokenClaims, isAccessTokenExpired } from '#lib/auth/access-token-claims';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

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

export default async function RootLayout({ children }: RootLayoutProps) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const claims = accessToken ? decodeAccessTokenClaims(accessToken) : null;
  const abilityRules = !accessToken || isAccessTokenExpired(claims) ? [] : resolveAppAbilityRules(claims);

  return (
    <html lang="en" className={`${inter.variable} ${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <ReactQueryProvider>
          <AppAbilityProvider rules={abilityRules}>{children}</AppAbilityProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
