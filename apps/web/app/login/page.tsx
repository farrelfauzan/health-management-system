import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { LanguageSwitcher } from '#components/client/shared/language-switcher';
import { LoginBrand } from '#components/server/auth/login-brand';
import { LoginCard } from '#components/server/auth/login-card';
import { LoginVisualPanel } from '#components/server/auth/login-visual-panel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('authShell.auth.metadata');
  return { title: t('title'), description: t('description') };
}

export default async function LoginPage() {
  const t = await getTranslations('authShell.auth');
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <LoginVisualPanel />
      <div className="flex min-w-0 items-center justify-center bg-white px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex items-center justify-between gap-4">
            <LoginBrand />
            <LanguageSwitcher />
          </div>
          <LoginCard />
          <p className="text-xs text-slate-500">{t('authorizedOnly')}</p>
        </div>
      </div>
    </main>
  );
}
