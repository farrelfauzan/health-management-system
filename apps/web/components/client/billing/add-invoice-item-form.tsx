'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddInvoiceItemInput, InvoiceDetail } from '@hms/shared-types';
import { Button, Combobox, Input } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { invoiceControllerAddInvoiceItemV1 } from '#lib/api/generated/invoices/invoices';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateBillingQueries } from '#lib/billing/invalidate-billing-queries';
import { useBillableTariffs } from '#lib/billing/use-billable-tariffs';
import { formatStatusLabel } from '#lib/shared/status-label';

type AddInvoiceItemFormProps = {
  invoice: InvoiceDetail;
};

/**
 * Attaches a tariff to a DRAFT invoice by hand. Generation only reaches
 * tariffs it can match on its own (consultation, ICD-9-CM-coded procedures,
 * ward nights), so this is the only way an unmapped or OTHER tariff gets
 * onto the bill.
 */
export function AddInvoiceItemForm({ invoice }: AddInvoiceItemFormProps) {
  const t = useTranslations('operations.billing.lines');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const tariffsQuery = useBillableTariffs(true);
  const [serviceTariffId, setServiceTariffId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [actionError, setActionError] = useState<string | null>(null);
  const addMutation = useMutation({
    mutationFn: (payload: AddInvoiceItemInput) =>
      invoiceControllerAddInvoiceItemV1(invoice.id, payload),
  });
  const money = (amount: number) =>
    format.number(amount, { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 });
  const options = tariffsQuery.tariffs.map((tariff) => ({
    value: tariff.id,
    label: `${tariff.name} · ${money(tariff.price)}`,
    keywords: [tariff.code, formatStatusLabel(tariff.category), tariff.icd9cmCode ?? ''],
  }));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    const parsedQuantity = Number(quantity.trim());

    if (serviceTariffId.length === 0) {
      setActionError(t('pickTariff'));
      return;
    }
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setActionError(t('invalidQuantity'));
      return;
    }

    try {
      const response = await addMutation.mutateAsync({ serviceTariffId, quantity: parsedQuantity });
      parseApiSuccess<InvoiceDetail>(response, t('addError'));
      await invalidateBillingQueries(queryClient);
      setServiceTariffId('');
      setQuantity('1');
    } catch (error) {
      setActionError(notifyApiError(error, t('addError')));
    }
  }

  return (
    <form
      noValidate
      className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <p className="font-heading text-xs font-medium text-slate-600">{t('title')}</p>
      <p className="text-xs text-slate-500">{t('hint')}</p>
      {actionError ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {actionError}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-[1fr_5rem_auto]">
        <Combobox
          id="invoice-line-tariff"
          options={options}
          value={serviceTariffId}
          placeholder={t('tariffPlaceholder')}
          searchPlaceholder={t('searchTariff')}
          emptyMessage={t('noTariff')}
          isLoading={tariffsQuery.isPending}
          disabled={addMutation.isPending}
          onChange={setServiceTariffId}
        />
        <Input
          id="invoice-line-quantity"
          aria-label={t('quantity')}
          inputMode="numeric"
          value={quantity}
          disabled={addMutation.isPending}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={addMutation.isPending || tariffsQuery.isPending}
        >
          {addMutation.isPending ? t('adding') : t('add')}
        </Button>
      </div>
    </form>
  );
}
