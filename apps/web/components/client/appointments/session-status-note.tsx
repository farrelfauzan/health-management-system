'use client';

import type { DoctorSessionCalendarItem } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type SessionStatusNoteProps = {
  session: DoctorSessionCalendarItem;
};

/** Where a moved session went, and why it was moved or cancelled (P28). */
export function SessionStatusNote({ session }: SessionStatusNoteProps) {
  const t = useTranslations('operations.appointments.sessionChange');
  if (!session.movedTo && !session.statusReason) {
    return null;
  }
  return (
    <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {session.movedTo ? <p className="font-medium">{t('movedTo', session.movedTo)}</p> : null}
      {session.statusReason ? <p>{t('statusReason', { reason: session.statusReason })}</p> : null}
    </div>
  );
}
