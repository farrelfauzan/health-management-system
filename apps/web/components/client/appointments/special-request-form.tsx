'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppointmentResponse } from '@hms/shared-types';
import { SPECIAL_REQUEST_MIN_LEAD_DAYS } from '@hms/shared-types';
import { Button, DatePicker, DialogFooter, Input, Textarea, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { appointmentManagementControllerCreateAppointmentV1 } from '#lib/api/generated/appointment-management/appointment-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAppointmentQueries } from '#lib/appointments/invalidate-appointment-queries';

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
  const t = useTranslations('operations');
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
      setFormError(t('appointments.selectParticipants'));
      return;
    }
    if (!date || !time) {
      setFormError(t('appointments.labels.requestedDate'));
      return;
    }
    if (reason.trim().length < 2) {
      setFormError(t('appointments.labels.reasonRequired'));
      return;
    }
    const requestedAtDate = new Date(`${date}T${time}`);
    if (Number.isNaN(requestedAtDate.getTime())) {
      setFormError(t('appointments.labels.invalidDateTime'));
      return;
    }
    try {
      const response = await requestMutation.mutateAsync(requestedAtDate.toISOString());
      parseApiSuccess<AppointmentResponse>(response, t('appointments.requestError'));
      await invalidateAppointmentQueries(queryClient);
      onSuccess();
    } catch (error) {
      setFormError(notifyApiError(error, t('appointments.requestError')));
    }
  }

  return (
    <div className="space-y-4">
      {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <FormLabel
            htmlFor="special-request-date"
            className="font-heading text-xs text-slate-600"
            required
          >
            Date
          </FormLabel>
          <DatePicker
            id="special-request-date"
            value={date}
            placeholder={t('appointments.selectDate')}
            onValueChange={setDate}
          />
        </div>
        <div className="space-y-1.5">
          <FormLabel
            htmlFor="special-request-time"
            className="font-heading text-xs text-slate-600"
            required
          >
            Time
          </FormLabel>
          <Input
            id="special-request-time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <FormLabel
          htmlFor="special-request-reason"
          className="font-heading text-xs text-slate-600"
          required
        >
          Reason
        </FormLabel>
        <Textarea
          id="special-request-reason"
          rows={2}
          value={reason}
          placeholder={t('appointments.labels.specialReason')}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <FormLabel htmlFor="special-request-notes" className="font-heading text-xs text-slate-600">
          Notes (optional)
        </FormLabel>
        <Textarea
          id="special-request-notes"
          rows={3}
          value={notes}
          placeholder={t('appointments.labels.internalNotes')}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <InlineNotice tone={canApprove ? 'info' : 'warning'}>
        {canApprove
          ? 'You can approve requests, so this appointment is scheduled immediately.'
          : `Special requests need clinic approval and must be made at least ${SPECIAL_REQUEST_MIN_LEAD_DAYS} days in advance.`}
      </InlineNotice>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
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
