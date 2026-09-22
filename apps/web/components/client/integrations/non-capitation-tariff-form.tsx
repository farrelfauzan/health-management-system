'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  NON_CAPITATION_SERVICE_TYPES,
  type CreateNonCapitationTariffInput,
  type NonCapitationServiceTypeValue,
  type NonCapitationTariffView,
} from '@hms/shared-types';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LocalizedDatePicker } from '#components/client/shared/localized-date-picker';
import { bpjsNonCapitationSettingsControllerCreateTariffV1 } from '#lib/api/generated/bpjs-non-capitation/bpjs-non-capitation';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateNonCapitationQueries } from '#lib/bpjs-non-capitation/invalidate-non-capitation-queries';

type NonCapitationTariffFormProps = {
  onDone: () => void;
};

/**
 * Adds a tariff row from a date (P25-T16). The open row of the same service
 * is closed the day before by the API; a row that starts before an existing
 * one is refused, so history is never rewritten from here.
 */
export function NonCapitationTariffForm({ onDone }: NonCapitationTariffFormProps) {
  const t = useTranslations('operations.integrations.nonCapitation');
  const queryClient = useQueryClient();
  const [serviceType, setServiceType] =
    useState<NonCapitationServiceTypeValue>('ANTENATAL_MIDWIFE');
  const [amount, setAmount] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [reference, setReference] = useState('');

  const createMutation = useMutation({
    mutationFn: async (payload: CreateNonCapitationTariffInput) =>
      parseApiSuccess<NonCapitationTariffView>(
        await bpjsNonCapitationSettingsControllerCreateTariffV1(payload),
        t('tariffs.createError'),
      ).data,
    onSuccess: async () => {
      await invalidateNonCapitationQueries(queryClient);
      toast.success(t('tariffs.created'));
      onDone();
    },
    onError: (error) => notifyApiError(error, t('tariffs.createError')),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    createMutation.mutate({
      serviceType,
      amount: Number(amount),
      validFrom,
      regulationReference: reference.trim(),
    });
  }

  return (
    <form className="space-y-4 rounded-md border border-slate-200 p-4" onSubmit={handleSubmit}>
      <p className="text-sm font-semibold">{t('tariffs.addTitle')}</p>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="non-capitation-tariff-service">{t('tariffs.serviceType')}</Label>
          <Select
            value={serviceType}
            onValueChange={(value) => setServiceType(value as NonCapitationServiceTypeValue)}
          >
            <SelectTrigger id="non-capitation-tariff-service">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NON_CAPITATION_SERVICE_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`serviceTypes.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="non-capitation-tariff-amount">{t('tariffs.amount')}</Label>
          <Input
            id="non-capitation-tariff-amount"
            type="number"
            required
            min={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="non-capitation-tariff-valid-from">{t('tariffs.validFrom')}</Label>
          <LocalizedDatePicker
            id="non-capitation-tariff-valid-from"
            value={validFrom}
            onValueChange={setValidFrom}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="non-capitation-tariff-reference">{t('tariffs.reference')}</Label>
        <Input
          id="non-capitation-tariff-reference"
          required
          maxLength={500}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      </div>
      <div className="flex gap-3">
        <Button type="submit" disabled={createMutation.isPending || validFrom === ''}>
          {t('tariffs.submit')}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('tariffs.cancel')}
        </Button>
      </div>
    </form>
  );
}
