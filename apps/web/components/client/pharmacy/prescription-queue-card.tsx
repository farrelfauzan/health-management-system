'use client';

import type { PrescriptionResponse } from '@hms/shared-types';
import { Icon, cn } from '@hms/ui';

import { StatusBadge } from '#components/shared/status-badge';
import { formatElapsedTime } from '#lib/pharmacy/format-elapsed-time';
import { formatRxNumber } from '#lib/pharmacy/format-rx-number';
import { resolvePrescriptionPriority } from '#lib/pharmacy/mock-prescription-priority';

type PrescriptionQueueCardProps = {
  prescription: PrescriptionResponse;
  isSelected: boolean;
  onSelect: (prescription: PrescriptionResponse) => void;
};

function summarizeMedications(prescription: PrescriptionResponse): string {
  const [firstItem] = prescription.items;
  if (!firstItem) {
    return 'No medication items';
  }
  const remainingCount = prescription.items.length - 1;
  return remainingCount > 0
    ? `${firstItem.medicationName} +${remainingCount} more`
    : firstItem.medicationName;
}

export function PrescriptionQueueCard({
  prescription,
  isSelected,
  onSelect,
}: PrescriptionQueueCardProps) {
  const priority = resolvePrescriptionPriority();

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      className={cn(
        'group flex w-full items-center gap-4 rounded-xl border border-l-4 border-slate-200 border-l-slate-200 bg-white p-4 text-left transition-colors hover:bg-slate-50',
        priority === 'STAT' && 'border-l-danger',
        isSelected &&
          'border-primary-container border-l-primary-container bg-info-tint hover:bg-info-tint',
      )}
      onClick={() => onSelect(prescription)}
    >
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-slate-900">
            {formatRxNumber(prescription.id)}
          </span>
          <StatusBadge status={priority} />
        </span>
        <span className="block truncate text-sm text-slate-900">
          {prescription.patient.fullName}{' '}
          <span className="font-mono text-xs text-slate-400">#{prescription.patient.mrn}</span>
        </span>
        <span className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Icon name="medication" size={14} />
            {summarizeMedications(prescription)}
          </span>
          <span className="flex items-center gap-1">
            <Icon name="timer" size={14} />
            {formatElapsedTime(prescription.createdAt)}
          </span>
        </span>
      </span>
      <Icon
        name="chevron_right"
        size={20}
        className={cn(
          'text-slate-400 transition-colors group-hover:text-primary',
          isSelected && 'text-primary',
        )}
      />
    </button>
  );
}
