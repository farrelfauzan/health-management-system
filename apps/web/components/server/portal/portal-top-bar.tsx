import type { PortalShellValue } from '@hms/shared-types';
import { getTranslations } from 'next-intl/server';

import { PortalNavLink } from '#components/client/portal/portal-nav-link';
import { LanguageSwitcher } from '#components/client/shared/language-switcher';
import { ProfileMenu } from '#components/client/shell/profile-menu';
import { BrandMark } from '#components/shared/brand-mark';
import { FACILITY_CONFIG } from '#lib/facility/facility-config';
import type { ShellProfile } from '#lib/shell/shell-profile';

type PortalTopBarProps = {
  profile: ShellProfile;
  /** The shells this session may open, for the switcher (P22-T05). */
  openableShells?: readonly PortalShellValue[];
};

export async function PortalTopBar({ profile, openableShells }: PortalTopBarProps) {
  const t = await getTranslations('authShell.shell.portal');
  const tBrand = await getTranslations('authShell.shell.brand');
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b bg-card px-8 shadow-sm">
      <BrandMark
        size={36}
        label={tBrand('logoAlt', { facilityName: FACILITY_CONFIG.name })}
        className="size-9 shrink-0"
      />
      <span className="grid leading-tight">
        <span className="font-heading text-sm font-semibold text-slate-900">
          {FACILITY_CONFIG.name}
        </span>
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
        <ProfileMenu profile={profile} openableShells={openableShells} currentShell="PATIENT" />
      </div>
    </header>
  );
}
