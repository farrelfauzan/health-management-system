'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nikSchema, type OwnAccountRecord, type UpdateOwnAccountNikInput } from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FieldError } from '#components/client/shared/field-error';
import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import {
  getOwnAccountControllerGetOwnAccountV1QueryKey,
  ownAccountControllerUpdateOwnAccountNikV1,
} from '#lib/api/generated/account/account';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';

const NIK_LENGTH = 16;
const MASKED_GROUPS = 3;

type OwnAccountNikFormProps = {
  /** The last four digits on file, or null when the account has no NIK yet. */
  nikLast4: string | null;
};

/**
 * The operator's NIK (P24-T15, D-039): the number SATUSEHAT's KYC requires of
 * whoever is at the desk. Shown masked to its last four digits — the API
 * never returns more — with one field to add or replace it. The field is
 * empty even when a NIK is on file: a stored NIK is never echoed back, and a
 * replacement is typed in full.
 */
export function OwnAccountNikForm({ nikLast4 }: OwnAccountNikFormProps) {
  const t = useTranslations('operations.account.nik');
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (input: UpdateOwnAccountNikInput) =>
      ownAccountControllerUpdateOwnAccountNikV1(input),
  });
  const maskedNik = nikLast4 ? `${'••••'.repeat(MASKED_GROUPS)} ${nikLast4}` : null;
  const form = useForm({
    defaultValues: { nik: '' },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        const response = await saveMutation.mutateAsync({ nik: value.nik });
        parseApiSuccess<OwnAccountRecord>(response, t('saveError'));
        await queryClient.invalidateQueries({
          queryKey: getOwnAccountControllerGetOwnAccountV1QueryKey(),
        });
        toast.success(t('saved'));
      } catch (error) {
        setFormError(notifyApiError(error, t('saveError')));
      }
    },
  });
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
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
          <p className="text-sm text-slate-700" data-testid="own-account-nik-current">
            {maskedNik ? t('current', { masked: maskedNik }) : t('none')}
          </p>
          <form.Field
            name="nik"
            validators={{
              onSubmit: ({ value }) =>
                nikSchema.safeParse(value).success ? undefined : t('invalid'),
            }}
          >
            {(field) => (
              <div className="space-y-1.5">
                <FormLabel
                  htmlFor={field.name}
                  className="font-heading text-xs text-slate-600"
                  required
                >
                  {maskedNik ? t('replaceLabel') : t('addLabel')}
                </FormLabel>
                <Input
                  id={field.name}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={NIK_LENGTH}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>
          <div className="flex justify-end">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-primary-container hover:bg-primary"
                >
                  {isSubmitting ? t('saving') : t('save')}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
