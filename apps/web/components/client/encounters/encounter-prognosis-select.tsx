'use client';

import type { EncounterPrognosisValue } from '@hms/shared-types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ENCOUNTER_PROGNOSIS_OPTIONS } from '#lib/encounters/encounter-prognosis-options';

const NOT_RECORDED_VALUE = 'NONE';

type EncounterPrognosisSelectProps = {
  value: EncounterPrognosisValue | null;
  isEditable: boolean;
  onChange: (value: EncounterPrognosisValue | null) => void;
};

/**
 * The prognosis the doctor records for the episode. "Not recorded" is a real
 * option rather than an empty state, because clearing a prognosis entered by
 * mistake has to be possible — and an unrecorded prognosis is never reported
 * as a favourable one.
 */
export function EncounterPrognosisSelect({
  value,
  isEditable,
  onChange,
}: EncounterPrognosisSelectProps) {
  const t = useTranslations('clinical');
  const selectedLabel = value ? t(`encounters.soap.prognosisOptions.${value}`) : null;
  return (
    <div>
      <label
        htmlFor="soap-prognosis"
        className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
      >
        {t('encounters.soap.prognosis')}
      </label>
      {isEditable ? (
        <Select
          value={value ?? NOT_RECORDED_VALUE}
          onValueChange={(selected) =>
            onChange(selected === NOT_RECORDED_VALUE ? null : (selected as EncounterPrognosisValue))
          }
        >
          <SelectTrigger id="soap-prognosis" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NOT_RECORDED_VALUE}>{t('common.notRecorded')}</SelectItem>
            {ENCOUNTER_PROGNOSIS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`encounters.soap.prognosisOptions.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p
          id="soap-prognosis"
          className="min-h-9 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
        >
          {selectedLabel ?? <span className="text-slate-400">{t('common.notRecorded')}</span>}
        </p>
      )}
    </div>
  );
}
