'use client';

import type { DoctorSessionCalendarItem } from '@hms/shared-types';
import { Button, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { isSessionChangeable } from '#lib/appointments/is-session-changeable';

type SessionChangeActionsProps = {
  session: DoctorSessionCalendarItem;
  onMove: () => void;
  onCancel: () => void;
};

/**
 * "Pindahkan sesi" and "Batalkan sesi" (P28-T05). Visible only to whoever may
 * update any session — the clinic administration; the API enforces the same
 * rule.
 */
export function SessionChangeActions({ session, onMove, onCancel }: SessionChangeActionsProps) {
  const t = useTranslations('operations.appointments.sessionChange');
  const ability = useAbility();
  if (!ability.can('update', 'AppointmentSession') || !isSessionChangeable(session)) {
    return null;
  }
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        {t('cancel')}
      </Button>
      <Button type="button" onClick={onMove}>
        {t('move')}
      </Button>
    </div>
  );
}
