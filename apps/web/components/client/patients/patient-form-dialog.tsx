'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createPatientSchema,
  PATIENT_SEXES,
  PATIENT_STATUSES,
  type CreatePatientInput,
  type PatientProfile,
  type UpdatePatientInput,
} from '@hms/shared-types';
import {
  Button,
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
} from '@hms/ui';

import { PatientDoctorPicker } from '#components/client/patients/patient-doctor-picker';
import { FieldError } from '#components/client/shared/field-error';
import {
  patientManagementControllerCreatePatientV1,
  patientManagementControllerUpdatePatientV1,
} from '#lib/api/generated/patient-management/patient-management';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidatePatientQueries } from '#lib/patients/invalidate-patient-queries';
import { formatPatientSexLabel } from '#lib/patients/patient-sex-label';
import { formatPatientStatusLabel } from '#lib/patients/patient-status-label';
import { useActiveDoctors } from '#lib/patients/use-active-doctors';

const SAVE_ERROR_FALLBACK = 'Unable to save the patient. Please try again.';

type PatientFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: PatientProfile | null;
};

export function PatientFormDialog({ open, onOpenChange, patient }: PatientFormDialogProps) {
  const isEditMode = Boolean(patient);
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const doctorsQuery = useActiveDoctors(open && !isEditMode);
  const createMutation = useMutation({
    mutationFn: (input: CreatePatientInput) => patientManagementControllerCreatePatientV1(input),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePatientInput }) =>
      patientManagementControllerUpdatePatientV1(id, input),
  });
  const form = useForm({
    defaultValues: {
      mrn: patient?.mrn ?? '',
      fullName: patient?.fullName ?? '',
      dateOfBirth: patient?.dateOfBirth ?? '',
      sex: patient?.sex ?? '',
      status: patient?.status ?? 'OUT_PATIENT',
      phoneNumber: patient?.phoneNumber ?? '',
      address: patient?.address ?? '',
      doctorIds: [] as string[],
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        if (isEditMode && patient) {
          const response = await updateMutation.mutateAsync({
            id: patient.id,
            input: {
              fullName: value.fullName,
              dateOfBirth: value.dateOfBirth,
              sex: value.sex as UpdatePatientInput['sex'],
              status: value.status as UpdatePatientInput['status'],
              phoneNumber: value.phoneNumber,
              address: value.address,
            },
          });
          parseApiSuccess<PatientProfile>(response, SAVE_ERROR_FALLBACK);
        } else {
          const response = await createMutation.mutateAsync({
            mrn: value.mrn,
            fullName: value.fullName,
            dateOfBirth: value.dateOfBirth,
            sex: value.sex as CreatePatientInput['sex'],
            status: value.status as CreatePatientInput['status'],
            phoneNumber: value.phoneNumber,
            address: value.address,
            isActive: true,
            doctorIds: value.doctorIds.length > 0 ? value.doctorIds : undefined,
          });
          parseApiSuccess<PatientProfile>(response, SAVE_ERROR_FALLBACK);
        }
        await invalidatePatientQueries(queryClient);
        onOpenChange(false);
      } catch (error) {
        setFormError(resolveApiErrorMessage(error, SAVE_ERROR_FALLBACK));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {isEditMode ? 'Edit Patient' : 'Add New Patient'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update the patient demographics and status.'
              : 'Register a new patient record, optionally assigning initial doctors.'}
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

          {!isEditMode ? (
            <form.Field name="mrn" validators={{ onSubmit: createPatientSchema.shape.mrn }}>
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor={field.name}
                    className="block font-heading text-xs font-medium text-slate-600"
                  >
                    Patient ID (MRN)
                  </label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    placeholder="MRN-2026-0001"
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>
          ) : null}

          <form.Field name="fullName" validators={{ onSubmit: createPatientSchema.shape.fullName }}>
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor={field.name}
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  Full Name
                </label>
                <Input
                  id={field.name}
                  value={field.state.value}
                  placeholder="Aisha Rahman"
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <div className="grid grid-cols-2 gap-3">
            <form.Field
              name="dateOfBirth"
              validators={{ onSubmit: createPatientSchema.shape.dateOfBirth }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor={field.name}
                    className="block font-heading text-xs font-medium text-slate-600"
                  >
                    Date of Birth
                  </label>
                  <Input
                    id={field.name}
                    type="date"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>
            <form.Field
              name="sex"
              validators={{
                onSubmit: ({ value }) => (value ? undefined : 'Sex is required'),
              }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor={field.name}
                    className="block font-heading text-xs font-medium text-slate-600"
                  >
                    Sex
                  </label>
                  <Select value={field.state.value} onValueChange={field.handleChange}>
                    <SelectTrigger
                      id={field.name}
                      className="w-full"
                      aria-invalid={field.state.meta.errors.length > 0}
                    >
                      <SelectValue placeholder="Select sex" />
                    </SelectTrigger>
                    <SelectContent>
                      {PATIENT_SEXES.map((sexValue) => (
                        <SelectItem key={sexValue} value={sexValue}>
                          {formatPatientSexLabel(sexValue)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="status">
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor={field.name}
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  Status
                </label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) =>
                    field.handleChange(value as (typeof PATIENT_STATUSES)[number])
                  }
                >
                  <SelectTrigger id={field.name} className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {PATIENT_STATUSES.map((statusValue) => (
                      <SelectItem key={statusValue} value={statusValue}>
                        {formatPatientStatusLabel(statusValue)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Field
            name="phoneNumber"
            validators={{ onSubmit: createPatientSchema.shape.phoneNumber }}
          >
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor={field.name}
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  Phone Number
                </label>
                <Input
                  id={field.name}
                  value={field.state.value}
                  placeholder="+628123456789"
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <form.Field name="address" validators={{ onSubmit: createPatientSchema.shape.address }}>
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor={field.name}
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  Address
                </label>
                <Input
                  id={field.name}
                  value={field.state.value}
                  placeholder="Jl. Melati No. 5, Jakarta"
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          {!isEditMode ? (
            <form.Field name="doctorIds">
              {(field) => (
                <div className="space-y-1.5">
                  <span className="block font-heading text-xs font-medium text-slate-600">
                    Initial Doctors (optional)
                  </span>
                  <PatientDoctorPicker
                    doctors={doctorsQuery.doctors}
                    selectedDoctorIds={field.state.value}
                    isLoading={doctorsQuery.isPending}
                    onToggleDoctor={(doctorId) =>
                      field.handleChange(
                        field.state.value.includes(doctorId)
                          ? field.state.value.filter((id) => id !== doctorId)
                          : [...field.state.value, doctorId],
                      )
                    }
                  />
                </div>
              )}
            </form.Field>
          ) : null}

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
                  {isSubmitting ? 'Saving…' : isEditMode ? 'Save Changes' : 'Create Patient'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
