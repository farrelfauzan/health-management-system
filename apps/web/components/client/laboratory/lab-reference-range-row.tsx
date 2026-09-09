'use client';

import {
  Button,
  Icon,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { LabReferenceRangeDraft } from '#lib/laboratory/lab-reference-range-draft';

const ANY_SEX_VALUE = 'ANY';

type LabReferenceRangeRowProps = {
  draft: LabReferenceRangeDraft;
  index: number;
  isNumeric: boolean;
  disabled: boolean;
  onChange: (draft: LabReferenceRangeDraft) => void;
  onRemove: () => void;
};

/**
 * One band of the reference-range editor (`P18-T15`): who it applies to, and
 * what "normal" is for them. The numeric columns show for a NUMERIC test and
 * the normal-text column for the others, because a coded urine protein has a
 * normal answer ("Negatif") and no number to be above or below.
 */
export function LabReferenceRangeRow({
  draft,
  index,
  isNumeric,
  disabled,
  onChange,
  onRemove,
}: LabReferenceRangeRowProps) {
  const t = useTranslations('operations.laboratory.catalog.ranges');
  const rowLabel = t('row', { row: index + 1 });

  function setField(field: keyof LabReferenceRangeDraft, value: string): void {
    onChange({ ...draft, [field]: value });
  }

  return (
    <fieldset
      className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-4"
      data-testid="lab-reference-range-row"
    >
      <legend className="px-1 text-xs font-medium text-slate-600">{rowLabel}</legend>
      <label className="space-y-1 text-xs text-slate-600">
        {t('sex')}
        <Select
          value={draft.sex === '' ? ANY_SEX_VALUE : draft.sex}
          onValueChange={(value) => setField('sex', value === ANY_SEX_VALUE ? '' : value)}
          disabled={disabled}
        >
          <SelectTrigger aria-label={`${rowLabel} ${t('sex')}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_SEX_VALUE}>{t('anySex')}</SelectItem>
            <SelectItem value="MALE">{t('male')}</SelectItem>
            <SelectItem value="FEMALE">{t('female')}</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-1 text-xs text-slate-600">
        {t('ageMin')}
        <Input
          inputMode="numeric"
          value={draft.ageMinDays}
          disabled={disabled}
          onChange={(event) => setField('ageMinDays', event.target.value)}
        />
      </label>
      <label className="space-y-1 text-xs text-slate-600">
        {t('ageMax')}
        <Input
          inputMode="numeric"
          value={draft.ageMaxDays}
          disabled={disabled}
          onChange={(event) => setField('ageMaxDays', event.target.value)}
        />
      </label>
      <div className="flex items-end justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`${t('remove')} ${rowLabel}`}
        >
          <Icon name="delete" size={16} />
          {t('remove')}
        </Button>
      </div>
      {isNumeric ? (
        <>
          <label className="space-y-1 text-xs text-slate-600">
            {t('low')}
            <Input
              inputMode="decimal"
              value={draft.low}
              disabled={disabled}
              onChange={(event) => setField('low', event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-slate-600">
            {t('high')}
            <Input
              inputMode="decimal"
              value={draft.high}
              disabled={disabled}
              onChange={(event) => setField('high', event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-slate-600">
            {t('criticalLow')}
            <Input
              inputMode="decimal"
              value={draft.criticalLow}
              disabled={disabled}
              onChange={(event) => setField('criticalLow', event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-slate-600">
            {t('criticalHigh')}
            <Input
              inputMode="decimal"
              value={draft.criticalHigh}
              disabled={disabled}
              onChange={(event) => setField('criticalHigh', event.target.value)}
            />
          </label>
        </>
      ) : (
        <label className="col-span-2 space-y-1 text-xs text-slate-600 sm:col-span-4">
          {t('textNormal')}
          <Input
            value={draft.textNormal}
            disabled={disabled}
            onChange={(event) => setField('textNormal', event.target.value)}
          />
        </label>
      )}
    </fieldset>
  );
}
