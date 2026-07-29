'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BLOOD_TYPES,
  createPatientSchema,
  MARITAL_STATUSES,
  PATIENT_SEXES,
  PATIENT_STATUSES,
  RELIGIONS,
  RHESUS_FACTORS,
  type ApiSuccess,
  type CreatePatientInput,
  type PatientMutationMeta,
  type PatientProfile,
  type UpdatePatientInput,
} from '@hms/shared-types';
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
} from '@hms/ui';

import { PatientDoctorPicker } from '#components/client/patients/patient-doctor-picker';
import { FieldError } from '#components/client/shared/field-error';
import {
  patientManagementControllerCreatePatientV1,
  patientManagementControllerUpdatePatientV1,
} from '#lib/api/generated/patient-management/patient-management';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import { buildPatientOptionalFields } from '#lib/patients/build-patient-optional-fields';
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
  const [identifierWarnings, setIdentifierWarnings] = useState<string[]>([]);
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
      fullName: patient?.fullName ?? '',
      dateOfBirth: patient?.dateOfBirth ?? '',
      sex: patient?.sex ?? '',
      status: patient?.status ?? 'OUT_PATIENT',
      phoneNumber: patient?.phoneNumber ?? '',
      address: patient?.address ?? '',
      placeOfBirth: patient?.placeOfBirth ?? '',
      email: patient?.email ?? '',
      // Identifiers are write-only from this form: the profile carries masked
      // values, so an edit leaves them blank and only sends what is typed. A
      // blank field never clears a stored NIK.
      nik: '',
      bpjsNumber: '',
      bloodType: patient?.bloodType ?? '',
      rhesusFactor: patient?.rhesusFactor ?? '',
      maritalStatus: patient?.maritalStatus ?? '',
      religion: patient?.religion ?? '',
      occupation: patient?.occupation ?? '',
      emergencyContactName: patient?.emergencyContactName ?? '',
      emergencyContactPhone: patient?.emergencyContactPhone ?? '',
      guardianName: patient?.guardianName ?? '',
      guardianRelation: patient?.guardianRelation ?? '',
      doctorIds: [] as string[],
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      setIdentifierWarnings([]);
      let envelope: ApiSuccess<PatientProfile>;
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
              ...buildPatientOptionalFields(value),
            },
          });
          envelope = parseApiSuccess<PatientProfile>(response, SAVE_ERROR_FALLBACK);
        } else {
          const response = await createMutation.mutateAsync({
            fullName: value.fullName,
            dateOfBirth: value.dateOfBirth,
            sex: value.sex as CreatePatientInput['sex'],
            status: value.status as CreatePatientInput['status'],
            phoneNumber: value.phoneNumber,
            address: value.address,
            isActive: true,
            doctorIds: value.doctorIds.length > 0 ? value.doctorIds : undefined,
            ...buildPatientOptionalFields(value),
          });
          envelope = parseApiSuccess<PatientProfile>(response, SAVE_ERROR_FALLBACK);
        }
        await invalidatePatientQueries(queryClient);
        // A NIK that disagrees with the birth date or sex is flagged, never
        // rejected — legacy and edge-case NIKs exist. Surface it and keep the
        // dialog open so the front desk can correct the typo now.
        const warnings = (envelope.meta as PatientMutationMeta | undefined)?.identifierWarnings;
        if (warnings && warnings.length > 0) {
          setIdentifierWarnings(warnings);
          return;
        }
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

          {identifierWarnings.length > 0 ? (
            <div
              role="status"
              className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              <p className="font-medium">Saved, with identifier warnings:</p>
              <ul className="list-inside list-disc">
                {identifierWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <p className="text-xs">
                Correct the value if it was a typo, or close this dialog to keep it as entered.
              </p>
            </div>
          ) : null}

          {/* No MRN field: the server allocates it on create and it can never be
              edited afterwards — correcting a record is a merge, not a renumber. */}
          {isEditMode && patient ? (
            <div className="space-y-1.5">
              <span className="block font-heading text-xs font-medium text-slate-600">
                Patient ID (MRN)
              </span>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
                {patient.mrn}
              </p>
            </div>
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
                  <DatePicker
                    id={field.name}
                    value={field.state.value}
                    placeholder="Select date of birth"
                    onValueChange={field.handleChange}
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

          <div className="space-y-4 border-t border-slate-100 pt-4">
            <p className="font-heading text-xs font-semibold uppercase tracking-wide text-slate-500">
              National Identifiers
            </p>
            {isEditMode ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Stored NIK and BPJS numbers are encrypted and shown masked. Leave these blank to
                keep them; type a value only to replace one.
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <form.Field name="nik">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      NIK
                    </label>
                    <Input
                      id={field.name}
                      inputMode="numeric"
                      value={field.state.value}
                      placeholder="16 digits"
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="bpjsNumber">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      BPJS Number
                    </label>
                    <Input
                      id={field.name}
                      inputMode="numeric"
                      value={field.state.value}
                      placeholder="13 digits"
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-4">
            <p className="font-heading text-xs font-semibold uppercase tracking-wide text-slate-500">
              Demographics
            </p>
            <div className="grid grid-cols-2 gap-3">
              <form.Field name="placeOfBirth">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      Place of Birth
                    </label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      placeholder="Jakarta"
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="email">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      Email
                    </label>
                    <Input
                      id={field.name}
                      type="email"
                      value={field.state.value}
                      placeholder="patient@email.com"
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <form.Field name="bloodType">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      Blood Type
                    </label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger id={field.name} className="w-full">
                        <SelectValue placeholder="Unknown" />
                      </SelectTrigger>
                      <SelectContent>
                        {BLOOD_TYPES.map((bloodTypeValue) => (
                          <SelectItem key={bloodTypeValue} value={bloodTypeValue}>
                            {bloodTypeValue}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>
              <form.Field name="rhesusFactor">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      Rhesus
                    </label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger id={field.name} className="w-full">
                        <SelectValue placeholder="Unknown" />
                      </SelectTrigger>
                      <SelectContent>
                        {RHESUS_FACTORS.map((rhesusValue) => (
                          <SelectItem key={rhesusValue} value={rhesusValue}>
                            {formatPatientStatusLabel(rhesusValue)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <form.Field name="maritalStatus">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      Marital Status
                    </label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger id={field.name} className="w-full">
                        <SelectValue placeholder="Not recorded" />
                      </SelectTrigger>
                      <SelectContent>
                        {MARITAL_STATUSES.map((maritalValue) => (
                          <SelectItem key={maritalValue} value={maritalValue}>
                            {formatPatientStatusLabel(maritalValue)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>
              <form.Field name="religion">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      Religion
                    </label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger id={field.name} className="w-full">
                        <SelectValue placeholder="Not recorded" />
                      </SelectTrigger>
                      <SelectContent>
                        {RELIGIONS.map((religionValue) => (
                          <SelectItem key={religionValue} value={religionValue}>
                            {formatPatientStatusLabel(religionValue)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>
            </div>
            <form.Field name="occupation">
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor={field.name}
                    className="block font-heading text-xs font-medium text-slate-600"
                  >
                    Occupation
                  </label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    placeholder="Karyawan swasta"
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-4">
            <p className="font-heading text-xs font-semibold uppercase tracking-wide text-slate-500">
              Emergency Contact & Guardian
            </p>
            <div className="grid grid-cols-2 gap-3">
              <form.Field name="emergencyContactName">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      Contact Name
                    </label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="emergencyContactPhone">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      Contact Phone
                    </label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      placeholder="+628123456789"
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <form.Field name="guardianName">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      Guardian Name
                    </label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      placeholder="Penanggung jawab"
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="guardianRelation">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      Relation
                    </label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      placeholder="Ayah / Ibu / Suami"
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
            </div>
          </div>

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
