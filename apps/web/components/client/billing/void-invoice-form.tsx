'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InvoiceDetail, VoidInvoiceInput } from '@hms/shared-types';
import { Button, Textarea } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { invoiceControllerVoidInvoiceV1 } from '#lib/api/generated/invoices/invoices';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateBillingQueries } from '#lib/billing/invalidate-billing-queries';

type VoidInvoiceFormProps = {
  invoiceId: string;
  onVoided: () => void;
  onCancel: () => void;
};

export function VoidInvoiceForm({ invoiceId, onVoided, onCancel }: VoidInvoiceFormProps) {
  const t = useTranslations('operations.billing');
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const voidMutation = useMutation({
    mutationFn: (payload: VoidInvoiceInput) => invoiceControllerVoidInvoiceV1(invoiceId, payload),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    const trimmedReason = reason.trim();

    if (trimmedReason.length === 0) {
      setActionError('A void reason is required — it is what the audit trail records.');
      return;
    }

    try {
      const response = await voidMutation.mutateAsync({ reason: trimmedReason });
      parseApiSuccess<InvoiceDetail>(response, t('voidError'));
      await invalidateBillingQueries(queryClient);
      onVoided();
    } catch (error) {
      setActionError(notifyApiError(error, t('voidError')));
    }
  }

  return (
    <form
      noValidate
      className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <p className="text-sm text-slate-700">
        Voiding is terminal. Correcting an issued invoice means voiding this one and generating a
        fresh invoice — it is never edited in place.
      </p>
      {actionError ? (
        <p role="alert" className="text-sm text-rose-700">
          {actionError}
        </p>
      ) : null}
      <div>
        <label
          htmlFor="void-reason"
          className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
        >
          Reason
        </label>
        <Textarea
          id="void-reason"
          rows={2}
          placeholder={t('labels.voidPlaceholder')}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Keep Invoice
        </Button>
        <Button type="submit" size="sm" variant="destructive" disabled={voidMutation.isPending}>
          {voidMutation.isPending ? 'Voiding...' : 'Void Invoice'}
        </Button>
      </div>
    </form>
  );
}
