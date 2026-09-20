'use client';

import type { ProcedureMandateSummary } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type ProcedureMandateNoteProps = {
  mandate: ProcedureMandateSummary;
};

/**
 * Who answers for a procedure a midwife recorded under a doctor's pelimpahan
 * (P25-T05). Under a MANDATE responsibility stayed with the granting doctor;
 * under a DELEGATION it moved to her — which is why the form is named and not
 * just the doctor.
 */
export function ProcedureMandateNote({ mandate }: ProcedureMandateNoteProps) {
  const t = useTranslations('clinical');
  return (
    <p className="text-xs font-medium text-primary">
      {t(`encounters.procedure.mandate.${mandate.kind}`, {
        name: mandate.mandatingDoctorName,
      })}
    </p>
  );
}
