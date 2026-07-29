'use client';

import type { PaymentResponse } from '@hms/shared-types';

import { formatRupiah } from '#lib/billing/format-rupiah';
import { formatRegisteredAt } from '#lib/registrations/format-registered-at';
import { formatStatusLabel } from '#lib/shared/status-label';

type InvoicePaymentSummaryProps = {
  payment: PaymentResponse;
};

export function InvoicePaymentSummary({ payment }: InvoicePaymentSummaryProps) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
      <p className="text-sm text-slate-800">
        Settled {formatRupiah(payment.amount)} by {formatStatusLabel(payment.method)}
      </p>
      <p className="text-xs text-slate-500">{formatRegisteredAt(payment.paidAt)}</p>
      {payment.referenceNumber ? (
        <p className="font-mono text-xs text-slate-500">Ref {payment.referenceNumber}</p>
      ) : null}
      {payment.notes ? <p className="text-xs text-slate-500">{payment.notes}</p> : null}
    </div>
  );
}
