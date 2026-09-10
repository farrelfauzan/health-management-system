'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createDoctorSchema,
  doctorEmailFormSchema,
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
  PhoneInput,
} from '@hms/ui';

import { CredentialCatalogHint } from '#components/client/doctors/credential-catalog-hint';
import { DoctorAccountEmailNotice } from '#components/client/doctors/doctor-account-email-notice';
import { DoctorDegreesPicker } from '#components/client/doctors/doctor-degrees-picker';
import { DoctorEducationsField } from '#components/client/doctors/doctor-educations-field';
import { DoctorLicensesField } from '#components/client/doctors/doctor-licenses-field';
import { DoctorPatientPicker } from '#components/client/doctors/doctor-patient-picker';
import { DoctorTitleSelect } from '#components/client/doctors/doctor-title-select';
import { SpecialtyCombobox } from '#components/client/doctors/specialty-combobox';
import { FieldDescription } from '#components/client/shared/field-description';
import { FieldError } from '#components/client/shared/field-error';
import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { LabelInfoTooltip } from '#components/client/shared/label-info-tooltip';
import { RequiredLegend } from '#components/client/shared/required-legend';
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
import { DOCTOR_FORM_REQUIRED_FIELDS } from '#lib/doctors/doctor-form-required-fields';
import { usePatientsList } from '#lib/patients/use-patients-list';
import { useSpecialtiesList } from '#lib/specialties/use-specialties-list';

