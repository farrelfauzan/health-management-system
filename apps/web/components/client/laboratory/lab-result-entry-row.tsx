'use client';

import type { LabFlagPreview } from '#lib/laboratory/preview-lab-flag';
import type { LabOrderItemView, LabTestView } from '@hms/shared-types';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableCell,
  TableRow,
  Textarea,
  cn,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabResultFlagChip } from '#components/client/laboratory/lab-result-flag-chip';
import { formatReferenceRange } from '#lib/laboratory/format-reference-range';
import { isCriticalLabFlag } from '#lib/laboratory/lab-result-flag-meta';

export type LabResultDraft = {
  valueNumeric: string;
  valueText: string;
  valueCoded: string;
};

type LabResultEntryRowProps = {
  item: LabOrderItemView;
  labTest: LabTestView | undefined;
  draft: LabResultDraft;
  preview: LabFlagPreview;
  isDirty: boolean;
  disabled: boolean;
  onChange: (draft: LabResultDraft) => void;
  onBlur: () => void;
};

/**
 * One test on the worksheet (`P18-T08`): a keypad-friendly number with its
 * unit, a select for a coded test, a textarea for prose — and the flag the
 * server will write, shown before the value is saved. A critical preview says
 * so in words as well as colour, because the number is about to ring a bell.
 */
export function LabResultEntryRow({
  item,
  labTest,
  draft,
  preview,
  isDirty,
  disabled,
  onChange,
  onBlur,
}: LabResultEntryRowProps) {
  const t = useTranslations('operations.laboratory.entry');
  const range = preview.range
    ? formatReferenceRange({
        id: item.id,
        ...(preview.range.refLow === null ? {} : { low: preview.range.refLow }),
        ...(preview.range.refHigh === null ? {} : { high: preview.range.refHigh }),
        ...(preview.range.refText === null ? {} : { textNormal: preview.range.refText }),
      })
    : null;

  return (
    <TableRow
      className={cn(isCriticalLabFlag(preview.flag ?? undefined) && 'bg-red-50')}
      data-testid={`lab-entry-row-${item.id}`}
    >
      <TableCell>
        <p className="font-medium text-slate-900">{item.name}</p>
        <p className="text-xs text-slate-500">{item.code}</p>
      </TableCell>
      <TableCell>
        {item.resultType === 'NUMERIC' ? (
          <Input
            type="text"
            inputMode="decimal"
            aria-label={item.name}
            className="w-32 text-right font-mono"
            value={draft.valueNumeric}
            disabled={disabled}
            onChange={(event) => onChange({ ...draft, valueNumeric: event.target.value })}
            onBlur={onBlur}
          />
        ) : item.resultType === 'CODED' ? (
          <Select
            value={draft.valueCoded}
            disabled={disabled}
            onValueChange={(value) => {
              onChange({ ...draft, valueCoded: value });
              onBlur();
            }}
          >
            <SelectTrigger aria-label={item.name} className="w-44">
              <SelectValue placeholder={t('codedPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {(labTest?.codedOptions ?? []).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Textarea
            aria-label={item.name}
            className="min-h-10 w-64"
            rows={1}
            value={draft.valueText}
            placeholder={t('textPlaceholder')}
            disabled={disabled}
            onChange={(event) => onChange({ ...draft, valueText: event.target.value })}
            onBlur={onBlur}
          />
        )}
      </TableCell>
      <TableCell className="text-sm text-slate-600">{labTest?.unit ?? '—'}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <LabResultFlagChip flag={preview.flag ?? undefined} />
          {isDirty ? <span className="text-xs text-amber-700">•</span> : null}
        </div>
        {isCriticalLabFlag(preview.flag ?? undefined) ? (
          <p className="mt-1 text-xs text-red-700">{t('critical')}</p>
        ) : null}
      </TableCell>
      <TableCell className="text-xs text-slate-600">{range ?? t('noRange')}</TableCell>
    </TableRow>
  );
}
