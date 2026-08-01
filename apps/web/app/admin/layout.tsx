import { cookies } from 'next/headers';
import type { CSSProperties, ReactNode } from 'react';
import { buildAppAbility, SidebarInset, SidebarProvider } from '@hms/ui';

import { AiAssistantProvider } from '#components/client/ai-assistant/ai-assistant-provider';
import { ChatLauncher } from '#components/client/ai-assistant/chat-launcher';
import { AppAbilityProvider } from '#components/client/app-ability-provider';
import { AppSidebar } from '#components/client/shell/app-sidebar';
import { TopBar } from '#components/server/shell/top-bar';
import { ADMIN_ASSISTANT_PATH } from '#lib/ai-assistant/assistant-path';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { hasAnyRole } from '#lib/auth/access-token-claims';
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
  const isAdmin = hasAnyRole(claims, ['SUPER_ADMIN', 'ADMIN']);
  const isPharmacistOnly = !isAdmin && hasAnyRole(claims, ['PHARMACIST']);
  const sections = filterNavSections(
    buildAppAbility(rules),
    undefined,
    isPharmacistOnly ? ['/admin/dashboard'] : [],
  );
  const profile = resolveShellProfile(claims);
  return (
    <AppAbilityProvider rules={rules}>
      {/*
        The conversation lives here, above the route, so it survives navigation
        — and so the sidebar entry and top bar can read its unread count.
      */}
      <AiAssistantProvider displayName={profile.displayName} assistantPath={ADMIN_ASSISTANT_PATH}>
        <SidebarProvider style={SIDEBAR_STYLE}>
          <AppSidebar sections={sections} />
          {/*
            min-w-0 is load-bearing: the inset is a flex item, and a flex item
            defaults to min-width:auto, so it grows to its widest content instead
            of shrinking. Without it a wide table pushes the whole page sideways
            and the table's own overflow-x container can never engage.
          */}
          <SidebarInset className="min-w-0">
            <TopBar profile={profile} />
            <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
              <div className="mx-auto w-full min-w-0 max-w-page">{children}</div>
            </main>
          </SidebarInset>
        </SidebarProvider>
        <ChatLauncher />
      </AiAssistantProvider>
    </AppAbilityProvider>
  );
}
