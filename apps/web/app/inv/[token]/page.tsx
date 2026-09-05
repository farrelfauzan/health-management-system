import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { DeliveryLinkCard } from '#components/client/document-delivery/delivery-link-card';
import { LanguageSwitcher } from '#components/client/shared/language-switcher';
import { LoginBrand } from '#components/server/auth/login-brand';

type DeliveryLinkPageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('authShell.deliveryLink');
  return { title: t('metadataTitle'), description: t('metadataDescription') };
}

/**
 * The public delivery-link route (P16-T25/T27, FR-E4-11): where a patient
 * lands from `<web>/inv/<token>` in a chat or an email.
 *
 * Deliberately outside `proxy.ts`'s matcher, like the invitation page: the
 * person opening it has no session and no account, so the auth gate would
 * bounce every patient to a login they cannot use.
 */
export default async function DeliveryLinkPage({ params }: DeliveryLinkPageProps) {
  const { token } = await params;
  const t = await getTranslations('authShell.deliveryLink');

  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between gap-4">
          <LoginBrand />
          <LanguageSwitcher />
        </div>
        <DeliveryLinkCard token={token} />
        <p className="text-xs text-slate-500">{t('footerNote')}</p>
      </div>
    </main>
  );
}
