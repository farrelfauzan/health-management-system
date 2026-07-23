'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createDoctorSchema,
  type CreateDoctorInput,
  type DoctorProfile,
  type UpdateDoctorInput,
} from '@hms/shared-types';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@hms/ui';

import { DoctorPatientPicker } from '#components/client/doctors/doctor-patient-picker';
import { FieldError } from '#components/client/shared/field-error';
import {
  doctorManagementControllerCreateDoctorV1,
  doctorManagementControllerUpdateDoctorV1,
} from '#lib/api/generated/doctor-management/doctor-management';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateDoctorQueries } from '#lib/doctors/invalidate-doctor-queries';
import { usePatientsList } from '#lib/patients/use-patients-list';

const SAVE_ERROR_FALLBACK = 'Unable to save the doctor. Please try again.';
const PATIENT_PICKER_PAGE = { page: 1, limit: 100 };

type DoctorFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctor?: DoctorProfile | null;
};

export function DoctorFormDialog({ open, onOpenChange, doctor }: DoctorFormDialogProps) {
  const isEditMode = Boolean(doctor);
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const patientsQuery = usePatientsList(PATIENT_PICKER_PAGE);
  const createMutation = useMutation({
    mutationFn: (input: CreateDoctorInput) => doctorManagementControllerCreateDoctorV1(input),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDoctorInput }) =>
      doctorManagementControllerUpdateDoctorV1(id, input),
  });
  const form = useForm({
    defaultValues: {
      licenseNumber: doctor?.licenseNumber ?? '',
      fullName: doctor?.fullName ?? '',
      specialty: doctor?.specialty ?? '',
      phoneNumber: doctor?.phoneNumber ?? '',
      isActive: doctor?.isActive ?? true,
      patientIds: [] as string[],
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        if (isEditMode && doctor) {
          const response = await updateMutation.mutateAsync({
            id: doctor.id,
            input: {
              fullName: value.fullName,
              specialty: value.specialty,
              phoneNumber: value.phoneNumber,
              isActive: value.isActive,
            },
          });
          parseApiSuccess<DoctorProfile>(response, SAVE_ERROR_FALLBACK);
        } else {
          const response = await createMutation.mutateAsync({
            licenseNumber: value.licenseNumber,
            fullName: value.fullName,
            specialty: value.specialty,
            phoneNumber: value.phoneNumber,
            isActive: value.isActive,
            patientIds: value.patientIds.length > 0 ? value.patientIds : undefined,
          });
          parseApiSuccess<DoctorProfile>(response, SAVE_ERROR_FALLBACK);
        }
        await invalidateDoctorQueries(queryClient);
        onOpenChange(false);
      } catch (error) {
        setFormError(notifyApiError(error, SAVE_ERROR_FALLBACK));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {isEditMode ? 'Edit Doctor' : 'Add New Doctor'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update the doctor profile.'
              : 'Register a new doctor profile, optionally assigning initial patients.'}
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
            <form.Field
              name="licenseNumber"
              validators={{ onSubmit: createDoctorSchema.shape.licenseNumber }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor={field.name}
                    className="block font-heading text-xs font-medium text-slate-600"
                  >
                    License Number
                  </label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    placeholder="SIP-2026-0001"
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>
          ) : null}

          <form.Field name="fullName" validators={{ onSubmit: createDoctorSchema.shape.fullName }}>
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
                  placeholder="Dr. Budi Santoso"
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
              name="specialty"
              validators={{ onSubmit: createDoctorSchema.shape.specialty }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor={field.name}
                    className="block font-heading text-xs font-medium text-slate-600"
                  >
                    Specialty
                  </label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    placeholder="Cardiology"
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>
            <form.Field
              name="phoneNumber"
              validators={{ onSubmit: createDoctorSchema.shape.phoneNumber }}
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
                    placeholder="+628129876543"
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="isActive">
            {(field) => (
              <label className="flex cursor-pointer items-center gap-2.5">
                <Checkbox
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked === true)}
                />
                <span className="text-sm text-slate-700">Active</span>
              </label>
            )}
          </form.Field>

          {!isEditMode ? (
            <form.Field name="patientIds">
              {(field) => (
                <div className="space-y-1.5">
                  <span className="block font-heading text-xs font-medium text-slate-600">
                    Initial Patients (optional)
                  </span>
                  <DoctorPatientPicker
                    patients={patientsQuery.patients}
                    selectedPatientIds={field.state.value}
                    isLoading={patientsQuery.isPending}
                    onTogglePatient={(patientId) =>
                      field.handleChange(
                        field.state.value.includes(patientId)
                          ? field.state.value.filter((id) => id !== patientId)
                          : [...field.state.value, patientId],
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
                  {isSubmitting ? 'Saving…' : isEditMode ? 'Save Changes' : 'Create Doctor'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
