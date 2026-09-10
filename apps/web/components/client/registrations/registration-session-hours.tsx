'use client';

import type { RegistrationCheckInWindow } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type RegistrationSessionHoursProps = {
  todaySession?: RegistrationCheckInWindow;
};

/**
 * The doctor's practice hours for today, under their name in the queue row
 * (P19-T16). Absent hours are stated rather than left blank: "not practising
 * today" is why Check in is greyed out, and a missing line would read as a
 * loading gap.
 */
export function RegistrationSessionHours({ todaySession }: RegistrationSessionHoursProps) {
  const t = useTranslations('operations.registrations.session');
  if (!todaySession) {
    return <p className="text-xs text-warning-emphasis">{t('noSessionToday')}</p>;
  }
  return (
    <p className="text-xs text-slate-500">
      {t('todayHours', { start: todaySession.start, end: todaySession.end })}
    </p>
  );
}
