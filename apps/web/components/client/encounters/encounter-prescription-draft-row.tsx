'use client';

import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { PrescriptionDraftItem } from '#lib/encounters/prescription-draft-item';

type EncounterPrescriptionDraftRowProps = {
  item: PrescriptionDraftItem;
  onRemove: (medicationId: string) => void;
};

export function EncounterPrescriptionDraftRow({
  item,
  onRemove,
}: EncounterPrescriptionDraftRowProps) {
  const t = useTranslations('clinical');
  const details = [
    item.dosage,
    item.frequency,
    item.durationDays
      ? t('encounters.prescriptionForm.durationValue', { count: item.durationDays })
      : null,
    t('encounters.prescriptionForm.quantityValue', { count: item.quantity }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div>
        <p className="text-sm text-slate-800">
          <span className="font-mono text-xs font-medium text-primary">{item.medicationCode}</span>{' '}
          {item.medicationName}
        </p>
        <p className="text-xs text-slate-500">{details}</p>
        {item.instructions ? <p className="text-xs text-slate-400">{item.instructions}</p> : null}
      </div>
      <button
        type="button"
        aria-label={t('encounters.prescriptionForm.remove')}
        className="text-slate-400 hover:text-slate-700"
        onClick={() => onRemove(item.medicationId)}
      >
        <Icon name="close" size={16} />
      </button>
    </li>
  );
}
