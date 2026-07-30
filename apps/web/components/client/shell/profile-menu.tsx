'use client';

import { useTranslations } from 'next-intl';

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
  const t = useTranslations('authShell.shell.profile');
  const displayName = profile.isFallbackName ? t('fallbackName') : profile.displayName;
  const roleLabel = profile.roleKey ? t(`roles.${profile.roleKey}`) : profile.roleLabel;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label={t('openMenu')}
          className="h-10 gap-2 px-2 data-[state=open]:bg-accent"
        >
          <AvatarInitials name={displayName} size="sm" />
          <span className="grid max-w-32 text-left leading-tight">
            <span className="truncate font-heading text-sm font-medium">{displayName}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{roleLabel}</span>
          </span>
          <Icon name="expand_more" size={18} className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="grid leading-tight">
          <span className="truncate text-sm font-medium">{displayName}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {profile.email || roleLabel}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void executeLogout()}>
          <Icon name="logout" size={16} />
          {t('logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
