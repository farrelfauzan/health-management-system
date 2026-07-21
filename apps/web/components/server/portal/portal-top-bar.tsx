import { Icon } from '@hms/ui';

import { ProfileMenu } from '#components/client/shell/profile-menu';
import type { ShellProfile } from '#lib/shell/shell-profile';

type PortalTopBarProps = {
  profile: ShellProfile;
};

export function PortalTopBar({ profile }: PortalTopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b bg-card px-8 shadow-sm">
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary-container text-white">
        <Icon name="local_hospital" size={20} />
      </span>
      <span className="grid leading-tight">
        <span className="font-heading text-sm font-semibold text-slate-900">Saling Jaga</span>
        <span className="text-xs text-muted-foreground">Patient Portal</span>
      </span>
      <div className="ml-auto flex items-center">
        <ProfileMenu profile={profile} />
      </div>
    </header>
  );
}
