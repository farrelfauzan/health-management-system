'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createDoctorSchema,
  type CreateDoctorInput,
  type DoctorEducation,
  type DoctorLicense,
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

import { DoctorEducationsField } from '#components/client/doctors/doctor-educations-field';
import { DoctorLicensesField } from '#components/client/doctors/doctor-licenses-field';
import { DoctorPatientPicker } from '#components/client/doctors/doctor-patient-picker';
import { SpecialtyCombobox } from '#components/client/doctors/specialty-combobox';
import { FieldError } from '#components/client/shared/field-error';
import {
  buildEducationPayload,
  buildEmptyEducationRow,
  buildEmptyLicenseRow,
  buildLicensePayload,
  toEducationRows,
  toLicenseRows,
  type EducationRow,
  type LicenseRow,
} from '#lib/doctors/doctor-credential-rows';
import {
  doctorManagementControllerCreateDoctorV1,
  doctorManagementControllerUpdateDoctorV1,
} from '#lib/api/generated/doctor-management/doctor-management';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateDoctorQueries } from '#lib/doctors/invalidate-doctor-queries';
import { usePatientsList } from '#lib/patients/use-patients-list';
import { useSpecialtiesList } from '#lib/specialties/use-specialties-list';

const PATIENT_PICKER_PAGE = { page: 1, limit: 100 };

type DoctorFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctor?: DoctorProfile | null;
  /**
   * Credentials live on the detail response, not the profile, so the detail
   * panel passes them in. The directory list omits them and the editors start
   * empty — which is correct there, since the list never edits credentials.
   */
  licenses?: DoctorLicense[];
  educations?: DoctorEducation[];
};

