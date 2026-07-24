'use client';

import { useEffect, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateRegistrationInput, RegistrationListItem } from '@hms/shared-types';
import { createRegistrationSchema } from '@hms/shared-types';
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';

import { registrationFlowControllerCreateRegistrationV1 } from '#lib/api/generated/registration-flow/registration-flow';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import { usePatientsList } from '#lib/patients/use-patients-list';
import { formatRegisteredAt } from '#lib/registrations/format-registered-at';
import { invalidateRegistrationQueries } from '#lib/registrations/invalidate-registration-queries';
import type { RegistrationsViewVariant } from '#lib/registrations/registrations-view-variant';
import { useRegistrableAppointments } from '#lib/registrations/use-registrable-appointments';

const CREATE_ERROR_FALLBACK = 'Unable to create the registration. Please try again.';
const NO_APPOINTMENT_VALUE = 'NONE';
const PICKER_PAGE = { page: 1, limit: 100 };

type RegistrationCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: RegistrationsViewVariant;
};

export function RegistrationCreateDialog({
  open,
  onOpenChange,
  variant,
}: RegistrationCreateDialogProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const patientsQuery = usePatientsList(PICKER_PAGE);
  const appointmentsQuery = useRegistrableAppointments(selectedPatientId);
  const createMutation = useMutation({
    mutationFn: (input: CreateRegistrationInput) =>
      registrationFlowControllerCreateRegistrationV1(input),
  });
  const form = useForm({
    defaultValues: {
      patientId: '',
      appointmentId: NO_APPOINTMENT_VALUE,
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      if (!value.patientId) {
        setFormError('Select a patient to register.');
        return;
      }
      const parsed = createRegistrationSchema.safeParse({
        patientId: value.patientId,
        appointmentId:
          value.appointmentId === NO_APPOINTMENT_VALUE ? undefined : value.appointmentId,
      });
      if (!parsed.success) {
        setFormError(parsed.error.issues[0]?.message ?? 'Invalid registration details.');
        return;
      }
      try {
        const response = await createMutation.mutateAsync(parsed.data);
        parseApiSuccess<RegistrationListItem>(response, CREATE_ERROR_FALLBACK);
        await invalidateRegistrationQueries(queryClient);
        onOpenChange(false);
      } catch (error) {
        setFormError(notifyApiError(error, CREATE_ERROR_FALLBACK));
      }
    },
  });
  const soleOwnPatient = variant === 'patient' ? patientsQuery.patients[0] : undefined;

  useEffect(() => {
    if (soleOwnPatient && !form.state.values.patientId) {
      form.setFieldValue('patientId', soleOwnPatient.id);
      setSelectedPatientId(soleOwnPatient.id);
    }
  }, [form, soleOwnPatient]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">New Registration</DialogTitle>
          <DialogDescription>
            {variant === 'patient'
              ? 'Register your visit, optionally linked to an upcoming appointment.'
              : 'Register a patient visit, optionally linked to an upcoming appointment.'}
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
                  htmlFor="registration-patient-select"
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  Patient
                </label>
                <Combobox
                  id="registration-patient-select"
                  options={patientsQuery.patients.map((patient) => ({
                    value: patient.id,
                    label: `${patient.fullName} — ${patient.mrn}`,
                  }))}
                  value={field.state.value}
                  placeholder="Select a patient"
                  searchPlaceholder="Search by name or MRN..."
                  emptyMessage="No patient found."
                  isLoading={patientsQuery.isPending}
                  disabled={variant === 'patient'}
                  onChange={(nextValue) => {
                    field.handleChange(nextValue);
                    setSelectedPatientId(nextValue);
                    form.setFieldValue('appointmentId', NO_APPOINTMENT_VALUE);
                  }}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="appointmentId">
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor="registration-appointment-select"
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  Linked Appointment (optional)
                </label>
                <Select
                  value={field.state.value}
                  disabled={!selectedPatientId}
                  onValueChange={field.handleChange}
                >
                  <SelectTrigger id="registration-appointment-select" className="w-full">
                    <SelectValue
                      placeholder={
                        appointmentsQuery.isFetching
                          ? 'Loading appointments…'
                          : 'No linked appointment'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_APPOINTMENT_VALUE}>No linked appointment</SelectItem>
                    {appointmentsQuery.appointments.map((appointment) => (
                      <SelectItem key={appointment.id} value={appointment.id}>
                        {formatRegisteredAt(appointment.scheduledAt)} —{' '}
                        {appointment.doctor.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  Only scheduled or confirmed appointments can be linked.
                </p>
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
                  {isSubmitting ? 'Registering…' : 'Create Registration'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
