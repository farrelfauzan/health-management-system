import { Icon } from '@hms/ui';
import { getTranslations } from 'next-intl/server';

import { PortalNavLink } from '#components/client/portal/portal-nav-link';
import { LanguageSwitcher } from '#components/client/shared/language-switcher';
import { ProfileMenu } from '#components/client/shell/profile-menu';
import type { ShellProfile } from '#lib/shell/shell-profile';

type PortalTopBarProps = {
  profile: ShellProfile;
};

export async function PortalTopBar({ profile }: PortalTopBarProps) {
  const t = await getTranslations('authShell.shell.portal');
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b bg-card px-8 shadow-sm">
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary-container text-white">
        <Icon name="local_hospital" size={20} />
      </span>
      <span className="grid leading-tight">
        <span className="font-heading text-sm font-semibold text-slate-900">Saling Jaga</span>
        <span className="text-xs text-muted-foreground">{t('name')}</span>
      </span>
      {/* The portal had one screen and reached it by redirect; a second one
          needs somewhere to be linked from, or it exists and nobody finds it. */}
      <nav aria-label={t('nav.label')} className="ml-6 flex items-center gap-1">
        <PortalNavLink href="/portal/registrations" label={t('nav.registrations')} />
        <PortalNavLink href="/portal/documents" label={t('nav.documents')} />
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <LanguageSwitcher />
        <ProfileMenu profile={profile} />
      </div>
    </header>
  );
}
