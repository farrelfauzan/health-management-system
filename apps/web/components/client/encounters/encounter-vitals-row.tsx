'use client';

import type { VitalSignsResponse } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

import { VITAL_SIGNS_FIELDS } from '#lib/encounters/vital-signs-fields';

type EncounterVitalsRowProps = {
  vitalSigns: VitalSignsResponse;
};

export function EncounterVitalsRow({ vitalSigns }: EncounterVitalsRowProps) {
  const t = useTranslations('clinical');
  const format = useFormatter();
  const measured = VITAL_SIGNS_FIELDS.filter((field) => vitalSigns[field.key] !== undefined);

  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">
          {format.dateTime(new Date(vitalSigns.recordedAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </p>
        {vitalSigns.bodyMassIndex !== undefined ? (
          <p className="text-xs text-slate-500">
            {t('encounters.bmi')}{' '}
            <span className="font-medium text-slate-700">
              {format.number(vitalSigns.bodyMassIndex)}
            </span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {measured.map((field) => (
          <p key={field.key} className="text-sm text-slate-700">
            <span className="text-xs text-slate-500">{field.label}</span>{' '}
            <span className="font-medium">{format.number(vitalSigns[field.key] as number)}</span>{' '}
            <span className="text-xs text-slate-400">{field.unit}</span>
          </p>
        ))}
      </div>
      {vitalSigns.notes ? <p className="mt-2 text-xs text-slate-500">{vitalSigns.notes}</p> : null}
    </li>
  );
}
