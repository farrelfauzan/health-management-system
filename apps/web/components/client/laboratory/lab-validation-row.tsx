'use client';

import type { LabOrderItemView, LabResultView } from '@hms/shared-types';
import { Button, TableCell, TableRow, cn } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { LabPreviousValue } from '#components/client/laboratory/lab-previous-value';
import { LabResultFlagChip } from '#components/client/laboratory/lab-result-flag-chip';
import { formatReferenceRange } from '#lib/laboratory/format-reference-range';
import { isCriticalLabFlag } from '#lib/laboratory/lab-result-flag-meta';
import { toResultReferenceRange } from '#lib/laboratory/to-result-reference-range';

type LabValidationRowProps = {
  item: LabOrderItemView;
  result: LabResultView | undefined;
  patientId: string;
  labOrderId: string;
  canAmend: boolean;
  onAmend: (item: LabOrderItemView, result: LabResultView) => void;
};

/**
 * One value as the verifier reads it (`P18-T08`): what was typed, the band it
 * was judged against — the row's own snapshot, never the catalog's current
 * one — and what this patient last had. A row with nothing typed says so,
 * because a report that omits what it was asked for is not a finished
 * report and the Rilis button stays off until it is.
 */
export function LabValidationRow({
  item,
  result,
  patientId,
  labOrderId,
  canAmend,
  onAmend,
}: LabValidationRowProps) {
  const t = useTranslations('operations.laboratory.validation');
  const tEntry = useTranslations('operations.laboratory.entry');
  const format = useFormatter();
  const range = result ? formatReferenceRange(toResultReferenceRange(result)) : null;
  const value = result ? (result.valueNumeric ?? result.valueCoded ?? result.valueText ?? '—') : '—';

  return (
    <TableRow
      className={cn(isCriticalLabFlag(result?.flag) && 'bg-red-50')}
      data-testid={`lab-validation-row-${item.id}`}
    >
      <TableCell>
        <p className="font-medium text-slate-900">{item.name}</p>
        <p className="text-xs text-slate-500">{item.code}</p>
      </TableCell>
      <TableCell>
        <span className="font-mono text-sm font-semibold text-slate-900">{value}</span>
        {result?.unit ? <span className="ml-1 text-xs text-slate-500">{result.unit}</span> : null}
        {result?.amendedFromId ? (
          <p className="mt-1 text-xs text-amber-800">
            {t('amendedFrom', { version: result.version, reason: result.amendReason ?? '' })}
          </p>
        ) : null}
      </TableCell>
      <TableCell>
        <LabResultFlagChip flag={result?.flag} />
      </TableCell>
      <TableCell className="text-xs text-slate-600">{range ?? tEntry('noRange')}</TableCell>
      <TableCell>
        <LabPreviousValue patientId={patientId} labOrderId={labOrderId} testCode={item.code} />
      </TableCell>
      <TableCell className="text-xs text-slate-500">
        {result
          ? t('enteredBy', {
              enteredAt: format.dateTime(new Date(result.enteredAt), {
                dateStyle: 'short',
                timeStyle: 'short',
              }),
            })
          : null}
      </TableCell>
      <TableCell className="text-right">
        {canAmend && result?.verifiedAt ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onAmend(item, result)}>
            {t('amend')}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
