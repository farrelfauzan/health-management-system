'use client';

import type { DoctorListItem } from '@hms/shared-types';
import { TableCell, TableRow, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RowActionsMenu, type RowAction } from '#components/client/shared/row-actions-menu';
import { AvatarInitials } from '#components/shared/avatar-initials';
import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';
import { StatusBadge } from '#components/shared/status-badge';
import { formatScheduleSummary } from '#lib/doctors/schedule-summary';

type DoctorsTableRowProps = {
  doctor: DoctorListItem;
  onView: (doctorId: string) => void;
  onEdit: (doctor: DoctorListItem) => void;
  onManageSchedule: (doctor: DoctorListItem) => void;
  onAssignPatient: (doctor: DoctorListItem) => void;
};

export function DoctorsTableRow({
  doctor,
  onView,
  onEdit,
  onManageSchedule,
  onAssignPatient,
}: DoctorsTableRowProps) {
  const ability = useAbility();
  const t = useTranslations('clinical');
  const weekdayKeys = [
    'doctors.weekdays.0',
    'doctors.weekdays.1',
    'doctors.weekdays.2',
    'doctors.weekdays.3',
    'doctors.weekdays.4',
    'doctors.weekdays.5',
    'doctors.weekdays.6',
  ] as const;
  const actions: RowAction[] = [
    { label: t('common.view'), icon: 'visibility', onSelect: () => onView(doctor.id) },
    ...(ability.can('update', 'Doctor')
      ? [{ label: t('common.edit'), icon: 'edit', onSelect: () => onEdit(doctor) }]
      : []),
    ...(ability.can('write', 'DoctorSchedule')
      ? [
          {
            label: t('doctors.manageSchedule'),
            icon: 'calendar_month',
            onSelect: () => onManageSchedule(doctor),
          },
        ]
      : []),
    ...(ability.can('assign', 'DoctorPatient')
      ? [
          {
            label: t('doctors.assignPatient'),
            icon: 'person_add',
            onSelect: () => onAssignPatient(doctor),
          },
        ]
      : []),
  ];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <div className="flex items-center gap-3">
          <AvatarInitials name={doctor.fullName} />
          <div>
            <p className="text-sm font-medium text-slate-900">{doctor.fullName}</p>
            <p className="text-xs text-slate-500">{doctor.specialty}</p>
          </div>
        </div>
      </TableCell>
      <DataTableMonoCell>{doctor.licenseNumber}</DataTableMonoCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {formatScheduleSummary(doctor.schedules, {
          dayLabel: (day) => t(weekdayKeys[day] ?? 'doctors.weekdays.0'),
          noSchedule: t('doctors.scheduleNone'),
          varies: t('doctors.scheduleVaries'),
        })}
      </TableCell>
      <DataTableMonoCell className="text-slate-700">{doctor.patientCount}</DataTableMonoCell>
      <TableCell className="px-4">
        <StatusBadge
          status={doctor.isActive ? 'active' : 'inactive'}
          label={t(doctor.isActive ? 'common.active' : 'common.inactive')}
        />
      </TableCell>
      <TableCell className="px-4 text-right">
        <RowActionsMenu
          actions={actions}
          triggerLabel={t('common.actionsFor', { name: doctor.fullName })}
        />
      </TableCell>
    </TableRow>
  );
}
