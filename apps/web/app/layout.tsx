import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';

import { AppAbilityProvider } from '#components/client/app-ability-provider';
import { ReactQueryProvider } from '#components/client/react-query-provider';
import { decodeAccessTokenClaims, isAccessTokenExpired } from '#lib/auth/access-token-claims';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';

import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

export const metadata: Metadata = {
  title: 'Health Management System',
  description: 'HMS web application',
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
    <html lang="en">
      <body className={spaceGrotesk.variable}>
        <ReactQueryProvider>
          <AppAbilityProvider rules={abilityRules}>{children}</AppAbilityProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
