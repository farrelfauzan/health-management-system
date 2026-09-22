'use client';

import type { NonCapitationRecapLine } from '@hms/shared-types';
import { Checkbox, Icon, TableCell, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { NonCapitationStatusChip } from '#components/client/integrations/non-capitation-status-chip';
import { formatRupiah } from '#lib/billing/format-rupiah';

type NonCapitationRecapRowProps = {
  line: NonCapitationRecapLine;
  isSelectable: boolean;
  isSelected: boolean;
  onSelectedChange: (isSelected: boolean) => void;
};

/**
 * One payable unit (P25-T16): participant, service, date, tariff, the
 * document checklist by category, and the claim status. Nothing clinical is
 * on the line to show (D-033).
 */
export function NonCapitationRecapRow({
  line,
  isSelectable,
  isSelected,
  onSelectedChange,
}: NonCapitationRecapRowProps) {
  const t = useTranslations('operations.integrations.nonCapitation');
  const tCategory = useTranslations('clinical.patients.documents.categories');
  const format = useFormatter();
  const formatDay = (value: string): string =>
    format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });
  const selectable = isSelectable && line.status !== 'SENT' && line.status !== 'EXPIRED';

  return (
    <TableRow>
      <TableCell>
        {selectable ? (
          <Checkbox
            aria-label={t('recap.selectLine')}
            checked={isSelected}
            onCheckedChange={(checked) => onSelectedChange(checked === true)}
          />
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap">{formatDay(line.serviceDate)}</TableCell>
      <TableCell>
        <div className="font-medium">{line.patientName}</div>
        {line.bpjsNumberLast4 === null ? null : (
          <div className="text-xs text-slate-500">BPJS ····{line.bpjsNumberLast4}</div>
        )}
      </TableCell>
      <TableCell>
        <div>{t(`serviceTypes.${line.serviceType}`)}</div>
        {line.visitLabel === null ? null : (
          <div className="text-xs text-slate-500">{line.visitLabel}</div>
        )}
      </TableCell>
      <TableCell>
        {line.examinerProfession === null ? '-' : t(`professions.${line.examinerProfession}`)}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {line.tariffAmount === null ? (
          <span className="text-warning">{t('recap.unpricedValue')}</span>
        ) : (
          <span title={line.regulationReference ?? undefined}>
            {formatRupiah(line.tariffAmount)}
          </span>
        )}
      </TableCell>
      <TableCell>
        <ul className="space-y-0.5 text-xs">
          {line.documents.map((document) => (
            <li
              key={document.category}
              className={document.isPresent ? 'text-success' : 'text-danger'}
            >
              <Icon name={document.isPresent ? 'check' : 'close'} size={14} />{' '}
              {tCategory(document.category)}
            </li>
          ))}
        </ul>
      </TableCell>
      <TableCell>
        <NonCapitationStatusChip status={line.status} />
      </TableCell>
      <TableCell className="whitespace-nowrap">{formatDay(line.expiresOn)}</TableCell>
    </TableRow>
  );
}
