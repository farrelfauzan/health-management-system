'use client';

import type { PatientListItem } from '@hms/shared-types';
import { Icon, TableCell, TableRow, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RowActionsMenu, type RowAction } from '#components/client/shared/row-actions-menu';
import { AvatarInitials } from '#components/shared/avatar-initials';
import { StatusBadge } from '#components/shared/status-badge';

type PatientsTableRowProps = {
  patient: PatientListItem;
  onView: (patientId: string) => void;
  onAssignDoctor: (patient: PatientListItem) => void;
};

export function PatientsTableRow({
  patient,
  onView,
  onAssignDoctor,
}: PatientsTableRowProps) {
  const ability = useAbility();
  const t = useTranslations('clinical');
  const primaryDoctor = patient.doctors[0];
  const overflowDoctorCount = Math.max(0, patient.doctorCount - 1);
  const actions: RowAction[] = [
    { label: t('common.view'), icon: 'visibility', onSelect: () => onView(patient.id) },
    ...(ability.can('assign', 'DoctorPatient')
      ? [
          {
            label: t('patients.assignDoctor'),
            icon: 'stethoscope',
            onSelect: () => onAssignDoctor(patient),
          },
        ]
      : []),
  ];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <div className="flex items-center gap-3">
          <AvatarInitials name={patient.fullName} />
          <div>
            <p className="text-sm font-medium text-slate-900">{patient.fullName}</p>
            <p className="text-xs text-slate-500">{t('patients.compactRecord')}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-4">
        {primaryDoctor ? (
          <span className="flex items-center gap-1.5 text-sm text-slate-700">
            <Icon name="stethoscope" size={16} className="text-primary" />
            {primaryDoctor.fullName}
            {overflowDoctorCount > 0 ? (
              <span className="font-mono text-xs text-slate-400">+{overflowDoctorCount}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-sm text-slate-400">{t('patients.unassigned')}</span>
        )}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={patient.status} label={t(`patients.status.${patient.status}`)} />
      </TableCell>
      <TableCell className="px-4 text-right">
        <RowActionsMenu
          actions={actions}
          triggerLabel={t('common.actionsFor', { name: patient.fullName })}
        />
      </TableCell>
    </TableRow>
  );
}