export function DoctorFormDialog({
  open,
  onOpenChange,
  doctor,
  licenses = [],
  educations = [],
}: DoctorFormDialogProps) {
  const isEditMode = Boolean(doctor);
  const t = useTranslations('clinical');
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [licenseRows, setLicenseRows] = useState<LicenseRow[]>(() => toLicenseRows(licenses));
  const [educationRows, setEducationRows] = useState<EducationRow[]>(() =>
    toEducationRows(educations),
  );
  const [rowKeyCounter, setRowKeyCounter] = useState<number>(0);

  function addLicenseRow(): void {
    setLicenseRows((rows) => [...rows, buildEmptyLicenseRow(`new-license-${rowKeyCounter}`)]);
    setRowKeyCounter((counter) => counter + 1);
  }

  function addEducationRow(): void {
    setEducationRows((rows) => [...rows, buildEmptyEducationRow(`new-education-${rowKeyCounter}`)]);
    setRowKeyCounter((counter) => counter + 1);
  }

  function updateLicenseRow(key: string, changes: Partial<LicenseRow>): void {
    setLicenseRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }

  function updateEducationRow(key: string, changes: Partial<EducationRow>): void {
    setEducationRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }
  const patientsQuery = usePatientsList(PATIENT_PICKER_PAGE);
  const specialtiesQuery = useSpecialtiesList();
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
      specialtyId: doctor?.specialtyId ?? '',
      phoneNumber: doctor?.phoneNumber ?? '',
      title: doctor?.title ?? '',
      degrees: doctor?.degrees ?? '',
      // Write-only, like the patient NIK: the profile carries only a mask, so
      // a blank leaves the stored value alone rather than clearing it.
      nik: '',
      isActive: doctor?.isActive ?? true,
      patientIds: [] as string[],
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const trimmedTitle = value.title.trim();
      const trimmedDegrees = value.degrees.trim();
      const trimmedNik = value.nik.trim();
      const credentials = {
        licenses: buildLicensePayload(licenseRows),
        educations: buildEducationPayload(educationRows),
      };
      const profileFields = {
        ...(trimmedTitle.length > 0 ? { title: trimmedTitle } : {}),
        ...(trimmedDegrees.length > 0 ? { degrees: trimmedDegrees } : {}),
        ...(trimmedNik.length > 0 ? { nik: trimmedNik } : {}),
      };
      try {
        if (isEditMode && doctor) {
          const response = await updateMutation.mutateAsync({
            id: doctor.id,
            input: {
              fullName: value.fullName,
              specialtyId: value.specialtyId,
              phoneNumber: value.phoneNumber,
              isActive: value.isActive,
              ...profileFields,
              ...credentials,
            },
          });
          parseApiSuccess<DoctorProfile>(response, t('doctors.form.saveError'));
        } else {
          const response = await createMutation.mutateAsync({
            licenseNumber: value.licenseNumber,
            fullName: value.fullName,
            specialtyId: value.specialtyId,
            phoneNumber: value.phoneNumber,
            isActive: value.isActive,
            patientIds: value.patientIds.length > 0 ? value.patientIds : undefined,
            ...profileFields,
            ...credentials,
            nik: trimmedNik,
          });
          parseApiSuccess<DoctorProfile>(response, t('doctors.form.saveError'));
        }
        await invalidateDoctorQueries(queryClient);
        onOpenChange(false);
      } catch (error) {
        setFormError(notifyApiError(error, t('doctors.form.saveError')));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {t(isEditMode ? 'doctors.form.edit' : 'doctors.form.create')}
          </DialogTitle>
          <DialogDescription>
            {isEditMode ? t('doctors.form.editDescription') : t('doctors.form.createDescription')}
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
                    {t('doctors.form.license')}
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
                  {t('doctors.form.fullName')}
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
              name="specialtyId"
              validators={{ onSubmit: createDoctorSchema.shape.specialtyId }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor={field.name}
                    className="block font-heading text-xs font-medium text-slate-600"
                  >
                    {t('doctors.form.specialty')}
                  </label>
                  <SpecialtyCombobox
                    id={field.name}
                    specialties={specialtiesQuery.specialties}
                    value={field.state.value}
                    isLoading={specialtiesQuery.isPending}
                    hasError={field.state.meta.errors.length > 0}
                    onChange={(specialtyId) => field.handleChange(specialtyId)}
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
                    {t('doctors.form.phone')}
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
                <span className="text-sm text-slate-700">{t('doctors.form.active')}</span>
              </label>
            )}
          </form.Field>

          <div className="space-y-4 border-t border-slate-100 pt-4">
            <p className="font-heading text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('doctors.form.identity')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <form.Field name="title">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      {t('doctors.form.title')}
                    </label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      placeholder="dr."
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="degrees">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      {t('doctors.form.degrees')}
                    </label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      placeholder="Sp.PD"
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Email is not here on purpose: it is the address the doctor
                  signs in with, managed on their user account under
                  Administration, and read back through that relation. */}
              {/* Required on create, optional on edit: the API demands a NIK
                  for every new doctor because SATUSEHAT resolves the IHS
                  practitioner number from it and nothing else, while an edit
                  leaves the stored value alone when the box is blank. */}
              <form.Field
                name="nik"
                validators={isEditMode ? {} : { onSubmit: createDoctorSchema.shape.nik }}
              >
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
                      placeholder={t(
                        isEditMode ? 'doctors.form.keepBlank' : 'doctors.form.digits16',
                      )}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </div>
                )}
              </form.Field>
            </div>
            {isEditMode ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {t('doctors.form.nikHelp')}
              </p>
            ) : null}
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-4">
            <DoctorLicensesField
              rows={licenseRows}
              onAdd={addLicenseRow}
              onChange={updateLicenseRow}
              onRemove={(key) => setLicenseRows((rows) => rows.filter((row) => row.key !== key))}
            />
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-4">
            <DoctorEducationsField
              rows={educationRows}
              onAdd={addEducationRow}
              onChange={updateEducationRow}
              onRemove={(key) => setEducationRows((rows) => rows.filter((row) => row.key !== key))}
            />
          </div>

          {!isEditMode ? (
            <form.Field name="patientIds">
              {(field) => (
                <div className="space-y-1.5">
                  <span className="block font-heading text-xs font-medium text-slate-600">
                    {t('doctors.form.initialPatients')}
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
              {t('common.cancel')}
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-primary-container hover:bg-primary"
                >
                  {isSubmitting
                    ? t('common.saving')
                    : isEditMode
                      ? t('common.saveChanges')
                      : t('doctors.form.createAction')}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
