'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createDoctorSchema,
  indonesianPhoneNumberSchema,
  type DoctorDetail,
  type UpdateOwnDoctorProfileInput,
} from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  PhoneInput,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { CredentialCatalogHint } from '#components/client/doctors/credential-catalog-hint';
import { DoctorDegreesPicker } from '#components/client/doctors/doctor-degrees-picker';
import { DoctorEducationsField } from '#components/client/doctors/doctor-educations-field';
import { DoctorTitleSelect } from '#components/client/doctors/doctor-title-select';
import { FieldError } from '#components/client/shared/field-error';
import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import {
  doctorOwnProfileControllerUpdateOwnDoctorProfileV1,
  getDoctorOwnProfileControllerGetOwnDoctorProfileV1QueryKey,
} from '#lib/api/generated/doctor-management/doctor-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import {
  buildEducationPayload,
  buildEmptyEducationRow,
  toEducationRows,
  type EducationRow,
} from '#lib/doctors/doctor-credential-rows';
import { invalidateDoctorQueries } from '#lib/doctors/invalidate-doctor-queries';

type OwnDoctorProfileFormProps = {
  doctor: DoctorDetail;
};

/**
 * The part of a doctor's profile that is theirs to correct (P20-T03, D-025):
 * name, title, degrees, phone and education. Built from the same field
 * components as the administrative form, but it is a separate form on
 * purpose — it submits to `me/doctor-profile`, whose strict schema has no
 * specialty, licence, NIK or status for a field here to leak into.
 */
export function OwnDoctorProfileForm({ doctor }: OwnDoctorProfileFormProps) {
  const t = useTranslations('clinical');
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [educationRows, setEducationRows] = useState<EducationRow[]>(() =>
    toEducationRows(doctor.educations),
  );
  const [rowKeyCounter, setRowKeyCounter] = useState<number>(0);
  const legacyTitle = doctor.titleValue?.isLegacy ? doctor.titleValue.label : undefined;
  const legacyDegrees = doctor.degreeValues
    .filter((value) => value.isLegacy)
    .map((value) => value.label)
    .join(', ');
  const updateMutation = useMutation({
    mutationFn: (input: UpdateOwnDoctorProfileInput) =>
      doctorOwnProfileControllerUpdateOwnDoctorProfileV1(input),
  });

  function addEducationRow(): void {
    setEducationRows((rows) => [...rows, buildEmptyEducationRow(`new-education-${rowKeyCounter}`)]);
    setRowKeyCounter((counter) => counter + 1);
  }

  function updateEducationRow(key: string, changes: Partial<EducationRow>): void {
    setEducationRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }

  const form = useForm({
    defaultValues: {
      fullName: doctor.fullName,
      phoneNumber: doctor.phoneNumber ?? '',
      // Option codes, not the printed labels the response also carries.
      title: doctor.titleValue?.code ?? '',
      degrees: doctor.degreeValues
        .map((value) => value.code)
        .filter((code): code is string => Boolean(code)),
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const trimmedTitle = value.title.trim();
      const trimmedPhone = value.phoneNumber.trim();
      try {
        const response = await updateMutation.mutateAsync({
          fullName: value.fullName,
          ...(trimmedPhone.length > 0 ? { phoneNumber: trimmedPhone } : {}),
          ...(trimmedTitle.length > 0 ? { title: trimmedTitle } : {}),
          // Always sent, exactly as the administrative form does, so clearing
          // every chip clears the stored degrees too.
          degrees: value.degrees,
          educations: buildEducationPayload(educationRows),
        });
        parseApiSuccess<DoctorDetail>(response, t('ownProfile.saveError'));
        await queryClient.invalidateQueries({
          queryKey: getDoctorOwnProfileControllerGetOwnDoctorProfileV1QueryKey(),
        });
        await invalidateDoctorQueries(queryClient);
        toast.success(t('ownProfile.saved'));
      } catch (error) {
        setFormError(notifyApiError(error, t('ownProfile.saveError')));
      }
    },
  });

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          {t('ownProfile.editableTitle')}
        </CardTitle>
        <CardDescription>{t('ownProfile.editableDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}

          <form.Field name="fullName" validators={{ onSubmit: createDoctorSchema.shape.fullName }}>
            {(field) => (
              <div className="space-y-1.5">
                <FormLabel
                  htmlFor={field.name}
                  className="font-heading text-xs text-slate-600"
                  required
                >
                  {t('doctors.form.fullName')}
                </FormLabel>
                <Input
                  id={field.name}
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
            name="phoneNumber"
            validators={{
              onSubmit: ({ value }) =>
                value.trim().length === 0 || indonesianPhoneNumberSchema.safeParse(value).success
                  ? undefined
                  : t('ownProfile.phoneInvalid'),
            }}
          >
            {(field) => (
              <div className="space-y-1.5">
                <FormLabel htmlFor={field.name} className="font-heading text-xs text-slate-600">
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

          <div className="grid gap-3 sm:grid-cols-2">
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

          <div className="space-y-4 border-t border-slate-100 pt-4">
            <DoctorEducationsField
              rows={educationRows}
              onAdd={addEducationRow}
              onChange={updateEducationRow}
              onRemove={(key) => setEducationRows((rows) => rows.filter((row) => row.key !== key))}
            />
          </div>

          <div className="flex justify-end">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-primary-container hover:bg-primary"
                >
                  {isSubmitting ? t('ownProfile.saving') : t('ownProfile.save')}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
