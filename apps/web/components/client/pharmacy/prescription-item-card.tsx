'use client';

import type { PrescriptionItemResponse } from '@hms/shared-types';

type PrescriptionItemCardProps = {
  item: PrescriptionItemResponse;
};

export function PrescriptionItemCard({ item }: PrescriptionItemCardProps) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-heading text-sm font-semibold text-slate-900">{item.medicationName}</p>
        <p className="shrink-0 font-mono text-sm text-primary">{item.dosage}</p>
      </div>
      <p className="text-xs text-slate-500">
        {item.frequency}
        {item.durationDays ? ` · ${item.durationDays} days` : null}
      </p>
      {item.instructions ? (
        <p className="text-sm italic text-slate-600">{item.instructions}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <span className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600">
          Qty: {item.quantity}
        </span>
        <span className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600">
          Code: {item.medicationCode}
        </span>
      </div>
    </div>
  );
}
