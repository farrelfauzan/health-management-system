import Link from 'next/link';
import { Button, Icon, Separator, SidebarTrigger } from '@hms/ui';

import { GlobalSearch } from '#components/client/shell/global-search';
import { NotificationsMenu } from '#components/client/shell/notifications-menu';
import { ProfileMenu } from '#components/client/shell/profile-menu';
import type { ShellProfile } from '#lib/shell/shell-profile';

type TopBarProps = {
  profile: ShellProfile;
};

export function TopBar({ profile }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-4 border-b bg-card px-6 shadow-sm">
      <SidebarTrigger className="md:hidden" />
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="rounded-full text-muted-foreground"
        >
          <Link href="/admin/ai-assistant" aria-label="Open AI assistant">
            <Icon name="smart_toy" size={22} />
          </Link>
        </Button>
        <NotificationsMenu />
        <Separator orientation="vertical" className="mx-1 !h-6" />
        <ProfileMenu profile={profile} />
      </div>
    </header>
  );
}
