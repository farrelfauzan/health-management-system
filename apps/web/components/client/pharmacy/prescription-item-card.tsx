'use client';

import type { PrescriptionItemResponse } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { PrescriptionCompoundComponents } from '#components/client/pharmacy/prescription-compound-components';

type PrescriptionItemCardProps = {
  item: PrescriptionItemResponse;
};

export function PrescriptionItemCard({ item }: PrescriptionItemCardProps) {
  const t = useTranslations('operations.pharmacyPrescriptions');
  // A compound has no catalog name or code; what it has is the label the
  // doctor wrote and the ingredients underneath (P10-T18).
  const title = item.medicationName ?? item.compoundName ?? '';

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-heading text-sm font-semibold text-slate-900">{title}</p>
          {item.isCompound ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
              {item.preparation
                ? t(`compoundPreparations.${item.preparation}`)
                : t('compoundBadge')}
            </span>
          ) : null}
        </div>
        <p className="shrink-0 font-mono text-sm text-primary">{item.dosage}</p>
      </div>
      <p className="text-xs text-slate-500">
        {item.frequency}
        {item.durationDays ? ` · ${item.durationDays} days` : null}
      </p>
      {item.instructions ? (
        <p className="text-sm italic text-slate-600">{item.instructions}</p>
      ) : null}
      <PrescriptionCompoundComponents
        components={item.components}
        compoundQuantity={item.quantity}
      />
      <div className="flex flex-wrap gap-2">
        <span className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600">
          Qty: {item.quantity}
          {item.dosageUnit ? ` ${item.dosageUnit}` : null}
        </span>
        {item.medicationCode ? (
          <span className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600">
            Code: {item.medicationCode}
          </span>
        ) : null}
      </div>
    </div>
  );
}
