'use client';

import type { VitalSignsResponse } from '@hms/shared-types';

import { formatRegisteredAt } from '#lib/registrations/format-registered-at';
import { VITAL_SIGNS_FIELDS } from '#lib/encounters/vital-signs-fields';

type EncounterVitalsRowProps = {
  vitalSigns: VitalSignsResponse;
};

export function EncounterVitalsRow({ vitalSigns }: EncounterVitalsRowProps) {
  const measured = VITAL_SIGNS_FIELDS.filter((field) => vitalSigns[field.key] !== undefined);

  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">
          {formatRegisteredAt(vitalSigns.recordedAt)}
        </p>
        {vitalSigns.bodyMassIndex !== undefined ? (
          <p className="text-xs text-slate-500">
            BMI <span className="font-medium text-slate-700">{vitalSigns.bodyMassIndex}</span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {measured.map((field) => (
          <p key={field.key} className="text-sm text-slate-700">
            <span className="text-xs text-slate-500">{field.label}</span>{' '}
            <span className="font-medium">{vitalSigns[field.key]}</span>{' '}
            <span className="text-xs text-slate-400">{field.unit}</span>
          </p>
        ))}
      </div>
      {vitalSigns.notes ? (
        <p className="mt-2 text-xs text-slate-500">{vitalSigns.notes}</p>
      ) : null}
    </li>
  );
}
