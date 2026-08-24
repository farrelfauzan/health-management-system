'use client';

import type { AdmissionResponse } from '@hms/shared-types';
import { TableCell, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { RowActionsMenu } from '#components/client/shared/row-actions-menu';
import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';
import { StatusBadge } from '#components/shared/status-badge';
import { formatBedLocation } from '#lib/admissions/format-bed-location';

type AdmissionsTableRowProps = {
  admission: AdmissionResponse;
  canTransfer: boolean;
  canDischarge: boolean;
  canCancel: boolean;
  onOpen: (admission: AdmissionResponse) => void;
  onTransfer: (admission: AdmissionResponse) => void;
  onDischarge: (admission: AdmissionResponse) => void;
  onCancel: (admission: AdmissionResponse) => void;
};

export function AdmissionsTableRow({
  admission,
  canTransfer,
  canDischarge,
  canCancel,
  onOpen,
  onTransfer,
  onDischarge,
  onCancel,
}: AdmissionsTableRowProps) {
  const t = useTranslations('operations');
  const format = useFormatter();
  const isOpenStay = admission.status === 'ADMITTED';
  const actions = [
    { label: t('common.open'), icon: 'open_in_new', onSelect: () => onOpen(admission) },
    ...(canTransfer && isOpenStay
      ? [
          {
            label: t('admissions.transfer'),
            icon: 'swap_horiz',
            onSelect: () => onTransfer(admission),
          },
        ]
      : []),
    ...(canDischarge && isOpenStay
      ? [
          {
            label: t('admissions.discharge'),
            icon: 'logout',
            onSelect: () => onDischarge(admission),
          },
        ]
      : []),
    ...(canCancel && isOpenStay
      ? [
          {
            label: t('admissions.cancel'),
            icon: 'cancel',
            isDestructive: true,
            onSelect: () => onCancel(admission),
          },
        ]
      : []),
  ];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <DataTableMonoCell>{admission.patient.mrn}</DataTableMonoCell>
      <TableCell className="px-4 py-3 text-sm text-slate-800">
        {admission.patient.fullName}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {admission.admittingDoctor.fullName}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {admission.currentBed ? formatBedLocation(admission.currentBed) : '—'}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {format.dateTime(new Date(admission.admittedAt), { dateStyle: 'medium' })}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={admission.status} />
      </TableCell>
      <TableCell className="px-4 text-right">
        <RowActionsMenu
          actions={actions}
          triggerLabel={t('common.actionsFor', { name: admission.patient.fullName })}
        />
      </TableCell>
    </TableRow>
  );
}
