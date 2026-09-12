import { cookies } from 'next/headers';
import type { CSSProperties, ReactNode } from 'react';
import { buildAppAbility, SIDEBAR_COOKIE_NAME, SidebarInset, SidebarProvider } from '@hms/ui';

import { AiAssistantProvider } from '#components/client/ai-assistant/ai-assistant-provider';
import { ChatLauncher } from '#components/client/ai-assistant/chat-launcher';
import { AppAbilityProvider } from '#components/client/app-ability-provider';
import { IdleSessionGuard } from '#components/client/shell/idle-session-guard';
import { AppSidebar } from '#components/client/shell/app-sidebar';
import { OffboardingBanner } from '#components/client/shell/offboarding-banner';
import { TopBar } from '#components/server/shell/top-bar';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionIdlePolicy } from '#lib/shell/session-idle-policy';
import { resolveOffboardingSession } from '#lib/auth/offboarding-session';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { DOCTOR_ASSISTANT_PATH } from '#lib/ai-assistant/assistant-path';
import { DOCTOR_PROFILE_PATH } from '#lib/doctor-profile/doctor-profile-path';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { DOCTOR_NAV_SECTIONS } from '#lib/shell/doctor-nav-items';
import { filterNavSections } from '#lib/shell/filter-nav-sections';
import { isFeatureEnabled } from '#lib/shell/is-feature-enabled';
import { resolveDisabledNavHrefs } from '#lib/shell/resolve-disabled-nav-hrefs';
import { resolveSidebarDefaultOpen } from '#lib/shell/resolve-sidebar-default-open';
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
  // P16-T41. In their offboarding window a person's reduced claims already
  // shrink the sidebar to *My Documents*; the dashboard entry needs no grant,
  // so it is dropped by name. The launcher goes too — the assistant is not
  // one of the things they can still do.
  const offboarding = resolveOffboardingSession(claims, 'doctor');
  const excludedNavHrefs = [
    ...(offboarding ? ['/doctor/dashboard'] : []),
    ...resolveDisabledNavHrefs(claims),
  ];
  const ability = buildAppAbility(rules);
  const sections = filterNavSections(ability, DOCTOR_NAV_SECTIONS, excludedNavHrefs);
  // P20-T03. Offboarded people are pinned to their vault by `proxy.ts`, so a
  // link they could never follow is left out rather than bounced.
  const profileHref =
    offboarding === null && ability.can('update', 'Doctor') ? DOCTOR_PROFILE_PATH : undefined;
  const isChatEnabled = offboarding === null && isFeatureEnabled(claims, 'ai-chatbot');
  // P23-T11. Withheld during offboarding for the same reason the dashboard is: a
  // person working out their notice period has a reduced shell, and filing bugs
  // is not part of what they are still there to do.
  const isBugReportingEnabled = offboarding === null && isFeatureEnabled(claims, 'bug-reporting');
  const profile = resolveShellProfile(claims);
  const idlePolicy = resolveSessionIdlePolicy();
  // P19-T01. Same cookie read as the admin shell, so the choice follows the
  // person across both portals.
  const isSidebarOpen = resolveSidebarDefaultOpen(cookieStore.get(SIDEBAR_COOKIE_NAME)?.value);
  // P20-T02. While the profile is incomplete `proxy.ts` allows exactly one
  // page, so a sidebar, search and assistant would all be doors that bounce.
  // The completion screen gets the page to itself, with its own sign-out.
  if (offboarding === null && claims?.isProfileIncomplete === true) {
    return (
      <AppAbilityProvider rules={rules}>
        <main className="min-h-screen bg-background px-4 py-10 sm:px-8">
          <div className="mx-auto w-full max-w-2xl">{children}</div>
        </main>
        <IdleSessionGuard {...idlePolicy} />
      </AppAbilityProvider>
    );
  }
  return (
    <AppAbilityProvider rules={rules}>
      <AiAssistantProvider displayName={profile.displayName} assistantPath={DOCTOR_ASSISTANT_PATH}>
        <SidebarProvider style={SIDEBAR_STYLE} defaultOpen={isSidebarOpen}>
          <AppSidebar sections={sections} homeHref="/doctor/dashboard" />
          <SidebarInset className="min-w-0">
            <TopBar
              profile={profile}
              excludedNavHrefs={excludedNavHrefs}
              profileHref={profileHref}
              isBugReportingEnabled={isBugReportingEnabled}
            />
            {offboarding ? (
              <OffboardingBanner
                deadline={offboarding.deadline}
                vaultHref={offboarding.vaultHref}
              />
            ) : null}
            <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
              <div className="mx-auto w-full min-w-0 max-w-page">{children}</div>
            </main>
          </SidebarInset>
        </SidebarProvider>
        {isChatEnabled ? <ChatLauncher /> : null}
      </AiAssistantProvider>
      <IdleSessionGuard {...idlePolicy} />
    </AppAbilityProvider>
  );
}
