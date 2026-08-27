import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { LanguageSwitcher } from '#components/client/shared/language-switcher';
import { AcceptInvitationCard } from '#components/client/invitations/accept-invitation-card';
import { LoginBrand } from '#components/server/auth/login-brand';

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('authShell.invite');
  return { title: t('metadataTitle'), description: t('metadataDescription') };
}

/**
 * The public invitation-accept route (IMP-23).
 *
 * Deliberately outside `proxy.ts`'s matcher: the person opening it has no
 * session and no account, so the auth gate would bounce every legitimate
 * invitee straight to the login page they cannot use yet.
 */
export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const t = await getTranslations('authShell.invite');

  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between gap-4">
          <LoginBrand />
          <LanguageSwitcher />
        </div>
        <AcceptInvitationCard token={token} />
        <p className="text-xs text-slate-500">{t('footerNote')}</p>
      </div>
    </main>
  );
}
