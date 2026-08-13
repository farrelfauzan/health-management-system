import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { AiAssistantProvider } from '#components/client/ai-assistant/ai-assistant-provider';
import { ChatLauncher } from '#components/client/ai-assistant/chat-launcher';
import { AppAbilityProvider } from '#components/client/app-ability-provider';
import { IdleSessionGuard } from '#components/client/shell/idle-session-guard';
import { PortalTopBar } from '#components/server/portal/portal-top-bar';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { resolveSessionIdlePolicy } from '#lib/shell/session-idle-policy';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';
import { resolveAppAbilityRules } from '#lib/rbac/app-ability.server';
import { resolveShellProfile } from '#lib/shell/shell-profile';

type PortalLayoutProps = {
  children: ReactNode;
};

export default async function PortalLayout({ children }: PortalLayoutProps) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const sessionHint = cookieStore.get(SESSION_HINT_COOKIE_NAME)?.value;
  const claims = resolveSessionClaims({ accessToken, sessionHint });
  const rules = resolveAppAbilityRules(claims);
  const profile = resolveShellProfile(claims);
  const idlePolicy = resolveSessionIdlePolicy();
  return (
    <AppAbilityProvider rules={rules}>
      {/*
        No `assistantPath`: the portal has no assistant screen yet, so the
        launcher stays hidden rather than sending a patient to a route the
        request gate bounces. Giving patients one needs a patient-appropriate
        prompt set first — the current prompts ("summarize today's patient
        load", "draft discharge for Room 402") are written for clinicians.
      */}
      <AiAssistantProvider displayName={profile.displayName} channel="PATIENT">
        <div className="flex min-h-svh flex-col bg-surface">
          <PortalTopBar profile={profile} />
          <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
            <div className="mx-auto w-full min-w-0 max-w-5xl">{children}</div>
          </main>
        </div>
        <ChatLauncher />
      </AiAssistantProvider>
      <IdleSessionGuard {...idlePolicy} />
    </AppAbilityProvider>
  );
}
