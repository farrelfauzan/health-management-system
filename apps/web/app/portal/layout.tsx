import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { AppAbilityProvider } from '#components/client/app-ability-provider';
import { PortalTopBar } from '#components/server/portal/portal-top-bar';
import { decodeAccessTokenClaims, isAccessTokenExpired } from '#lib/auth/access-token-claims';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { resolveShellProfile } from '#lib/shell/shell-profile';

type PortalLayoutProps = {
  children: ReactNode;
};

export default async function PortalLayout({ children }: PortalLayoutProps) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const claims = accessToken ? decodeAccessTokenClaims(accessToken) : null;
  const rules = isAccessTokenExpired(claims) ? [] : resolveAppAbilityRules(claims);
  const profile = resolveShellProfile(claims);
  return (
    <AppAbilityProvider rules={rules}>
      <div className="flex min-h-svh flex-col bg-surface">
        <PortalTopBar profile={profile} />
        <main className="flex-1 px-8 py-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </AppAbilityProvider>
  );
}
