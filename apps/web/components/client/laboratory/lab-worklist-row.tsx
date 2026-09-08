'use client';

import type { LabWorklistItem } from '@hms/shared-types';
import { Badge, Button, Icon, TableCell, TableRow, useAbility } from '@hms/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { LabPriorityBadge } from '#components/client/laboratory/lab-priority-badge';
import { formatWaitingTime } from '#lib/laboratory/format-waiting-time';

type LabWorklistRowProps = {
  item: LabWorklistItem;
  isCollectable: boolean;
  onCollect: (item: LabWorklistItem) => void;
};

/**
 * One order on the bench's list (`P18-T08`): who, what, how urgent, how long.
 *
 * The identity block is the worklist's own — name, MRN, sex and age — and
 * nothing clinical beyond the doctor's one-line note: a laboratory worklist
 * is not a route into the medical record. The badges are the three facts a
 * bench acts on before touching a tube: fasting, a re-draw, and (where the
 * clinic collects up front) an unsettled visit.
 */
export function LabWorklistRow({ item, isCollectable, onCollect }: LabWorklistRowProps) {
  const t = useTranslations('operations.laboratory.worklist');
  const tCatalog = useTranslations('operations.laboratory');
  const ability = useAbility();
  const waiting = formatWaitingTime(item.orderedAt);
  const liveSpecimens = item.specimens.filter((specimen) => specimen.status !== 'REJECTED');

  return (
    <TableRow data-testid={`lab-worklist-row-${item.id}`}>
      <TableCell>
        <p className="font-medium text-slate-900">{item.patient.fullName}</p>
        <p className="text-xs text-slate-500">
          {item.patient.mrn} ·{' '}
          {t('sexAge', {
            sex: tCatalog(`sexes.${item.patient.sex}`),
            age: item.patient.ageYears,
          })}
        </p>
      </TableCell>
      <TableCell>
        <p className="font-mono text-sm text-slate-900">{item.orderNumber}</p>
        {item.clinicalNotes ? (
          <p className="max-w-xs truncate text-xs text-slate-500" title={item.clinicalNotes}>
            {item.clinicalNotes}
          </p>
        ) : null}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-sm text-slate-700">{t('testCount', { count: item.itemCount })}</span>
          {item.isFasting ? <Badge variant="secondary">{t('fasting')}</Badge> : null}
          {item.recollectCount > 0 ? (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800">
              {t('recollect', { count: item.recollectCount })}
            </Badge>
          ) : null}
          {item.isAwaitingPayment ? (
            <Badge variant="secondary" className="bg-red-100 text-red-800">
              {t('awaitingPayment')}
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <LabPriorityBadge priority={item.priority} />
      </TableCell>
      <TableCell className="text-sm text-slate-700">
        {t(`ago.${waiting.unit}`, { count: waiting.count })}
      </TableCell>
      <TableCell className="text-xs text-slate-600">
        {liveSpecimens.length === 0
          ? '—'
          : liveSpecimens.map((specimen) => specimen.accessionNumber).join(', ')}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          {isCollectable && ability.can('write', 'LabSpecimen') ? (
            <Button type="button" size="sm" onClick={() => onCollect(item)}>
              <Icon name="vaccines" size={16} />
              {t('collect')}
            </Button>
          ) : null}
          <Button asChild type="button" size="sm" variant="outline">
            <Link href={`/admin/laboratory/${item.id}`}>{t('open')}</Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
