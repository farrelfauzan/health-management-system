'use client';

import type { PaymentResponse } from '@hms/shared-types';
import { useFormatter } from 'next-intl';

import { formatStatusLabel } from '#lib/shared/status-label';

type InvoicePaymentSummaryProps = {
  payment: PaymentResponse;
};

export function InvoicePaymentSummary({ payment }: InvoicePaymentSummaryProps) {
  const format = useFormatter();
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
      <p className="text-sm text-slate-800">
        {format.number(payment.amount, {
          style: 'currency',
          currency: 'IDR',
          maximumFractionDigits: 2,
        })}{' '}
        · {formatStatusLabel(payment.method)}
      </p>
      <p className="text-xs text-slate-500">
        {format.dateTime(new Date(payment.paidAt), { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
      {payment.referenceNumber ? (
        <p className="font-mono text-xs text-slate-500">Ref {payment.referenceNumber}</p>
      ) : null}
      {payment.notes ? <p className="text-xs text-slate-500">{payment.notes}</p> : null}
    </div>
  );
}
