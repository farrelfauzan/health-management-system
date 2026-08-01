import { getTranslations } from 'next-intl/server';
import { Separator, SidebarTrigger } from '@hms/ui';

import { AiAssistantTopBarLink } from '#components/client/shell/ai-assistant-top-bar-link';
import { GlobalSearch } from '#components/client/shell/global-search';
import { LanguageSwitcher } from '#components/client/shared/language-switcher';
import { NotificationsMenu } from '#components/client/shell/notifications-menu';
import { ProfileMenu } from '#components/client/shell/profile-menu';
import type { ShellProfile } from '#lib/shell/shell-profile';

type TopBarProps = {
  profile: ShellProfile;
};

export async function TopBar({ profile }: TopBarProps) {
  const t = await getTranslations('authShell.shell.topBar');
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-6 border-b bg-card px-8 shadow-sm">
      <SidebarTrigger className="md:hidden" />
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-2">
        <AiAssistantTopBarLink label={t('openAiAssistant')} />
        <NotificationsMenu />
        <LanguageSwitcher />
        <Separator orientation="vertical" className="mx-2 h-6!" />
        <ProfileMenu profile={profile} />
      </div>
    </header>
  );
}
