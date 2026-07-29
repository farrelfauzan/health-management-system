'use client';

import type { EncounterListItem } from '@hms/shared-types';
import { Icon, TableCell, TableRow } from '@hms/ui';
import Link from 'next/link';

import { AvatarInitials } from '#components/shared/avatar-initials';
import { DataTableMonoCell } from '#components/shared/data-table-mono-cell';
import { StatusBadge } from '#components/shared/status-badge';
import { formatEncounterDuration } from '#lib/encounters/format-encounter-duration';
import { formatRegisteredAt } from '#lib/registrations/format-registered-at';

type EncountersTableRowProps = {
  encounter: EncounterListItem;
};

export function EncountersTableRow({ encounter }: EncountersTableRowProps) {
  const hasPrimaryRecord = encounter.diagnosisCount > 0;

  return (
    <TableRow className="transition-colors hover:bg-slate-50">
      <TableCell className="px-4 py-3">
        <div className="flex items-center gap-3">
          <AvatarInitials name={encounter.patient.fullName} />
          <p className="text-sm font-medium text-slate-900">{encounter.patient.fullName}</p>
        </div>
      </TableCell>
      <DataTableMonoCell>{encounter.patient.mrn}</DataTableMonoCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {formatRegisteredAt(encounter.startedAt)}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {formatEncounterDuration(encounter.startedAt, encounter.endedAt)}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-700">{encounter.doctor.fullName}</TableCell>
      <TableCell className="px-4">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1" title="Vital-sign sets recorded">
            <Icon name="monitor_heart" size={15} className="text-slate-400" />
            {encounter.vitalSignsCount}
          </span>
          <span
            className={hasPrimaryRecord ? 'flex items-center gap-1' : 'flex items-center gap-1 text-warning'}
            title="Diagnoses coded"
          >
            <Icon name="clinical_notes" size={15} />
            {encounter.diagnosisCount}
          </span>
          <span className="flex items-center gap-1" title="Procedures coded">
            <Icon name="medical_services" size={15} className="text-slate-400" />
            {encounter.procedureCount}
          </span>
        </div>
      </TableCell>
      <TableCell className="px-4">
        <StatusBadge status={encounter.status} />
      </TableCell>
      <TableCell className="px-4 text-right">
        <Link
          href={`/admin/encounters/${encounter.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open
          <Icon name="chevron_right" size={16} />
        </Link>
      </TableCell>
    </TableRow>
  );
}
