'use client';

import type { PrescriptionItemComponentResponse } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type PrescriptionCompoundComponentsProps = {
  components: PrescriptionItemComponentResponse[];
  /** How many whole compounds the line covers, for the per-compound × total column. */
  compoundQuantity: number;
};

/**
 * What actually comes out of stock for a racikan (P10-T18). The pharmacist
 * needs both numbers: what goes into one bungkus, and what the whole line
 * costs the shelf — checking the second against stock is the step that stops a
 * dispense failing halfway.
 */
export function PrescriptionCompoundComponents({
  components,
  compoundQuantity,
}: PrescriptionCompoundComponentsProps) {
  const t = useTranslations('operations.pharmacyPrescriptions');

  if (components.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="mb-1.5 font-heading text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {t('compoundComponents')}
      </p>
      <ul className="space-y-1">
        {components.map((component) => (
          <li key={component.id} className="flex justify-between gap-3 text-xs text-slate-700">
            <span>{component.medicationName}</span>
            <span className="font-mono text-slate-500">
              {component.quantity} {component.unit}
              {' · '}
              {t('compoundTotal', {
                total: Number((component.quantity * compoundQuantity).toFixed(4)),
                unit: component.unit,
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
