'use client';

import type { PortalShellValue } from '@hms/shared-types';
import { DropdownMenuItem, DropdownMenuSeparator, Icon } from '@hms/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { writePreferredShellCookie } from '#lib/auth/preferred-shell-cookie';
import { SHELL_HOME_PATH } from '#lib/shell/shell-home-path';

type ShellSwitchMenuItemsProps = {
  openableShells: readonly PortalShellValue[];
  currentShell: PortalShellValue;
};

const SHELL_ICON: Readonly<Record<PortalShellValue, string>> = {
  ADMIN: 'admin_panel_settings',
  DOCTOR: 'stethoscope',
  PATIENT: 'person',
};

/**
 * "Switch to …" entries for every other shell this session may open (P22-T05).
 * A role holding the admin and doctor portal keys used to be pinned to the
 * admin shell with no way across. The choice is remembered, so signing in
 * again lands on the shell last used.
 */
export function ShellSwitchMenuItems({ openableShells, currentShell }: ShellSwitchMenuItemsProps) {
  const t = useTranslations('authShell.shell.profile.switchShell');
  const router = useRouter();
  const otherShells = openableShells.filter((shell) => shell !== currentShell);
  if (otherShells.length === 0) {
    return null;
  }
  function handleSwitch(shell: PortalShellValue): void {
    writePreferredShellCookie(shell);
    router.push(SHELL_HOME_PATH[shell]);
  }
  return (
    <>
      {otherShells.map((shell) => (
        <DropdownMenuItem key={shell} onSelect={() => handleSwitch(shell)}>
          <Icon name={SHELL_ICON[shell]} size={16} />
          {t(shell)}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
    </>
  );
}
