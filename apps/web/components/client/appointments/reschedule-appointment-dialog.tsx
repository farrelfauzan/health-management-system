'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppointmentListItem, AppointmentResponse } from '@hms/shared-types';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@hms/ui';

import { appointmentManagementControllerUpdateAppointmentV1 } from '#lib/api/generated/appointment-management/appointment-management';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import { formatTimeInputValue } from '#lib/appointments/format-appointment-time';
import { invalidateAppointmentQueries } from '#lib/appointments/invalidate-appointment-queries';
import { formatDateParam } from '#lib/appointments/week-range';

const RESCHEDULE_ERROR_FALLBACK = 'Unable to reschedule the appointment. Please try again.';

type RescheduleAppointmentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentListItem;
};

export function RescheduleAppointmentDialog({
  open,
  onOpenChange,
  appointment,
}: RescheduleAppointmentDialogProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const rescheduleMutation = useMutation({
    mutationFn: (scheduledAt: string) =>
      appointmentManagementControllerUpdateAppointmentV1(appointment.id, { scheduledAt }),
  });
  const form = useForm({
    defaultValues: {
      date: formatDateParam(new Date(appointment.scheduledAt)),
      time: formatTimeInputValue(appointment.scheduledAt),
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      if (!value.date || !value.time) {
        setFormError('Date and time are required.');
        return;
      }
      const scheduledAtDate = new Date(`${value.date}T${value.time}`);
      if (Number.isNaN(scheduledAtDate.getTime())) {
        setFormError('Enter a valid date and time.');
        return;
      }
      try {
        const response = await rescheduleMutation.mutateAsync(scheduledAtDate.toISOString());
        parseApiSuccess<AppointmentResponse>(response, RESCHEDULE_ERROR_FALLBACK);
        await invalidateAppointmentQueries(queryClient);
        onOpenChange(false);
      } catch (error) {
        setFormError(notifyApiError(error, RESCHEDULE_ERROR_FALLBACK));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Reschedule Appointment</DialogTitle>
          <DialogDescription>
            Pick a new slot for {appointment.patient.fullName} with {appointment.doctor.fullName}.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          {formError ? (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {formError}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <form.Field name="date">
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor={`reschedule-${field.name}`}
                    className="block font-heading text-xs font-medium text-slate-600"
                  >
                    Date
                  </label>
                  <DatePicker
                    id={`reschedule-${field.name}`}
                    value={field.state.value}
                    placeholder="Select date"
                    onValueChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="time">
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor={`reschedule-${field.name}`}
                    className="block font-heading text-xs font-medium text-slate-600"
                  >
                    Time
                  </label>
                  <Input
                    id={`reschedule-${field.name}`}
                    type="time"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-primary-container hover:bg-primary"
                >
                  {isSubmitting ? 'Rescheduling…' : 'Reschedule'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
