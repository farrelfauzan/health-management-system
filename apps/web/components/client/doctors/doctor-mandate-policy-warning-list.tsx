'use client';

import type { DoctorMandatePolicyWarningValue } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type DoctorMandatePolicyWarningListProps = {
  warnings: DoctorMandatePolicyWarningValue[];
};

/**
 * Rules that inform rather than refuse (D-036 §3). The revoked Pasal 27's
 * tests are no longer hard law, and PP 28/2024 Pasal 745(3)'s one-to-three
 * month absence describes a delegation rather than bounding it — so the row
 * is recorded and the administrator is told, not stopped.
 */
export function DoctorMandatePolicyWarningList({
  warnings,
}: DoctorMandatePolicyWarningListProps) {
  const t = useTranslations('clinical');
  if (warnings.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-0.5">
      {warnings.map((warning) => (
        <li key={warning} className="text-xs break-words text-warning">
          {t(`doctors.mandates.policyWarning.${warning}`)}
        </li>
      ))}
    </ul>
  );
}
