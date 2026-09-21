'use client';

import type { ShkScreeningView } from '@hms/shared-types';
import { Button, TableCell, TableRow } from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

import { ShkStatusChip } from '#components/client/maternal-care/shk-status-chip';
import { resolveShkNextAction } from '#lib/maternal-care/resolve-shk-next-action';
import type { ShkRowAction } from '#lib/maternal-care/shk-row-action';

type ShkWorklistRowProps = {
  screening: ShkScreeningView;
  patientDetailBasePath: string;
  canWrite: boolean;
  onAction: (action: ShkRowAction, screening: ShkScreeningView) => void;
};

/**
 * One SHK sample on the worklist (P25-T10): whose baby, the window, where the
 * sample stands, and the one next step it is waiting for.
 */
export function ShkWorklistRow({
  screening,
  patientDetailBasePath,
  canWrite,
  onAction,
}: ShkWorklistRowProps) {
  const t = useTranslations('maternalCare.shk');
  const format = useFormatter();
  const nextAction = resolveShkNextAction(screening);
  const babyLabel = screening.newbornName ?? t('babyOf', { motherName: screening.motherName });
  const formatInstant = (value: string): string =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <TableRow data-testid={`shk-worklist-row-${screening.id}`}>
      <TableCell>
        <Link
          href={`${patientDetailBasePath}/${screening.motherPatientId}?tab=pregnancy`}
          className="font-medium text-slate-900 hover:underline"
        >
          {babyLabel}
        </Link>
        <p className="text-xs text-slate-500">
          {t('bornAt', { birthAt: formatInstant(screening.birthAt) })}
        </p>
      </TableCell>
      <TableCell className="text-sm text-slate-700">
        {t('window', {
          dueFrom: formatInstant(screening.dueFrom),
          dueUntil: formatInstant(screening.dueUntil),
        })}
      </TableCell>
      <TableCell>
        <ShkStatusChip
          status={screening.status}
          result={screening.result}
          sequence={screening.sequence}
        />
      </TableCell>
      <TableCell className="text-xs text-slate-600">
        {screening.laboratoryName ?? '—'}
      </TableCell>
      <TableCell className="text-sm text-slate-700">{screening.attendantName}</TableCell>
      <TableCell className="text-right">
        {canWrite && nextAction !== null ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onAction(nextAction, screening)}
          >
            {t(`actions.${nextAction}`)}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
