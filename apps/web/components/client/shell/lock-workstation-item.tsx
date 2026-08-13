'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { DropdownMenuItem, Icon } from '@hms/ui';

import { endSession } from '#lib/auth/end-session';
import { openSessionChannel } from '#lib/auth/session-channel';

/**
 * The one-click hand-off (SJ-9).
 *
 * Sits above logout in the menu because it is the action a clinic wants used
 * twenty times a day, where logout is an end-of-shift thing. Mechanically the
 * two are the same locally — family revoked, cache cleared, redirected — and
 * they share `endSession` precisely so they cannot drift.
 *
 * The channel message goes out before the teardown so the other tabs learn
 * about it while this one still exists to send it; a `BroadcastChannel` closed
 * by a navigation delivers nothing.
 */
export function LockWorkstationItem() {
  const t = useTranslations('authShell.shell.profile');
  const queryClient = useQueryClient();

  const handleLock = (): void => {
    const channel = openSessionChannel(() => undefined);
    channel.post({ kind: 'SESSION_ENDED' });
    channel.close();
    void endSession('LOCK', queryClient);
  };

  return (
    <DropdownMenuItem onSelect={handleLock}>
      <Icon name="lock" size={16} />
      {t('lockWorkstation')}
    </DropdownMenuItem>
  );
}
