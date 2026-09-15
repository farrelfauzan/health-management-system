'use client';

import {
  CONTRACEPTIVE_IMPLANT_ACTIONS,
  type ContraceptiveImplantActionValue,
} from '@hms/shared-types';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

const NO_IMPLANT_VALUE = 'NONE';

type EncounterImplantActionSelectProps = {
  value: ContraceptiveImplantActionValue | null;
  onChange: (value: ContraceptiveImplantActionValue | null) => void;
};

/**
 * Marks a procedure as a contraceptive implant insertion or removal (P25-T03).
 * No ICD-9-CM code names an implant, so this flag is what tells the API a
 * midwife needs the IUD & implant authority for it.
 */
export function EncounterImplantActionSelect({ value, onChange }: EncounterImplantActionSelectProps) {
  const t = useTranslations('clinical');
  return (
    <div className="min-w-48">
      <Label htmlFor="procedure-implant-action" className="mb-1.5 font-heading text-xs text-slate-600">
        {t('encounters.procedure.implantAction.label')}
      </Label>
      <Select
        value={value ?? NO_IMPLANT_VALUE}
        onValueChange={(selected) =>
          onChange(
            selected === NO_IMPLANT_VALUE ? null : (selected as ContraceptiveImplantActionValue),
          )
        }
      >
        <SelectTrigger id="procedure-implant-action" className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_IMPLANT_VALUE}>
            {t('encounters.procedure.implantAction.none')}
          </SelectItem>
          {CONTRACEPTIVE_IMPLANT_ACTIONS.map((action) => (
            <SelectItem key={action} value={action}>
              {t(`encounters.procedure.implantAction.${action}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
