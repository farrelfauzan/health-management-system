'use client';

import {
  ENCOUNTER_CHILD_VISIT_PURPOSES,
  type EncounterChildVisitPurposeValue,
} from '@hms/shared-types';
import { Button, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

type EncounterChildVisitPurposeFieldProps = {
  value: EncounterChildVisitPurposeValue | null;
  onChange: (value: EncounterChildVisitPurposeValue) => void;
};

/**
 * The child visit purpose a midwife names when she opens an encounter for a
 * patient under five (P25-T03). A radio group built from `@hms/ui` buttons —
 * the UI package has no radio primitive — so only `SICK_CHILD` asks for the
 * MTBS authority and her own-authority visits are never blocked.
 */
export function EncounterChildVisitPurposeField({
  value,
  onChange,
}: EncounterChildVisitPurposeFieldProps) {
  const t = useTranslations('clinical');
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 font-heading text-xs text-slate-600">
        {t('encounters.childVisitPurpose.label')}
      </legend>
      <p className="text-xs text-slate-500">{t('encounters.childVisitPurpose.hint')}</p>
      <div role="radiogroup" aria-label={t('encounters.childVisitPurpose.label')} className="grid gap-2">
        {ENCOUNTER_CHILD_VISIT_PURPOSES.map((purpose) => (
          <Button
            key={purpose}
            type="button"
            role="radio"
            aria-checked={value === purpose}
            variant="outline"
            className={cn(
              'h-auto justify-start whitespace-normal py-2 text-left',
              value === purpose && 'border-primary bg-primary/10 text-primary',
            )}
            onClick={() => onChange(purpose)}
          >
            {t(`encounters.childVisitPurpose.options.${purpose}`)}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
