'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BpjsReferralResponse, UpsertBpjsReferralInput } from '@hms/shared-types';
import { Button, DatePicker, Input, Textarea } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { encounterClinicalDataControllerSaveBpjsReferralV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';

type EncounterReferralFormProps = {
  encounterId: string;
  referral: BpjsReferralResponse | null;
  onSaved: () => void;
  onCancel: () => void;
};

export function EncounterReferralForm({
  encounterId,
  referral,
  onSaved,
  onCancel,
}: EncounterReferralFormProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const [destinationProviderCode, setDestinationProviderCode] = useState<string>(
    referral?.destinationProviderCode ?? '',
  );
  const [subSpecialtyCode, setSubSpecialtyCode] = useState<string>(
    referral?.subSpecialtyCode ?? '',
  );
  const [saranaCode, setSaranaCode] = useState<string>(referral?.saranaCode ?? '');
  const [khususCode, setKhususCode] = useState<string>(referral?.khususCode ?? '');
  const [estimatedReferralDate, setEstimatedReferralDate] = useState<string>(
    referral?.estimatedReferralDate ?? '',
  );
  const [notes, setNotes] = useState<string>(referral?.notes ?? '');
  const [actionError, setActionError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (payload: UpsertBpjsReferralInput) =>
      encounterClinicalDataControllerSaveBpjsReferralV1(encounterId, payload),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);

    const destination = destinationProviderCode.trim();
    const subSpecialty = subSpecialtyCode.trim();
    const khusus = khususCode.trim();
    const sarana = saranaCode.trim();
    const trimmedNotes = notes.trim();

    if (destination.length === 0) {
      setActionError(t('encounters.referralForm.destinationRequired'));
      return;
    }
    if (subSpecialty.length === 0 && khusus.length === 0) {
      setActionError(t('encounters.referralForm.typeRequired'));
      return;
    }
    if (estimatedReferralDate.length === 0) {
      setActionError(t('encounters.referralForm.dateRequired'));
      return;
    }

    const payload: UpsertBpjsReferralInput = {
      destinationProviderCode: destination,
      estimatedReferralDate,
      ...(subSpecialty.length > 0 ? { subSpecialtyCode: subSpecialty } : {}),
      ...(sarana.length > 0 ? { saranaCode: sarana } : {}),
      ...(khusus.length > 0 ? { khususCode: khusus } : {}),
      ...(trimmedNotes.length > 0 ? { notes: trimmedNotes } : {}),
    };

    try {
      const response = await saveMutation.mutateAsync(payload);
      parseApiSuccess<BpjsReferralResponse>(response, t('encounters.referralForm.error'));
      await invalidateEncounterQueries(queryClient);
      onSaved();
    } catch (error) {
      setActionError(notifyApiError(error, t('encounters.referralForm.error')));
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
            htmlFor="referral-destination"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('encounters.referralForm.destination')}
          </label>
          <Input
            id="referral-destination"
            placeholder="e.g. 0301R001"
            value={destinationProviderCode}
            onChange={(event) => setDestinationProviderCode(event.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="referral-date"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('encounters.referralForm.date')}
          </label>
          <DatePicker
            id="referral-date"
            className="w-full"
            placeholder={t('encounters.referralForm.selectDate')}
            value={estimatedReferralDate}
            onValueChange={setEstimatedReferralDate}
          />
        </div>
        <div>
          <label
            htmlFor="referral-subspecialty"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('encounters.referralForm.subspecialty')}
          </label>
          <Input
            id="referral-subspecialty"
            placeholder={t('encounters.referralForm.subspecialtyPlaceholder')}
            value={subSpecialtyCode}
            onChange={(event) => setSubSpecialtyCode(event.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="referral-sarana"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('encounters.referralForm.facility')}
          </label>
          <Input
            id="referral-sarana"
            placeholder={t('encounters.referralForm.optional')}
            value={saranaCode}
            onChange={(event) => setSaranaCode(event.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="referral-khusus"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('encounters.referralForm.specific')}
          </label>
          <Input
            id="referral-khusus"
            placeholder={t('encounters.referralForm.specificPlaceholder')}
            value={khususCode}
            onChange={(event) => setKhususCode(event.target.value)}
          />
        </div>
      </div>
      <div>
        <label
          htmlFor="referral-notes"
          className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
        >
          {t('encounters.notes')}
        </label>
        <Textarea
          id="referral-notes"
          rows={2}
          placeholder={t('encounters.referralForm.notes')}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <p className="text-xs text-slate-500">{t('encounters.referralForm.codeNotice')}</p>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          size="sm"
          className="bg-primary-container hover:bg-primary"
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? t('common.saving') : t('encounters.referralForm.save')}
        </Button>
      </div>
    </form>
  );
}
