'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppointmentResponse, DoctorSessionListItem } from '@hms/shared-types';
import { Button, DatePicker, DialogFooter, Textarea } from '@hms/ui';

import { SessionOptionCard } from '#components/client/appointments/session-option-card';
import { appointmentManagementControllerCreateAppointmentV1 } from '#lib/api/generated/appointment-management/appointment-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAppointmentQueries } from '#lib/appointments/invalidate-appointment-queries';
import { useDoctorSessions } from '#lib/appointments/use-doctor-sessions';

const BOOKING_ERROR_FALLBACK = 'Unable to join the session. Please try again.';

type SessionBookingFormProps = {
  patientId: string;
  doctorId: string;
  initialDate: string;
  onSuccess: () => void;
  onCancel: () => void;
};

export function SessionBookingForm({
  patientId,
  doctorId,
  initialDate,
  onSuccess,
  onCancel,
}: SessionBookingFormProps) {
  const queryClient = useQueryClient();
  const [sessionDate, setSessionDate] = useState<string>(initialDate);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const sessionsQuery = useDoctorSessions({
    doctorId,
    from: sessionDate,
    to: sessionDate,
  });
  const bookingMutation = useMutation({
    mutationFn: () =>
      appointmentManagementControllerCreateAppointmentV1({
        type: 'SESSION',
        patientId,
        doctorId,
        scheduleId: selectedScheduleId,
        sessionDate,
        reason: reason.trim() ? reason.trim() : undefined,
      }),
  });

  function handleSelectSession(session: DoctorSessionListItem): void {
    setSelectedScheduleId(session.scheduleId);
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    if (!patientId || !doctorId) {
      setFormError('Select a patient and a doctor first.');
      return;
    }
    if (!sessionDate || !selectedScheduleId) {
      setFormError('Pick a date and a session to join.');
      return;
    }
    try {
      const response = await bookingMutation.mutateAsync();
      parseApiSuccess<AppointmentResponse>(response, BOOKING_ERROR_FALLBACK);
      await invalidateAppointmentQueries(queryClient);
      onSuccess();
    } catch (error) {
      setFormError(notifyApiError(error, BOOKING_ERROR_FALLBACK));
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

      <div className="space-y-1.5">
        <label
          htmlFor="session-date-picker"
          className="block font-heading text-xs font-medium text-slate-600"
        >
          Date
        </label>
        <DatePicker
          id="session-date-picker"
          value={sessionDate}
          placeholder="Select date"
          onValueChange={(value) => {
            setSessionDate(value);
            setSelectedScheduleId('');
          }}
        />
      </div>

      <div className="space-y-1.5">
        <p className="font-heading text-xs font-medium text-slate-600">Available sessions</p>
        {!doctorId ? (
          <p className="text-sm text-slate-500">Select a doctor to see their sessions.</p>
        ) : sessionsQuery.isPending ? (
          <p className="text-sm text-slate-500">Loading sessions…</p>
        ) : sessionsQuery.sessions.length === 0 ? (
          <p className="text-sm text-slate-500">
            No practice sessions on this date. Pick another day or file a special request.
          </p>
        ) : (
          <div className="space-y-2">
            {sessionsQuery.sessions.map((session) => (
              <SessionOptionCard
                key={`${session.sessionDate}|${session.startTime}`}
                session={session}
                isSelected={session.scheduleId === selectedScheduleId}
                onSelect={handleSelectSession}
              />
            ))}
          </div>
        )}
        <p className="text-xs text-slate-500">
          No fixed time inside the session — patients are seen in order of arrival. Booking closes 1
          hour before the session starts.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="session-reason"
          className="block font-heading text-xs font-medium text-slate-600"
        >
          Reason (optional)
        </label>
        <Textarea
          id="session-reason"
          rows={2}
          value={reason}
          placeholder="Reason for the visit…"
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={bookingMutation.isPending}
          className="bg-primary-container hover:bg-primary"
          onClick={() => void handleSubmit()}
        >
          {bookingMutation.isPending ? 'Joining…' : 'Join Session'}
        </Button>
      </DialogFooter>
    </div>
  );
}
