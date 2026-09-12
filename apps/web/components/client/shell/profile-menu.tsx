'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
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
import { ReportABugItem } from '#components/client/bug-report/report-a-bug-item';
import { LockWorkstationItem } from '#components/client/shell/lock-workstation-item';
import { endSession } from '#lib/auth/end-session';
import type { ShellProfile } from '#lib/shell/shell-profile';

type ProfileMenuProps = {
  profile: ShellProfile;
  /**
   * Where "My profile" goes (P20-T03). Only the doctor shell has a
   * self-service profile today, so the admin shell passes nothing and the
   * item is simply absent — a pharmacist or an administrator has no profile
   * record to open until P20-T04 decides what one is.
   */
  profileHref?: string;
  /**
   * Whether "Report a bug" may appear (P23-T11). Passed rather than read here
   * because the feature flags live in the session claims, which the server
   * layouts already resolve. The patient portal leaves it unset and the item is
   * simply absent — patients are not reporters.
   */
  isBugReportingEnabled?: boolean;
};

export function ProfileMenu({
  profile,
  profileHref,
  isBugReportingEnabled = false,
}: ProfileMenuProps) {
  const t = useTranslations('authShell.shell.profile');
  const queryClient = useQueryClient();
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
        {profileHref ? (
          <DropdownMenuItem asChild>
            <Link href={profileHref}>
              <Icon name="account_circle" size={16} />
              {t('myProfile')}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {/*
          Lock sits above logout: handing the workstation to a colleague is the
          twenty-times-a-day action, signing off for the night is not (SJ-9).
        */}
        <LockWorkstationItem />
        <ReportABugItem isEnabled={isBugReportingEnabled} />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void endSession('LOGOUT', queryClient)}
        >
          <Icon name="logout" size={16} />
          {t('logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
