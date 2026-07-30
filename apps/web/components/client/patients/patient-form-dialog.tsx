'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { PrivacyNoticeCapture } from '#components/client/patients/privacy-notice-capture';
import { FieldError } from '#components/client/shared/field-error';
import type { CreatePatientDto } from '#lib/api/generated/model/createPatientDto';
import type { CreatePatientDtoPrivacyNotice } from '#lib/api/generated/model/createPatientDtoPrivacyNotice';
import {
  patientManagementControllerCreatePatientV1,
  patientManagementControllerUpdatePatientV1,
} from '#lib/api/generated/patient-management/patient-management';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import { buildPatientOptionalFields } from '#lib/patients/build-patient-optional-fields';
import { invalidatePatientQueries } from '#lib/patients/invalidate-patient-queries';
import { useActiveDoctors } from '#lib/patients/use-active-doctors';

type PatientFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: PatientProfile | null;
};

export function PatientFormDialog({ open, onOpenChange, patient }: PatientFormDialogProps) {
  const isEditMode = Boolean(patient);
  const t = useTranslations('clinical');
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [identifierWarnings, setIdentifierWarnings] = useState<string[]>([]);
  const doctorsQuery = useActiveDoctors(open && !isEditMode);
  const createMutation = useMutation({
    mutationFn: (input: CreatePatientDto) => patientManagementControllerCreatePatientV1(input),
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
      privacyNotice: undefined as CreatePatientDtoPrivacyNotice | undefined,
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
          envelope = parseApiSuccess<PatientProfile>(response, t('patients.form.saveError'));
        } else {
          if (!value.privacyNotice) {
            setFormError(t('privacyNotice.outcomeRequired'));
            return;
          }
          if (
            value.privacyNotice.subjectType === 'REPRESENTATIVE' &&
            (!value.privacyNotice.representativeName?.trim() ||
              !value.privacyNotice.representativeRelation?.trim())
          ) {
            setFormError(t('privacyNotice.representativeRequired'));
            return;
          }
          const response = await createMutation.mutateAsync({
            fullName: value.fullName,
            dateOfBirth: value.dateOfBirth,
            sex: value.sex as CreatePatientInput['sex'],
            status: value.status as CreatePatientInput['status'],
            phoneNumber: value.phoneNumber,
            address: value.address,
            isActive: true,
            doctorIds: value.doctorIds.length > 0 ? value.doctorIds : undefined,
            privacyNotice: value.privacyNotice,
            ...buildPatientOptionalFields(value),
          });
          envelope = parseApiSuccess<PatientProfile>(response, t('patients.form.saveError'));
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
        setFormError(notifyApiError(error, t('patients.form.saveError')));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {t(isEditMode ? 'patients.form.edit' : 'patients.form.create')}
          </DialogTitle>
          <DialogDescription>
            {isEditMode ? t('patients.form.editDescription') : t('patients.form.createDescription')}
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
              <p className="font-medium">{t('patients.form.warnings')}</p>
              <ul className="list-inside list-disc">
                {identifierWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <p className="text-xs">{t('patients.form.warningHelp')}</p>
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
                  {t('patients.form.fullName')}
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
                    {t('patients.form.birthDate')}
                  </label>
                  <DatePicker
                    id={field.name}
                    value={field.state.value}
                    placeholder={t('patients.form.selectBirthDate')}
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
                onSubmit: ({ value }) => (value ? undefined : t('patients.form.sexRequired')),
              }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor={field.name}
                    className="block font-heading text-xs font-medium text-slate-600"
                  >
                    {t('patients.demographics.sex')}
                  </label>
                  <Select value={field.state.value} onValueChange={field.handleChange}>
                    <SelectTrigger
                      id={field.name}
                      className="w-full"
                      aria-invalid={field.state.meta.errors.length > 0}
                    >
                      <SelectValue placeholder={t('patients.form.selectSex')} />
                    </SelectTrigger>
                    <SelectContent>
                      {PATIENT_SEXES.map((sexValue) => (
                        <SelectItem key={sexValue} value={sexValue}>
                          {t(`patients.sex.${sexValue}`)}
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
                  {t('common.status')}
                </label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) =>
                    field.handleChange(value as (typeof PATIENT_STATUSES)[number])
                  }
                >
                  <SelectTrigger id={field.name} className="w-full">
                    <SelectValue placeholder={t('patients.form.selectStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    {PATIENT_STATUSES.map((statusValue) => (
                      <SelectItem key={statusValue} value={statusValue}>
                        {t(`patients.status.${statusValue}`)}
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
                  {t('patients.form.phone')}
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
                  {t('patients.form.address')}
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
              {t('patients.form.identifiers')}
            </p>
            {isEditMode ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {t('patients.form.identifierHelp')}
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
                      placeholder={t('patients.form.digits16')}
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
                      {t('patients.bpjsNumber')}
                    </label>
                    <Input
                      id={field.name}
                      inputMode="numeric"
                      value={field.state.value}
                      placeholder={t('patients.form.digits13')}
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
              {t('patients.form.demographics')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <form.Field name="placeOfBirth">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      {t('patients.form.birthPlace')}
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
                      {t('patients.form.email')}
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
                      {t('patients.form.bloodType')}
                    </label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger id={field.name} className="w-full">
                        <SelectValue placeholder={t('common.unknown')} />
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
                      {t('patients.form.rhesus')}
                    </label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger id={field.name} className="w-full">
                        <SelectValue placeholder={t('common.unknown')} />
                      </SelectTrigger>
                      <SelectContent>
                        {RHESUS_FACTORS.map((rhesusValue) => (
                          <SelectItem key={rhesusValue} value={rhesusValue}>
                            {t(`patients.rhesus.${rhesusValue}`)}
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
                      {t('patients.form.maritalStatus')}
                    </label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger id={field.name} className="w-full">
                        <SelectValue placeholder={t('common.notRecorded')} />
                      </SelectTrigger>
                      <SelectContent>
                        {MARITAL_STATUSES.map((maritalValue) => (
                          <SelectItem key={maritalValue} value={maritalValue}>
                            {t(`patients.maritalStatus.${maritalValue}`)}
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
                      {t('patients.form.religion')}
                    </label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger id={field.name} className="w-full">
                        <SelectValue placeholder={t('common.notRecorded')} />
                      </SelectTrigger>
                      <SelectContent>
                        {RELIGIONS.map((religionValue) => (
                          <SelectItem key={religionValue} value={religionValue}>
                            {t(`patients.religion.${religionValue}`)}
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
                    {t('patients.form.occupation')}
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
              {t('patients.form.contactGuardian')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <form.Field name="emergencyContactName">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      {t('patients.form.contactName')}
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
                      {t('patients.form.contactPhone')}
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
                      {t('patients.form.guardianName')}
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
                      {t('patients.form.relation')}
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
            <>
              <form.Field name="doctorIds">
                {(field) => (
                  <div className="space-y-1.5">
                    <span className="block font-heading text-xs font-medium text-slate-600">
                      {t('patients.form.initialDoctors')}
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
              <form.Field name="privacyNotice">
                {(field) => (
                  <PrivacyNoticeCapture
                    isEnabled={open}
                    isPatientOwnVariant={false}
                    value={field.state.value}
                    onChange={field.handleChange}
                  />
                )}
              </form.Field>
            </>
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
                      : t('patients.form.createAction')}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
