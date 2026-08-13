'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  loginSchema,
  type AuthTokens,
  type LoginInput,
  type LoginResult,
  type MfaEnrolmentCompleted,
} from '@hms/shared-types';
import { Button, Input } from '@hms/ui';

import { authControllerLoginV1 } from '#lib/api/generated/auth/auth';
import { parseApiSuccess } from '#lib/api/response';
import { resolveLoginErrorMessage } from '#lib/auth/login-error';
import { persistLoginSession } from '#lib/auth/login-session';
import { MfaChallengeForm } from '#components/client/auth/mfa-challenge-form';
import { MfaEnrolmentForm } from '#components/client/auth/mfa-enrolment-form';
import { MfaRecoveryCodesPanel } from '#components/client/auth/mfa-recovery-codes-panel';

const ADMIN_HOME_PATH = '/admin/dashboard';

/**
 * Which phase of login is on screen (SJ-8).
 *
 * A local step machine rather than separate routes, because the `mfa_pending`
 * ticket must not outlive the attempt. Routing to `/login/mfa` would mean
 * parking the ticket somewhere a navigation can survive — a cookie, session
 * storage, a query string — and a half-authenticated credential that survives
 * a reload is one nobody remembers to clean up. Here it lives in state and
 * dies with the component.
 */
type LoginStep =
  | { name: 'CREDENTIALS' }
  | { name: 'CHALLENGE'; ticket: string }
  | { name: 'ENROLMENT'; ticket: string }
  | { name: 'RECOVERY_CODES'; recoveryCodes: string[]; tokens?: AuthTokens };

export function LoginForm() {
  const t = useTranslations('authShell.auth');
  const router = useRouter();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [step, setStep] = useState<LoginStep>({ name: 'CREDENTIALS' });
  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => authControllerLoginV1(input),
  });

  const completeSignIn = (tokens: AuthTokens): void => {
    persistLoginSession(tokens);
    router.replace(ADMIN_HOME_PATH);
  };

  const handleEnrolled = (completed: MfaEnrolmentCompleted): void => {
    // Recovery codes come back exactly once, so they are shown before the
    // redirect rather than after it — a navigation here would discard the only
    // copy that will ever exist.
    setStep({
      name: 'RECOVERY_CODES',
      recoveryCodes: completed.recoveryCodes,
      ...(completed.tokens ? { tokens: completed.tokens } : {}),
    });
  };
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
        const { data } = parseApiSuccess<LoginResult>(response, t('errors.loginFailed'));
        if (data.status === 'MFA_REQUIRED' && data.mfaTicket) {
          setStep({ name: 'CHALLENGE', ticket: data.mfaTicket.ticket });
          return;
        }
        if (data.status === 'MFA_ENROLMENT_REQUIRED' && data.mfaTicket) {
          setStep({ name: 'ENROLMENT', ticket: data.mfaTicket.ticket });
          return;
        }
        if (!data.tokens) {
          throw new Error(t('errors.loginFailed'));
        }
        completeSignIn(data.tokens);
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

  if (step.name === 'CHALLENGE') {
    return <MfaChallengeForm ticket={step.ticket} onAuthenticated={completeSignIn} />;
  }

  if (step.name === 'ENROLMENT') {
    return <MfaEnrolmentForm ticket={step.ticket} onEnrolled={handleEnrolled} />;
  }

  if (step.name === 'RECOVERY_CODES') {
    const { tokens } = step;
    return (
      <MfaRecoveryCodesPanel
        recoveryCodes={step.recoveryCodes}
        onAcknowledge={() => {
          // Enrolment reached with a ticket completes the login and returns
          // tokens; enrolment from an existing session does not, and there is
          // nowhere new to send that user.
          if (tokens) {
            completeSignIn(tokens);
            return;
          }
          setStep({ name: 'CREDENTIALS' });
        }}
      />
    );
  }

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
