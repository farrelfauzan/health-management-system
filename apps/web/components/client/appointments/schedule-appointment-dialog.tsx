'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppointmentResponse, CreateAppointmentInput } from '@hms/shared-types';
import { createAppointmentSchema } from '@hms/shared-types';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@hms/ui';

import { appointmentManagementControllerCreateAppointmentV1 } from '#lib/api/generated/appointment-management/appointment-management';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateAppointmentQueries } from '#lib/appointments/invalidate-appointment-queries';
import { useDoctorsList } from '#lib/doctors/use-doctors-list';
import { usePatientsList } from '#lib/patients/use-patients-list';

const SCHEDULE_ERROR_FALLBACK = 'Unable to schedule the appointment. Please try again.';
const DEFAULT_TIME = '09:00';
const PICKER_PAGE = { page: 1, limit: 100 };
const DOCTOR_PICKER_QUERY = { ...PICKER_PAGE, isActive: 'true' as const };

type ScheduleAppointmentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate: string;
};

export function ScheduleAppointmentDialog({
  open,
  onOpenChange,
  initialDate,
}: ScheduleAppointmentDialogProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const patientsQuery = usePatientsList(PICKER_PAGE);
  const doctorsQuery = useDoctorsList(DOCTOR_PICKER_QUERY);
  const createMutation = useMutation({
    mutationFn: (input: CreateAppointmentInput) =>
      appointmentManagementControllerCreateAppointmentV1(input),
  });
  const form = useForm({
    defaultValues: {
      patientId: '',
      doctorId: '',
      date: initialDate,
      time: DEFAULT_TIME,
      reason: '',
      notes: '',
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      if (!value.patientId || !value.doctorId || !value.date || !value.time) {
        setFormError('Patient, doctor, date, and time are required.');
        return;
      }
      const scheduledAtDate = new Date(`${value.date}T${value.time}`);
      if (Number.isNaN(scheduledAtDate.getTime())) {
        setFormError('Enter a valid date and time.');
        return;
      }
      const parsed = createAppointmentSchema.safeParse({
        patientId: value.patientId,
        doctorId: value.doctorId,
        scheduledAt: scheduledAtDate.toISOString(),
        reason: value.reason.trim() ? value.reason.trim() : undefined,
        notes: value.notes.trim() ? value.notes.trim() : undefined,
      });
      if (!parsed.success) {
        setFormError(parsed.error.issues[0]?.message ?? 'Invalid appointment details.');
        return;
      }
      try {
        const response = await createMutation.mutateAsync(parsed.data);
        parseApiSuccess<AppointmentResponse>(response, SCHEDULE_ERROR_FALLBACK);
        await invalidateAppointmentQueries(queryClient);
        onOpenChange(false);
      } catch (error) {
        setFormError(resolveApiErrorMessage(error, SCHEDULE_ERROR_FALLBACK));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">New Appointment</DialogTitle>
          <DialogDescription>
            Book a visit for a patient with an available doctor.
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

          <form.Field name="patientId">
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor="schedule-patient-select"
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  Patient
                </label>
                <Select value={field.state.value} onValueChange={field.handleChange}>
                  <SelectTrigger id="schedule-patient-select" className="w-full">
                    <SelectValue
                      placeholder={
                        patientsQuery.isPending ? 'Loading patients…' : 'Select a patient'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {patientsQuery.patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.fullName} — {patient.mrn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Field name="doctorId">
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor="schedule-doctor-select"
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  Doctor
                </label>
                <Select value={field.state.value} onValueChange={field.handleChange}>
                  <SelectTrigger id="schedule-doctor-select" className="w-full">
                    <SelectValue
                      placeholder={doctorsQuery.isPending ? 'Loading doctors…' : 'Select a doctor'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {doctorsQuery.doctors.map((doctor) => (
                      <SelectItem key={doctor.id} value={doctor.id}>
                        {doctor.fullName} ({doctor.specialty})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <div className="grid grid-cols-2 gap-3">
            <form.Field name="date">
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor={field.name}
                    className="block font-heading text-xs font-medium text-slate-600"
                  >
                    Date
                  </label>
                  <DatePicker
                    id={field.name}
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
                    htmlFor={field.name}
                    className="block font-heading text-xs font-medium text-slate-600"
                  >
                    Time
                  </label>
                  <Input
                    id={field.name}
                    type="time"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="reason">
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor={field.name}
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  Reason (optional)
                </label>
                <Textarea
                  id={field.name}
                  rows={2}
                  value={field.state.value}
                  placeholder="Reason for appointment…"
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="notes">
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor={field.name}
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  Notes (optional)
                </label>
                <Textarea
                  id={field.name}
                  rows={3}
                  value={field.state.value}
                  placeholder="Internal notes for the care team…"
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>

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
                  {isSubmitting ? 'Booking…' : 'Confirm Booking'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
