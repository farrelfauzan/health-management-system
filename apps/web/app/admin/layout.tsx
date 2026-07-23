import { cookies } from 'next/headers';
import type { CSSProperties, ReactNode } from 'react';
import { buildAppAbility, SidebarInset, SidebarProvider } from '@hms/ui';

import { AppAbilityProvider } from '#components/client/app-ability-provider';
import { AppSidebar } from '#components/client/shell/app-sidebar';
import { TopBar } from '#components/server/shell/top-bar';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { REFRESH_TOKEN_COOKIE_NAME } from '#lib/auth/refresh-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { filterNavSections } from '#lib/shell/filter-nav-sections';
import { resolveShellProfile } from '#lib/shell/shell-profile';

const SIDEBAR_STYLE: CSSProperties = { '--sidebar-width': '15rem' } as CSSProperties;

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value;
  const claims = resolveSessionClaims({ accessToken, refreshToken });
  const rules = resolveAppAbilityRules(claims);
  const sections = filterNavSections(buildAppAbility(rules));
  const profile = resolveShellProfile(claims);
  return (
    <AppAbilityProvider rules={rules}>
      <SidebarProvider style={SIDEBAR_STYLE}>
        <AppSidebar sections={sections} />
        <SidebarInset>
          <TopBar profile={profile} />
          <main className="flex-1 px-8 py-8">
            <div className="mx-auto w-full max-w-page">{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AppAbilityProvider>
  );
}
