'use client';

import type { PatientListItem } from '@hms/shared-types';
import { Icon, TableCell, TableRow, useAbility } from '@hms/ui';

import { RowActionsMenu, type RowAction } from '#components/client/shared/row-actions-menu';
import { AvatarInitials } from '#components/shared/avatar-initials';
import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';
import { StatusBadge } from '#components/shared/status-badge';
import { computePatientAge } from '#lib/patients/patient-age';
import { formatPatientSexLabel } from '#lib/patients/patient-sex-label';
import { formatPatientStatusLabel } from '#lib/patients/patient-status-label';
import { formatMediumDate } from '#lib/shared/format-medium-date';

type PatientsTableRowProps = {
  patient: PatientListItem;
  onView: (patientId: string) => void;
  onEdit: (patient: PatientListItem) => void;
  onAssignDoctor: (patient: PatientListItem) => void;
};

export function PatientsTableRow({
  patient,
  onView,
  onEdit,
  onAssignDoctor,
}: PatientsTableRowProps) {
  const ability = useAbility();
  const primaryDoctor = patient.doctors[0];
  const overflowDoctorCount = Math.max(0, patient.doctorCount - 1);
  const actions: RowAction[] = [
    { label: 'View', icon: 'visibility', onSelect: () => onView(patient.id) },
    ...(ability.can('update', 'Patient')
      ? [{ label: 'Edit', icon: 'edit', onSelect: () => onEdit(patient) }]
      : []),
    ...(ability.can('assign', 'DoctorPatient')
      ? [{ label: 'Assign Doctor', icon: 'stethoscope', onSelect: () => onAssignDoctor(patient) }]
      : []),
  ];

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <div className="flex items-center gap-3">
          <AvatarInitials name={patient.fullName} />
          <div>
            <p className="text-sm font-medium text-slate-900">{patient.fullName}</p>
            <p className="text-xs text-slate-500">
              {formatPatientSexLabel(patient.sex)}, {computePatientAge(patient.dateOfBirth)} yrs
            </p>
          </div>
        </div>
      </TableCell>
      <DataTableMonoCell>{patient.mrn}</DataTableMonoCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {formatMediumDate(patient.updatedAt)}
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
          <span className="text-sm text-slate-400">Unassigned</span>
        )}
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={patient.status} label={formatPatientStatusLabel(patient.status)} />
      </TableCell>
      <TableCell className="px-4 text-right">
        <RowActionsMenu actions={actions} triggerLabel={`Actions for ${patient.fullName}`} />
      </TableCell>
    </TableRow>
  );
}
