'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BpjsReferralResponse, UpsertBpjsReferralInput } from '@hms/shared-types';
import { Button, DatePicker, Input, Textarea } from '@hms/ui';

import { encounterClinicalDataControllerSaveBpjsReferralV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';

const REFERRAL_ERROR_FALLBACK = 'Unable to record the referral. Please try again.';

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
  const [destinationProviderCode, setDestinationProviderCode] = useState<string>(
    referral?.destinationProviderCode ?? '',
  );
  const [subSpecialtyCode, setSubSpecialtyCode] = useState<string>(referral?.subSpecialtyCode ?? '');
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
      setActionError('Enter the destination FKRTL provider code (kdppk).');
      return;
    }
    if (subSpecialty.length === 0 && khusus.length === 0) {
      setActionError('Enter a subspesialis code or a khusus/TACC code.');
      return;
    }
    if (estimatedReferralDate.length === 0) {
      setActionError('Pick the planned referral date.');
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
      parseApiSuccess<BpjsReferralResponse>(response, REFERRAL_ERROR_FALLBACK);
      await invalidateEncounterQueries(queryClient);
      onSaved();
    } catch (error) {
      setActionError(notifyApiError(error, REFERRAL_ERROR_FALLBACK));
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
            Destination FKRTL (kdppk)
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
            Planned Referral Date
          </label>
          <DatePicker
            id="referral-date"
            className="w-full"
            placeholder="Select date"
            value={estimatedReferralDate}
            onValueChange={setEstimatedReferralDate}
          />
        </div>
        <div>
          <label
            htmlFor="referral-subspecialty"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Subspesialis Code
          </label>
          <Input
            id="referral-subspecialty"
            placeholder="Leave blank for a khusus/TACC referral"
            value={subSpecialtyCode}
            onChange={(event) => setSubSpecialtyCode(event.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="referral-sarana"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Sarana Code
          </label>
          <Input
            id="referral-sarana"
            placeholder="Optional"
            value={saranaCode}
            onChange={(event) => setSaranaCode(event.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="referral-khusus"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Khusus / TACC Code
          </label>
          <Input
            id="referral-khusus"
            placeholder="Leave blank for a subspesialis referral"
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
          Notes
        </label>
        <Textarea
          id="referral-notes"
          rows={2}
          placeholder="Reason for referral, as it should read on the letter."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <p className="text-xs text-slate-500">
        Codes are sent to PCare exactly as recorded — the subspesialis catalog is per-specialty and
        not synced locally, so BPJS validates them when the kunjungan is submitted.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="bg-primary-container hover:bg-primary"
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Referral'}
        </Button>
      </div>
    </form>
  );
}
