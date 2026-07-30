import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button, Icon, Separator, SidebarTrigger } from '@hms/ui';

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
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="relative rounded-full text-muted-foreground"
        >
          <Link href="/admin/ai-assistant" aria-label={t('openAiAssistant')}>
            <Icon name="smart_toy" size={22} />
            <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-card bg-secondary" />
          </Link>
        </Button>
        <NotificationsMenu />
        <LanguageSwitcher />
        <Separator orientation="vertical" className="mx-2 h-6!" />
        <ProfileMenu profile={profile} />
      </div>
    </header>
  );
}
