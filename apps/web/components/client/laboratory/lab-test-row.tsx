'use client';

import type { LabTestView } from '@hms/shared-types';
import { Badge, TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { formatRupiah } from '#lib/billing/format-rupiah';
import { formatReferenceRange } from '#lib/laboratory/format-reference-range';

type LabTestRowProps = {
  labTest: LabTestView;
};

export function LabTestRow({ labTest }: LabTestRowProps) {
  const t = useTranslations('operations.laboratory');
  const renderedRanges = labTest.referenceRanges.flatMap((range) => {
    const formatted = formatReferenceRange(range);
    return formatted === null ? [] : [{ id: range.id, sex: range.sex, formatted }];
  });

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{labTest.code}</TableCell>
      <TableCell>
        <span className="block">{labTest.name}</span>
        {labTest.loincCode ? (
          <span className="font-mono text-xs text-slate-500">LOINC {labTest.loincCode}</span>
        ) : (
          // An uncoded test works locally and is simply not reported, which is
          // worth saying on the row rather than leaving as a blank cell.
          <span className="text-xs text-slate-400">{t('noLoinc')}</span>
        )}
      </TableCell>
      <TableCell>{t(`specimenTypes.${labTest.specimenType}`)}</TableCell>
      <TableCell>
        {t(`resultTypes.${labTest.resultType}`)}
        {labTest.unit ? <span className="text-slate-500"> · {labTest.unit}</span> : null}
      </TableCell>
      <TableCell>
        {renderedRanges.length === 0 ? (
          <span className="text-xs text-slate-400">{t('noReferenceRange')}</span>
        ) : (
          <ul className="space-y-0.5 text-xs">
            {renderedRanges.map((range) => (
              <li key={range.id}>
                {range.sex ? (
                  <span className="text-slate-500">{t(`sexes.${range.sex}`)}: </span>
                ) : null}
                {range.formatted}
              </li>
            ))}
          </ul>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {labTest.price === undefined ? (
          <span className="text-xs text-slate-400">{t('unpriced')}</span>
        ) : (
          formatRupiah(labTest.price)
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={
            labTest.isActive
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-50 text-slate-600'
          }
        >
          {labTest.isActive ? t('active') : t('inactive')}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
