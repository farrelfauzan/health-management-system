'use client';

import type { PatientAllergy } from '@hms/shared-types';
import { Badge } from '@hms/ui';

import { ALLERGY_SEVERITY_CLASSES } from '#lib/patients/allergy-severity-meta';

type PatientAllergyRowProps = {
  allergy: PatientAllergy;
};

export function PatientAllergyRow({ allergy }: PatientAllergyRowProps) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{allergy.substance}</p>
        {allergy.reaction ? <p className="text-sm text-slate-600">{allergy.reaction}</p> : null}
      </div>
      <Badge
        className={`shrink-0 rounded-full border-transparent text-[11px] font-medium ${ALLERGY_SEVERITY_CLASSES[allergy.severity]}`}
      >
        {allergy.severity}
      </Badge>
    </li>
  );
}
