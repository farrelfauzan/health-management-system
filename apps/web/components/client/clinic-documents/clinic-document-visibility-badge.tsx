'use client';

import type { DocumentVisibilityValue } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type ClinicDocumentVisibilityBadgeProps = {
  visibility: DocumentVisibilityValue;
};

/**
 * Deliberately loud on `PATIENT` and `BOTH`, muted on `DOCTOR`.
 *
 * This column is the one thing on the screen with a consequence outside the
 * clinic: a document reachable by the patient channel can be quoted to a
 * stranger on WhatsApp, and the difference between "staff only" and "patients
 * too" is a single enum an admin sets once at upload and rarely revisits.
 * Colouring the patient-reachable states rather than all three makes the
 * scannable question "what can the bot say to patients?" answerable down the
 * column instead of row by row.
 */
export function ClinicDocumentVisibilityBadge({
  visibility,
}: ClinicDocumentVisibilityBadgeProps) {
  const t = useTranslations('clinicCorpus.visibility');
  const isPatientReachable = visibility === 'PATIENT' || visibility === 'BOTH';

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        isPatientReachable ? 'bg-sky-100 text-sky-900' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {t(`labels.${visibility}`)}
    </span>
  );
}
