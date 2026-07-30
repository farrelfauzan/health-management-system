'use client';

import type { DoctorSessionCalendarItem } from '@hms/shared-types';
import { cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

type SessionCalendarBlockProps = {
  session: DoctorSessionCalendarItem;
  onSelect: (session: DoctorSessionCalendarItem) => void;
};

function formatPatientTotal(session: DoctorSessionCalendarItem): string {
  const patientLabel = session.bookedCount === 1 ? 'patient' : 'patients';
  if (session.maxPatients === null) {
    return `${session.bookedCount} ${patientLabel}`;
  }
  return `${session.bookedCount}/${session.maxPatients} ${patientLabel}`;
}

export function SessionCalendarBlock({ session, onSelect }: SessionCalendarBlockProps) {
  const t = useTranslations('operations.appointments');
  const isCancelled = session.status === 'CANCELLED';
  return (
    <button
      type="button"
      onClick={() => onSelect(session)}
      className={cn(
        'flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-xs transition-colors',
        isCancelled
          ? 'border-danger bg-danger-tint/60 text-danger hover:bg-danger-tint'
          : 'border-primary bg-info-tint text-primary hover:bg-info-tint/70',
      )}
    >
      <span className="truncate font-semibold">{session.doctor.fullName}</span>
      <span className="truncate text-[11px] opacity-80">
        {session.startTime}–{session.endTime}
      </span>
      <span className="truncate text-[11px] font-medium">
        {formatPatientTotal(session)}
        {isCancelled ? ` · ${t('cancel')}` : ''}
      </span>
    </button>
  );
}
