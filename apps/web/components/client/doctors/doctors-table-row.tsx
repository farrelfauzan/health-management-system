'use client';

import type { DoctorListItem } from '@hms/shared-types';
import { TableCell, TableRow, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DoctorExpiredLicenseWarning } from '#components/client/doctors/doctor-expired-license-warning';
import { DoctorSatusehatWarning } from '#components/client/doctors/doctor-satusehat-warning';
import { RowActionsMenu, type RowAction } from '#components/client/shared/row-actions-menu';
import { AvatarInitials } from '#components/shared/avatar-initials';
import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';
import { StatusBadge } from '#components/shared/status-badge';
import { formatScheduleSummary } from '#lib/doctors/schedule-summary';

type DoctorsTableRowProps = {
  doctor: DoctorListItem;
  /**
   * The doctor's soonest-expiring lapsed licence (US-E3-08), or undefined
   * when nothing has lapsed — or when the viewer cannot read the expiry
   * roster, which is every role but ADMIN.
   */
  expiredLicenseAt?: string;
  onView: (doctorId: string) => void;
  onEdit: (doctor: DoctorListItem) => void;
  onManageSchedule: (doctor: DoctorListItem) => void;
  onAssignPatient: (doctor: DoctorListItem) => void;
  onSendInvitation: (doctor: DoctorListItem) => void;
};

export function DoctorsTableRow({
  doctor,
  expiredLicenseAt,
  onView,
  onEdit,
  onManageSchedule,
  onAssignPatient,
  onSendInvitation,
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
    // P20-T01: the recovery for a doctor who predates the required email, or
    // whose invitation lapsed. Only offered when there is nothing to resend —
    // a pending invitation is resent from Administration.
    ...(doctor.invitationStatus === 'NO_ACCOUNT' && ability.can('update', 'Doctor')
      ? [
          {
            label: t('doctors.sendInvitation'),
            icon: 'forward_to_inbox',
            onSelect: () => onSendInvitation(doctor),
          },
        ]
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
            {/* Under the name rather than in a column of its own (P19-T15):
                the address only matters alongside whether the account it
                belongs to works yet, and the two read as one fact. Always
                shown since P20-T01 — a doctor with no account is badged as
                such rather than left blank. */}
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {doctor.email ? <span className="text-xs text-slate-500">{doctor.email}</span> : null}
              <StatusBadge status={doctor.invitationStatus} />
            </div>
            <DoctorSatusehatWarning nikMasked={doctor.nikMasked} />
            <DoctorExpiredLicenseWarning expiredAt={expiredLicenseAt} />
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
