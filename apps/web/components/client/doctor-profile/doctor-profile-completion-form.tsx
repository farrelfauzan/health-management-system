'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import {
  createDoctorSchema,
  type CompleteOwnDoctorProfileInput,
  type DoctorDetail,
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
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DoctorDegreesPicker } from '#components/client/doctors/doctor-degrees-picker';
import { DoctorTitleSelect } from '#components/client/doctors/doctor-title-select';
import { SpecialtyCombobox } from '#components/client/doctors/specialty-combobox';
import { FieldDescription } from '#components/client/shared/field-description';
import { FieldError } from '#components/client/shared/field-error';
import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { doctorOwnProfileControllerCompleteOwnDoctorProfileV1 } from '#lib/api/generated/doctor-management/doctor-management';
import { refreshSession } from '#lib/api/http';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { useSpecialtiesList } from '#lib/specialties/use-specialties-list';

const CREDENTIALS_DESCRIPTION_ID = 'profile-completion-credentials-description';

type DoctorProfileCompletionFormProps = {
  /** Absent when the account has no doctor profile yet — the invited case. */
  doctor?: DoctorDetail;
  nextPath: string;
};

/**
 * What the completion screen asks (P20-T02, D-026). Name, phone, title and
 * degrees always, because they are the doctor's own. Specialty, STR number
 * and NIK only while the profile lacks them: all three for a doctor with no
 * profile, just the NIK for a profile the clinic started without one. What
 * the clinic already set is never offered as a field, so it cannot be
 * changed from here.
 */
export function DoctorProfileCompletionForm({
  doctor,
  nextPath,
}: DoctorProfileCompletionFormProps) {
  const t = useTranslations('clinical');
  const [formError, setFormError] = useState<string | null>(null);
  const specialtiesQuery = useSpecialtiesList();
  const isCreating = doctor === undefined;
  const needsNik = isCreating || !doctor.nikMasked;
  const completeMutation = useMutation({
    mutationFn: (input: CompleteOwnDoctorProfileInput) =>
      doctorOwnProfileControllerCompleteOwnDoctorProfileV1(input),
  });
  const form = useForm({
    defaultValues: {
      fullName: doctor?.fullName ?? '',
      phoneNumber: doctor?.phoneNumber ?? '',
      specialtyId: '',
      licenseNumber: '',
      nik: '',
      title: doctor?.titleValue?.code ?? '',
      degrees: (doctor?.degreeValues ?? [])
        .map((value) => value.code)
        .filter((code): code is string => Boolean(code)),
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const trimmedTitle = value.title.trim();
      try {
        const response = await completeMutation.mutateAsync({
          fullName: value.fullName,
          phoneNumber: value.phoneNumber,
          ...(trimmedTitle.length > 0 ? { title: trimmedTitle } : {}),
          ...(value.degrees.length > 0 ? { degrees: value.degrees } : {}),
          ...(isCreating
            ? { specialtyId: value.specialtyId, licenseNumber: value.licenseNumber.trim() }
            : {}),
          ...(needsNik ? { nik: value.nik.trim() } : {}),
        });
        parseApiSuccess<DoctorDetail>(response, t('profileCompletion.saveError'));
        // The gate lives in the session hint, which only the API rewrites and
        // only when it issues a session — so re-issue it, then load the next
        // page in full so `proxy.ts` reads the new cookie.
        await refreshSession();
        window.location.assign(nextPath);
      } catch (error) {
        setFormError(notifyApiError(error, t('profileCompletion.saveError')));
      }
    },
  });

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          {t('ownProfile.editableTitle')}
        </CardTitle>
        <CardDescription>{t('profileCompletion.formDescription')}</CardDescription>
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
            validators={{ onSubmit: createDoctorSchema.shape.phoneNumber }}
          >
            {(field) => (
              <div className="space-y-1.5">
                <FormLabel
                  htmlFor={field.name}
                  className="font-heading text-xs text-slate-600"
                  required
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
                    onChange={(code) => field.handleChange(code)}
                  />
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
                </div>
              )}
            </form.Field>
          </div>

          {isCreating || needsNik ? (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <FieldDescription id={CREDENTIALS_DESCRIPTION_ID}>
                {t('profileCompletion.credentialsOnce')}
              </FieldDescription>
              {isCreating ? (
                <>
                  <form.Field
                    name="specialtyId"
                    validators={{ onSubmit: createDoctorSchema.shape.specialtyId }}
                  >
                    {(field) => (
                      <div className="space-y-1.5">
                        <FormLabel
                          htmlFor={field.name}
                          className="font-heading text-xs text-slate-600"
                          required
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
                    name="licenseNumber"
                    validators={{ onSubmit: createDoctorSchema.shape.licenseNumber }}
                  >
                    {(field) => (
                      <div className="space-y-1.5">
                        <FormLabel
                          htmlFor={field.name}
                          className="font-heading text-xs text-slate-600"
                          required
                        >
                          {t('doctors.form.license')}
                        </FormLabel>
                        <Input
                          id={field.name}
                          value={field.state.value}
                          aria-describedby={CREDENTIALS_DESCRIPTION_ID}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                          aria-invalid={field.state.meta.errors.length > 0}
                        />
                        <FieldError errors={field.state.meta.errors} />
                      </div>
                    )}
                  </form.Field>
                </>
              ) : null}
              {needsNik ? (
                <form.Field name="nik" validators={{ onSubmit: createDoctorSchema.shape.nik }}>
                  {(field) => (
                    <div className="space-y-1.5">
                      <FormLabel
                        htmlFor={field.name}
                        className="font-heading text-xs text-slate-600"
                        required
                      >
                        NIK
                      </FormLabel>
                      <Input
                        id={field.name}
                        inputMode="numeric"
                        value={field.state.value}
                        placeholder={t('doctors.form.digits16')}
                        aria-describedby={CREDENTIALS_DESCRIPTION_ID}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={field.state.meta.errors.length > 0}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </div>
                  )}
                </form.Field>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-primary-container hover:bg-primary"
                >
                  {isSubmitting ? t('ownProfile.saving') : t('profileCompletion.submit')}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
