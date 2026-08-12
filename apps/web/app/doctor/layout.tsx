import { cookies } from 'next/headers';
import type { CSSProperties, ReactNode } from 'react';
import { buildAppAbility, SidebarInset, SidebarProvider } from '@hms/ui';

import { AiAssistantProvider } from '#components/client/ai-assistant/ai-assistant-provider';
import { ChatLauncher } from '#components/client/ai-assistant/chat-launcher';
import { AppAbilityProvider } from '#components/client/app-ability-provider';
import { AppSidebar } from '#components/client/shell/app-sidebar';
import { TopBar } from '#components/server/shell/top-bar';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { DOCTOR_ASSISTANT_PATH } from '#lib/ai-assistant/assistant-path';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { DOCTOR_NAV_SECTIONS } from '#lib/shell/doctor-nav-items';
import { filterNavSections } from '#lib/shell/filter-nav-sections';
import { resolveShellProfile } from '#lib/shell/shell-profile';

const SIDEBAR_STYLE: CSSProperties = { '--sidebar-width': '15rem' } as CSSProperties;

type DoctorLayoutProps = {
  children: ReactNode;
};

export default async function DoctorLayout({ children }: DoctorLayoutProps) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const sessionHint = cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value;
  const claims = resolveSessionClaims({ accessToken, sessionHint });
  const rules = resolveAppAbilityRules(claims);
  const sections = filterNavSections(buildAppAbility(rules), DOCTOR_NAV_SECTIONS);
  const profile = resolveShellProfile(claims);

  return (
    <AppAbilityProvider rules={rules}>
      <AiAssistantProvider displayName={profile.displayName} assistantPath={DOCTOR_ASSISTANT_PATH}>
        <SidebarProvider style={SIDEBAR_STYLE}>
          <AppSidebar sections={sections} homeHref="/doctor/dashboard" />
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
