'use client';

import { useTranslations } from 'next-intl';

import type { AppointmentSubject } from '@hms/shared-types';

type AppointmentSubjectMrnProps = {
  subject: AppointmentSubject;
};

/**
 * The line under a name in every appointment surface: a medical record number,
 * or the reason there isn't one yet (`P17-T02`).
 *
 * One component rather than the same ternary in six tables, because the two
 * cases must never diverge. A prospective patient booked over WhatsApp has no
 * MRN — none has been spent on them — and rendering that as a blank line reads
 * as a record whose number failed to load. A clerk who reads it that way
 * registers them again, which is the duplicate this whole flow exists to stop.
 */
export function AppointmentSubjectMrn({ subject }: AppointmentSubjectMrnProps) {
  const t = useTranslations('operations.appointments');

  if (subject.kind === 'PROSPECTIVE_PATIENT') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        {t('notYetRegistered')}
      </span>
    );
  }

  return <span className="block font-mono text-xs text-slate-500">{subject.mrn}</span>;
}
