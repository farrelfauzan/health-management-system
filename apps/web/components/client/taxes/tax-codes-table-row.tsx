'use client';

import type { TaxCodeView } from '@hms/shared-types';
import { Badge, Button, TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TaxTreatmentBadge } from '#components/client/taxes/tax-treatment-badge';
import { formatTaxRate } from '#lib/taxes/format-tax-rate';

type TaxCodesTableRowProps = {
  taxCode: TaxCodeView;
  canWrite: boolean;
  onEdit: (taxCode: TaxCodeView) => void;
  onAddRate: (taxCode: TaxCodeView) => void;
};

/**
 * One tax code. A rate that starts later than today is shown beside the
 * current one, so a scheduled PMK change is visible before it bites.
 */
export function TaxCodesTableRow({ taxCode, canWrite, onEdit, onAddRate }: TaxCodesTableRowProps) {
  const t = useTranslations('operations.taxes.codes');
  const upcomingRate = taxCode.rates.find(
    (rate) => rate.effectiveFrom > (taxCode.currentRate?.effectiveFrom ?? ''),
  );

  return (
    <TableRow>
      <TableCell>
        <p className="font-mono text-xs font-semibold text-slate-900">{taxCode.code}</p>
        <p className="text-xs text-slate-500">{taxCode.name}</p>
        {taxCode.isSystem ? <p className="text-[11px] text-slate-400">{t('system')}</p> : null}
      </TableCell>
      <TableCell>
        <TaxTreatmentBadge treatment={taxCode.ppnTreatment} />
      </TableCell>
      <TableCell className="font-mono text-xs">{taxCode.fakturTransactionCode ?? '—'}</TableCell>
      <TableCell className="text-sm">
        {taxCode.currentRate ? formatTaxRate(taxCode.currentRate) : '—'}
        {upcomingRate ? (
          <p className="text-xs text-amber-700">
            {t('upcomingRate', {
              rate: formatTaxRate(upcomingRate),
              date: upcomingRate.effectiveFrom,
            })}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="text-xs text-slate-600">
        {t('usage', { defaults: taxCode.defaultTargets.length, overrides: taxCode.overrideCount })}
      </TableCell>
      <TableCell>
        <Badge variant={taxCode.isActive ? 'default' : 'outline'}>
          {t(taxCode.isActive ? 'active' : 'inactive')}
        </Badge>
      </TableCell>
      {canWrite ? (
        <TableCell className="space-x-2 whitespace-nowrap">
          <Button type="button" variant="outline" size="sm" onClick={() => onEdit(taxCode)}>
            {t('edit')}
          </Button>
          {taxCode.ppnTreatment === 'STANDARD' ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onAddRate(taxCode)}>
              {t('addRate')}
            </Button>
          ) : null}
        </TableCell>
      ) : null}
    </TableRow>
  );
}
