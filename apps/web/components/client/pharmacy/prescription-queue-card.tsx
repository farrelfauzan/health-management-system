'use client';

import type { PrescriptionResponse } from '@hms/shared-types';
import { Icon, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '#components/shared/status-badge';
import { formatRxNumber } from '#lib/pharmacy/format-rx-number';
import { resolvePrescriptionPriority } from '#lib/pharmacy/mock-prescription-priority';

type PrescriptionQueueCardProps = {
  prescription: PrescriptionResponse;
  isSelected: boolean;
  onSelect: (prescription: PrescriptionResponse) => void;
};

function elapsedParts(value: string): { days: number; hours: number; minutes: number } {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  return { days: Math.floor(minutes / 1440), hours: Math.floor(minutes / 60), minutes };
}

function summarizeMedications(
  prescription: PrescriptionResponse,
  emptyLabel: string,
  more: (name: string, count: number) => string,
): string {
  const [firstItem] = prescription.items;
  if (!firstItem) {
    return emptyLabel;
  }
  const remainingCount = prescription.items.length - 1;
  // A compound line has no catalog name; the label the pharmacist put on it is
  // what the queue should say (P10-T18).
  const firstLabel = firstItem.medicationName ?? firstItem.compoundName ?? '';
  return remainingCount > 0 ? more(firstLabel, remainingCount) : firstLabel;
}

export function PrescriptionQueueCard({
  prescription,
  isSelected,
  onSelect,
}: PrescriptionQueueCardProps) {
  const t = useTranslations('operations');
  const priority = resolvePrescriptionPriority();
  const elapsed = elapsedParts(prescription.createdAt);
  const elapsedLabel =
    elapsed.days > 0
      ? t('pharmacy.elapsedDays', { count: elapsed.days })
      : elapsed.minutes < 1
        ? t('pharmacy.elapsedNow')
        : elapsed.minutes < 60
          ? t('pharmacy.elapsedMinutes', { count: elapsed.minutes })
          : t('pharmacy.elapsedHours', { hours: elapsed.hours, minutes: elapsed.minutes % 60 });

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
          <StatusBadge status={priority} label={t(`common.statuses.${priority}`)} />
        </span>
        <span className="block truncate text-sm text-slate-900">
          {prescription.patient.fullName}{' '}
          <span className="font-mono text-xs text-slate-400">#{prescription.patient.mrn}</span>
        </span>
        <span className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Icon name="medication" size={14} />
            {summarizeMedications(prescription, t('pharmacy.noMedicationItems'), (name, count) =>
              t('pharmacy.moreMedications', { name, count }),
            )}
          </span>
          <span className="flex items-center gap-1">
            <Icon name="timer" size={14} />
            {elapsedLabel}
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
