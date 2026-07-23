'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppointmentResponse } from '@hms/shared-types';
import { SPECIAL_REQUEST_MIN_LEAD_DAYS } from '@hms/shared-types';
import { Button, DatePicker, DialogFooter, Input, Textarea, useAbility } from '@hms/ui';

import { appointmentManagementControllerCreateAppointmentV1 } from '#lib/api/generated/appointment-management/appointment-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAppointmentQueries } from '#lib/appointments/invalidate-appointment-queries';

const REQUEST_ERROR_FALLBACK = 'Unable to submit the appointment request. Please try again.';
const DEFAULT_TIME = '09:00';

type SpecialRequestFormProps = {
  patientId: string;
  doctorId: string;
  initialDate: string;
  onSuccess: () => void;
  onCancel: () => void;
};

export function SpecialRequestForm({
  patientId,
  doctorId,
  initialDate,
  onSuccess,
  onCancel,
}: SpecialRequestFormProps) {
  const ability = useAbility();
  const queryClient = useQueryClient();
  const [date, setDate] = useState<string>(initialDate);
  const [time, setTime] = useState<string>(DEFAULT_TIME);
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const canApprove = ability.can('approve', 'Appointment');
  const requestMutation = useMutation({
    mutationFn: (requestedAt: string) =>
      appointmentManagementControllerCreateAppointmentV1({
        type: 'SPECIAL_REQUEST',
        patientId,
        doctorId,
        requestedAt,
        reason: reason.trim(),
        notes: notes.trim() ? notes.trim() : undefined,
      }),
  });

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    if (!patientId || !doctorId) {
      setFormError('Select a patient and a doctor first.');
      return;
    }
    if (!date || !time) {
      setFormError('Pick the requested date and time.');
      return;
    }
    if (reason.trim().length < 2) {
      setFormError('A reason is required for a special request.');
      return;
    }
    const requestedAtDate = new Date(`${date}T${time}`);
    if (Number.isNaN(requestedAtDate.getTime())) {
      setFormError('Enter a valid date and time.');
      return;
    }
    try {
      const response = await requestMutation.mutateAsync(requestedAtDate.toISOString());
      parseApiSuccess<AppointmentResponse>(response, REQUEST_ERROR_FALLBACK);
      await invalidateAppointmentQueries(queryClient);
      onSuccess();
    } catch (error) {
      setFormError(notifyApiError(error, REQUEST_ERROR_FALLBACK));
    }
  }

  return (
    <div className="space-y-4">
      {formError ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {formError}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label
            htmlFor="special-request-date"
            className="block font-heading text-xs font-medium text-slate-600"
          >
            Date
          </label>
          <DatePicker
            id="special-request-date"
            value={date}
            placeholder="Select date"
            onValueChange={setDate}
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="special-request-time"
            className="block font-heading text-xs font-medium text-slate-600"
          >
            Time
          </label>
          <Input
            id="special-request-time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="special-request-reason"
          className="block font-heading text-xs font-medium text-slate-600"
        >
          Reason
        </label>
        <Textarea
          id="special-request-reason"
          rows={2}
          value={reason}
          placeholder="Why is a specific time needed?"
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="special-request-notes"
          className="block font-heading text-xs font-medium text-slate-600"
        >
          Notes (optional)
        </label>
        <Textarea
          id="special-request-notes"
          rows={3}
          value={notes}
          placeholder="Internal notes for the care team…"
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        {canApprove
          ? 'You can approve requests, so this appointment is scheduled immediately.'
          : `Special requests need clinic approval and must be made at least ${SPECIAL_REQUEST_MIN_LEAD_DAYS} days in advance.`}
      </p>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={requestMutation.isPending}
          className="bg-primary-container hover:bg-primary"
          onClick={() => void handleSubmit()}
        >
          {requestMutation.isPending
            ? 'Submitting…'
            : canApprove
              ? 'Book Appointment'
              : 'Submit Request'}
        </Button>
      </DialogFooter>
    </div>
  );
}
