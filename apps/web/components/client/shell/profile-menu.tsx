'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
          className="h-10 gap-2 px-2 data-[state=open]:bg-accent"
        >
          <AvatarInitials name={profile.displayName} size="sm" />
          <span className="grid max-w-32 text-left leading-tight">
            <span className="truncate font-heading text-sm font-medium">
              {profile.displayName}
            </span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {profile.roleLabel}
            </span>
          </span>
          <Icon name="expand_more" size={18} className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="grid leading-tight">
          <span className="truncate text-sm font-medium">{profile.displayName}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {profile.email || profile.roleLabel}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void executeLogout()}>
          <Icon name="logout" size={16} />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
