'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import {
  acceptUserInvitationSchema,
  type UserInvitationAcceptedView,
  type UserInvitationPreview,
} from '@hms/shared-types';
import { Button, Card, CardContent, Input } from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

import { FieldError } from '#components/client/shared/field-error';
import {
  getUserInvitationPublicControllerPreviewInvitationV1QueryKey,
  userInvitationPublicControllerAcceptInvitationV1,
  userInvitationPublicControllerPreviewInvitationV1,
} from '#lib/api/generated/admin-management/admin-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { useApiQuery } from '#lib/api/use-api-query';
import { resolveInvitationLinkMessageKey } from '#lib/user-invitations/resolve-invitation-link-message-key';

const LOGIN_PATH = '/login';

type AcceptInvitationCardProps = {
  token: string;
};

/**
 * The invitee's landing page (IMP-23), reached from the emailed link with no
 * session of any kind.
 *
 * The token is validated before the form renders rather than on submit. A
 * person who followed a link that has expired or been withdrawn should be told
 * so immediately — making them choose a password first and then rejecting it
 * is the same information delivered at the most annoying possible moment.
 */
export function AcceptInvitationCard({ token }: AcceptInvitationCardProps) {
  const t = useTranslations('authShell.invite');
  const format = useFormatter();
  const [formError, setFormError] = useState<string | null>(null);
  const [acceptedEmail, setAcceptedEmail] = useState<string | null>(null);
  const previewQuery = useApiQuery<UserInvitationPreview>({
    queryKey: getUserInvitationPublicControllerPreviewInvitationV1QueryKey(token),
    queryFn: (signal) => userInvitationPublicControllerPreviewInvitationV1(token, signal),
    errorMessage: t('invalidLink'),
    options: { retry: false },
  });
  const acceptMutation = useMutation({
    mutationFn: (password: string) =>
      userInvitationPublicControllerAcceptInvitationV1(token, { password }),
  });
  const form = useForm({
    defaultValues: { password: '', confirmPassword: '' },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        const response = await acceptMutation.mutateAsync(value.password);
        const envelope = parseApiSuccess<UserInvitationAcceptedView>(response, t('acceptError'));
        setAcceptedEmail(envelope.data.email);
      } catch (error) {
        const linkMessageKey = resolveInvitationLinkMessageKey(error);
        setFormError(
          linkMessageKey ? t(linkMessageKey) : resolveApiErrorMessage(error, t('acceptError')),
        );
      }
    },
  });

  if (acceptedEmail) {
    return (
      <Card className="border-slate-200 shadow-none">
        <CardContent className="space-y-4 p-6">
          <h1 className="font-heading text-lg text-slate-900">{t('successTitle')}</h1>
          <p className="text-sm text-slate-600">{t('successBody', { email: acceptedEmail })}</p>
          <Button asChild className="bg-primary-container hover:bg-primary">
            <Link href={LOGIN_PATH}>{t('goToLogin')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (previewQuery.isPending) {
    return (
      <Card className="border-slate-200 shadow-none">
        <CardContent className="p-6 text-sm text-slate-500">{t('checking')}</CardContent>
      </Card>
    );
  }

  if (previewQuery.isError || !previewQuery.data) {
    return (
      <Card className="border-rose-200 shadow-none">
        <CardContent className="space-y-4 p-6">
          <h1 className="font-heading text-lg text-slate-900">{t('invalidTitle')}</h1>
          <p className="text-sm text-slate-600">
            {t(resolveInvitationLinkMessageKey(previewQuery.error) ?? 'invalidLink')}
          </p>
          <p className="text-sm text-slate-600">{t('invalidHelp')}</p>
          <Button asChild variant="outline">
            <Link href={LOGIN_PATH}>{t('goToLogin')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 shadow-none">
      <CardContent className="space-y-5 p-6">
        <div className="space-y-1">
          <h1 className="font-heading text-lg text-slate-900">{t('title')}</h1>
          <p className="text-sm text-slate-600">
            {t('subtitle', { email: previewQuery.data.email })}
          </p>
          <p className="text-xs text-slate-500">
            {t('expiresAt', {
              date: format.dateTime(new Date(previewQuery.data.expiresAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}
          </p>
        </div>

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

          <form.Field
            name="password"
            validators={{ onSubmit: acceptUserInvitationSchema.shape.password }}
          >
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor={field.name}
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  {t('passwordLabel')}
                </label>
                <Input
                  id={field.name}
                  type="password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.values.password}>
            {(password) => (
              <form.Field
                name="confirmPassword"
                validators={{
                  onSubmit: ({ value }) => (value === password ? undefined : t('passwordMismatch')),
                }}
              >
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={field.name}
                      className="block font-heading text-xs font-medium text-slate-600"
                    >
                      {t('confirmPasswordLabel')}
                    </label>
                    <Input
                      id={field.name}
                      type="password"
                      autoComplete="new-password"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </div>
                )}
              </form.Field>
            )}
          </form.Subscribe>

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary-container hover:bg-primary"
              >
                {isSubmitting ? t('submitting') : t('submit')}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}
