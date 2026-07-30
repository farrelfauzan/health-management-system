'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { loginSchema, type AuthTokens, type LoginInput } from '@hms/shared-types';
import { Button, Input } from '@hms/ui';

import { authControllerLoginV1 } from '#lib/api/generated/auth/auth';
import { parseApiSuccess } from '#lib/api/response';
import { resolveLoginErrorMessage } from '#lib/auth/login-error';
import { persistLoginSession } from '#lib/auth/login-session';

const ADMIN_HOME_PATH = '/admin/dashboard';
export function LoginForm() {
  const t = useTranslations('authShell.auth');
  const router = useRouter();
  const [loginError, setLoginError] = useState<string | null>(null);
  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => authControllerLoginV1(input),
  });
  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    validators: {
      onSubmit: loginSchema,
    },
    onSubmit: async ({ value }) => {
      setLoginError(null);
      try {
        const response = await loginMutation.mutateAsync(value);
        const envelope = parseApiSuccess<AuthTokens>(response, t('errors.loginFailed'));
        persistLoginSession(envelope.data);
        router.replace(ADMIN_HOME_PATH);
      } catch (error) {
        setLoginError(
          resolveLoginErrorMessage(error, {
            invalidCredentials: t('errors.invalidCredentials'),
            loginFailed: t('errors.loginFailed'),
          }),
        );
      }
    },
  });

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      {loginError ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {loginError}
        </p>
      ) : null}

      <form.Field name="email">
        {(field) => (
          <div className="space-y-1.5">
            <label htmlFor={field.name} className="block text-xs font-medium text-slate-700">
              {t('emailLabel')}
            </label>
            <Input
              id={field.name}
              name={field.name}
              type="email"
              autoComplete="email"
              placeholder={t('emailPlaceholder')}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={field.state.meta.errors.length > 0}
              className="h-11 px-4 py-2.5 focus-visible:border-primary-container focus-visible:ring-primary-container/20"
            />
            {field.state.meta.errors.length > 0 ? (
              <p className="text-xs text-rose-600">{t('validation.email')}</p>
            ) : null}
          </div>
        )}
      </form.Field>

      <form.Field name="password">
        {(field) => (
          <div className="space-y-1.5">
            <label htmlFor={field.name} className="block text-xs font-medium text-slate-700">
              {t('passwordLabel')}
            </label>
            <Input
              id={field.name}
              name={field.name}
              type="password"
              autoComplete="current-password"
              placeholder={t('passwordPlaceholder')}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={field.state.meta.errors.length > 0}
              className="h-11 px-4 py-2.5 focus-visible:border-primary-container focus-visible:ring-primary-container/20"
            />
            {field.state.meta.errors.length > 0 ? (
              <p className="text-xs text-rose-600">{t('validation.password')}</p>
            ) : null}
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary-container text-white hover:bg-primary"
          >
            {isSubmitting ? t('submitting') : t('submit')}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