const PATIENT_PICKER_PAGE = { page: 1, limit: 100 };
const LICENSE_DESCRIPTION_ID = 'licenseNumber-description';

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
  // Free text written before the credential catalog existed (P19-T14). It has
  // no code to preselect, so the form shows what is on file and asks for a
  // pick rather than dropping a credential nobody can re-derive.
  const legacyTitle = doctor?.titleValue?.isLegacy ? doctor.titleValue.label : undefined;
  const legacyDegrees = (doctor?.degreeValues ?? [])
    .filter((value) => value.isLegacy)
    .map((value) => value.label)
    .join(', ');

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
      // Option codes, not the printed labels the response also carries.
      title: doctor?.titleValue?.code ?? '',
      degrees: (doctor?.degreeValues ?? [])
        .map((value) => value.code)
        .filter((code): code is string => Boolean(code)),
      // Create-only (P19-T15): on edit the address is shown read-only and the
      // update payload never carries it.
      email: '',
      // Write-only, like the patient NIK: the profile carries only a mask, so
      // a blank leaves the stored value alone rather than clearing it.
      nik: '',
      isActive: doctor?.isActive ?? true,
      patientIds: [] as string[],
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const trimmedTitle = value.title.trim();
      const trimmedNik = value.nik.trim();
      const trimmedEmail = value.email.trim();
      const credentials = {
        licenses: buildLicensePayload(licenseRows),
        educations: buildEducationPayload(educationRows),
      };
      const profileFields = {
        ...(trimmedTitle.length > 0 ? { title: trimmedTitle } : {}),
        // Always sent, so clearing every chip clears the stored degrees too.
        degrees: value.degrees,
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
            // Omitted when blank rather than sent empty: absent means "no
            // account for this doctor", which is not the same request as an
            // address the API would then reject as invalid.
            ...(trimmedEmail.length > 0 ? { email: trimmedEmail } : {}),
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
          <RequiredLegend />
          {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}

          {!isEditMode ? (
            <form.Field
              name="licenseNumber"
              validators={{ onSubmit: createDoctorSchema.shape.licenseNumber }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  {/* P19-T13 / D-032. The flat unique number is the STR, not a
                      SIP: one per doctor, lifetime, which is what a unique
                      identity column can hold. SIPs are per practice site and
                      belong in the typed licence list. */}
                  <div className="flex items-center gap-1.5">
                    <FormLabel
                      htmlFor={field.name}
                      className="font-heading text-xs text-slate-600"
                      required={DOCTOR_FORM_REQUIRED_FIELDS.has(field.name)}
                    >
                      {t('doctors.form.license')}
                    </FormLabel>
                    <LabelInfoTooltip field={t('doctors.form.license')}>
                      {t('doctors.form.licenseTooltip')}
                    </LabelInfoTooltip>
                  </div>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    placeholder="AB12345678901234"
                    aria-describedby={LICENSE_DESCRIPTION_ID}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldDescription id={LICENSE_DESCRIPTION_ID}>
                    {t('doctors.form.licenseDescription')}
                  </FieldDescription>
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>
          ) : null}

          <form.Field name="fullName" validators={{ onSubmit: createDoctorSchema.shape.fullName }}>
            {(field) => (
              <div className="space-y-1.5">
                <FormLabel
                  htmlFor={field.name}
                  className="font-heading text-xs text-slate-600"
                  required={DOCTOR_FORM_REQUIRED_FIELDS.has(field.name)}
                >
                  {t('doctors.form.fullName')}
                </FormLabel>
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
                  <FormLabel
                    htmlFor={field.name}
                    className="font-heading text-xs text-slate-600"
                    required={DOCTOR_FORM_REQUIRED_FIELDS.has(field.name)}
                  >
                    {t('doctors.form.specialty')}
                  </FormLabel>
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
                  <FormLabel
                    htmlFor={field.name}
                    className="font-heading text-xs text-slate-600"
                    required={DOCTOR_FORM_REQUIRED_FIELDS.has(field.name)}
                  >
                    {t('doctors.form.phone')}
                  </FormLabel>
                  <PhoneInput
                    id={field.name}
                    value={field.state.value}
                    placeholder="8129876543"
                    onValueChange={(value) => field.handleChange(value)}
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
              <FormLabel className="flex cursor-pointer items-center gap-2.5 font-normal">
                <Checkbox
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked === true)}
                />
                <span className="text-sm text-slate-700">{t('doctors.form.active')}</span>
              </FormLabel>
            )}
          </form.Field>

          <div className="space-y-4 border-t border-slate-100 pt-4">
            <p className="font-heading text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('doctors.form.identity')}
            </p>
            {/* Picked from the credential catalog since P19-T14, never typed:
                free text is how one credential reached documents spelled five
                different ways. A missing option is added under Settings. */}
            <div className="grid grid-cols-2 gap-3">
              <form.Field name="title">
                {(field) => (
                  <div className="space-y-1.5">
                    <FormLabel htmlFor={field.name} className="font-heading text-xs text-slate-600">
                      {t('doctors.form.title')}
                    </FormLabel>
                    <DoctorTitleSelect
                      id={field.name}
                      value={field.state.value}
                      legacyValue={legacyTitle}
                      onChange={(code) => field.handleChange(code)}
                    />
                    <CredentialCatalogHint legacyValue={legacyTitle} />
                  </div>
                )}
              </form.Field>
              <form.Field name="degrees">
                {(field) => (
                  <div className="space-y-1.5">
                    <FormLabel htmlFor={field.name} className="font-heading text-xs text-slate-600">
                      {t('doctors.form.degrees')}
                    </FormLabel>
                    <DoctorDegreesPicker
                      id={field.name}
                      values={field.state.value}
                      onChange={(codes) => field.handleChange(codes)}
                    />
                    <CredentialCatalogHint legacyValue={legacyDegrees || undefined} />
                  </div>
                )}
              </form.Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Optional on create, read-only on edit (P19-T15): entering it
                  creates or attaches the account the doctor signs in with, in
                  the same request. It is still not a field on the profile —
                  changing it later is an Administration action on the account,
                  which is what the edit-mode notice below points at. */}
              {!isEditMode ? (
                <form.Field name="email" validators={{ onSubmit: doctorEmailFormSchema }}>
                  {(field) => (
                    <div className="space-y-1.5">
                      <FormLabel
                        htmlFor={field.name}
                        className="font-heading text-xs text-slate-600"
                        required={DOCTOR_FORM_REQUIRED_FIELDS.has(field.name)}
                      >
                        {t('doctors.email')}
                      </FormLabel>
                      <Input
                        id={field.name}
                        type="email"
                        autoComplete="email"
                        value={field.state.value}
                        placeholder="budi.santoso@clinic.local"
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={field.state.meta.errors.length > 0}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </div>
                  )}
                </form.Field>
              ) : null}
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
                    <FormLabel
                      htmlFor={field.name}
                      className="font-heading text-xs text-slate-600"
                      required={!isEditMode && DOCTOR_FORM_REQUIRED_FIELDS.has(field.name)}
                    >
                      NIK
                    </FormLabel>
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
              <>
                <DoctorAccountEmailNotice
                  email={doctor?.email}
                  invitationStatus={doctor?.invitationStatus}
                />
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {t('doctors.form.nikHelp')}
                </p>
              </>
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
