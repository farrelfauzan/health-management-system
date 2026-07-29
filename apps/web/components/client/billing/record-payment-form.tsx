'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PAYMENT_METHODS,
  type InvoiceDetail,
  type PaymentMethodValue,
  type RecordPaymentInput,
} from '@hms/shared-types';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@hms/ui';

import { invoiceControllerRecordPaymentV1 } from '#lib/api/generated/invoices/invoices';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { formatRupiah } from '#lib/billing/format-rupiah';
import { invalidateBillingQueries } from '#lib/billing/invalidate-billing-queries';
import { formatStatusLabel } from '#lib/shared/status-label';

const PAYMENT_ERROR_FALLBACK = 'Unable to record the payment. Please try again.';

type RecordPaymentFormProps = {
  invoice: InvoiceDetail;
  onRecorded: () => void;
};

export function RecordPaymentForm({ invoice, onRecorded }: RecordPaymentFormProps) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<PaymentMethodValue>('CASH');
  // Pre-filled but editable: the API requires the amount to equal the invoice
  // total, so a stale screen fails loudly instead of settling the wrong bill.
  const [amount, setAmount] = useState<string>(String(invoice.totalAmount));
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const recordMutation = useMutation({
    mutationFn: (payload: RecordPaymentInput) =>
      invoiceControllerRecordPaymentV1(invoice.id, payload),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    const parsedAmount = Number(amount.trim());

    if (!Number.isFinite(parsedAmount)) {
      setActionError('Enter the amount taken, in rupiah.');
      return;
    }

    const trimmedReference = referenceNumber.trim();
    const trimmedNotes = notes.trim();
    const payload: RecordPaymentInput = {
      method,
      amount: parsedAmount,
      ...(trimmedReference.length > 0 ? { referenceNumber: trimmedReference } : {}),
      ...(trimmedNotes.length > 0 ? { notes: trimmedNotes } : {}),
    };

    try {
      const response = await recordMutation.mutateAsync(payload);
      parseApiSuccess<InvoiceDetail>(response, PAYMENT_ERROR_FALLBACK);
      await invalidateBillingQueries(queryClient);
      onRecorded();
    } catch (error) {
      setActionError(notifyApiError(error, PAYMENT_ERROR_FALLBACK));
    }
  }

  return (
    <form noValidate className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
      {actionError ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {actionError}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="payment-method"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Method
          </label>
          <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethodValue)}>
            <SelectTrigger id="payment-method" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((methodValue) => (
                <SelectItem key={methodValue} value={methodValue}>
                  {formatStatusLabel(methodValue)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label
            htmlFor="payment-amount"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Amount Taken
          </label>
          <Input
            id="payment-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            Invoice total {formatRupiah(invoice.totalAmount)}
          </p>
        </div>
      </div>
      <div>
        <label
          htmlFor="payment-reference"
          className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
        >
          Reference Number
        </label>
        <Input
          id="payment-reference"
          placeholder="Transfer or QRIS reference, if any"
          value={referenceNumber}
          onChange={(event) => setReferenceNumber(event.target.value)}
        />
      </div>
      <div>
        <label
          htmlFor="payment-notes"
          className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
        >
          Notes
        </label>
        <Textarea
          id="payment-notes"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          className="bg-primary-container hover:bg-primary"
          disabled={recordMutation.isPending}
        >
          {recordMutation.isPending ? 'Recording...' : 'Record Payment'}
        </Button>
      </div>
    </form>
  );
}
