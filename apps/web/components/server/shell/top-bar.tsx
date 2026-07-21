import Link from 'next/link';
import { Icon, Separator } from '@hms/ui';

import { GlobalSearch } from '#components/client/shell/global-search';
import { NotificationsMenu } from '#components/client/shell/notifications-menu';
import { ProfileMenu } from '#components/client/shell/profile-menu';
import type { ShellProfile } from '#lib/shell/shell-profile';

type TopBarProps = {
  profile: ShellProfile;
};

export function TopBar({ profile }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-6 border-b border-outline-variant bg-surface-container-lowest px-8 shadow-sm">
      <GlobalSearch />
      <div className="flex items-center gap-2">
        <Link
          href="/admin/ai-assistant"
          aria-label="Open AI assistant"
          className="flex size-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low"
        >
          <Icon name="smart_toy" size={22} />
        </Link>
        <NotificationsMenu />
        <Separator orientation="vertical" className="mx-2 !h-6 bg-outline-variant" />
        <ProfileMenu profile={profile} />
      </div>
    </header>
  );
}
