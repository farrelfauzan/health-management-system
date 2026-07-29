'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RecordVitalSignsInput, VitalSignsResponse } from '@hms/shared-types';
import { Button, Input, Textarea } from '@hms/ui';

import { encounterClinicalDataControllerRecordVitalSignsV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';
import {
  buildVitalSignsPayload,
  EMPTY_VITAL_SIGNS_FORM,
  VITAL_SIGNS_FIELDS,
  type VitalSignsFormValues,
} from '#lib/encounters/vital-signs-fields';

const VITALS_ERROR_FALLBACK = 'Unable to record the measurement. Please try again.';

type EncounterVitalsFormProps = {
  encounterId: string;
};

export function EncounterVitalsForm({ encounterId }: EncounterVitalsFormProps) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<VitalSignsFormValues>({ ...EMPTY_VITAL_SIGNS_FORM });
  const [notes, setNotes] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const recordMutation = useMutation({
    mutationFn: (payload: RecordVitalSignsInput) =>
      encounterClinicalDataControllerRecordVitalSignsV1(encounterId, payload),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    const result = buildVitalSignsPayload(values, notes);

    if (!result.isValid) {
      setActionError(result.message);
      return;
    }

    try {
      const response = await recordMutation.mutateAsync(result.payload);
      parseApiSuccess<VitalSignsResponse>(response, VITALS_ERROR_FALLBACK);
      await invalidateEncounterQueries(queryClient);
      setValues({ ...EMPTY_VITAL_SIGNS_FORM });
      setNotes('');
    } catch (error) {
      setActionError(notifyApiError(error, VITALS_ERROR_FALLBACK));
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {VITAL_SIGNS_FIELDS.map((field) => (
          <div key={field.key}>
            <label
              htmlFor={`vitals-${field.key}`}
              className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
            >
              {field.label} <span className="text-slate-400">({field.unit})</span>
            </label>
            <Input
              id={`vitals-${field.key}`}
              inputMode="decimal"
              placeholder="—"
              value={values[field.key]}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <div>
        <label
          htmlFor="vitals-notes"
          className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
        >
          Notes
        </label>
        <Textarea
          id="vitals-notes"
          rows={2}
          placeholder="Context for this measurement — position, cuff size, recheck reason."
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
          {recordMutation.isPending ? 'Recording...' : 'Record Measurement'}
        </Button>
      </div>
    </form>
  );
}
