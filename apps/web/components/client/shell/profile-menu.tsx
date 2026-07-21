'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
} from '@hms/ui';

import { AvatarInitials } from '#components/shared/avatar-initials';
import { executeLogout } from '#lib/auth/logout';
import type { ShellProfile } from '#lib/shell/shell-profile';

type ProfileMenuProps = {
  profile: ShellProfile;
};

export function ProfileMenu({ profile }: ProfileMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label="Open profile menu"
          className="h-auto gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-container-low"
        >
          <AvatarInitials name={profile.displayName} size="sm" />
          <span className="flex flex-col items-start">
            <span className="font-heading text-sm font-medium leading-tight text-on-surface">
              {profile.displayName}
            </span>
            <span className="text-[11px] leading-tight text-on-surface-variant">
              {profile.roleLabel}
            </span>
          </span>
          <Icon name="expand_more" size={18} className="text-on-surface-variant" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem variant="destructive" onSelect={() => void executeLogout()}>
          <Icon name="logout" size={16} />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
