'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { AuthTokens } from '@hms/shared-types';
import { Button, Input } from '@hms/ui';

import { authControllerAnswerMfaChallengeV1 } from '#lib/api/generated/auth/auth';
import { parseApiSuccess } from '#lib/api/response';
import { mfaTicketStore } from '#lib/auth/mfa-ticket-store';
import { resolveMfaErrorMessage } from '#lib/auth/mfa-error';

type MfaChallengeFormProps = {
  ticket: string;
  onAuthenticated: (tokens: AuthTokens) => void;
};

/**
 * The second phase of a two-phase login (SJ-8).
 *
 * One factor at a time: the recovery-code field only appears when the user
 * asks for it, and submitting sends exactly one of the two. The API rejects a
 * body carrying both rather than choosing which to spend, and spending a
 * recovery code somebody did not mean to burn is not a decision to make for
 * them.
 */
export function MfaChallengeForm({ ticket, onAuthenticated }: MfaChallengeFormProps) {
  const t = useTranslations('authShell.auth.mfa.challenge');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [isUsingRecoveryCode, setIsUsingRecoveryCode] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);

  // Held only while this form is on screen, so the ticket cannot outlive the
  // attempt it belongs to.
  useEffect(() => {
    mfaTicketStore.set(ticket);
    return () => mfaTicketStore.set(null);
  }, [ticket]);

  const challengeMutation = useMutation({
    mutationFn: () =>
      authControllerAnswerMfaChallengeV1(isUsingRecoveryCode ? { recoveryCode } : { code }),
  });

  const submitChallenge = async (): Promise<void> => {
    setChallengeError(null);
    try {
      const response = await challengeMutation.mutateAsync();
      const envelope = parseApiSuccess<AuthTokens>(response, t('errors.failed'));
      onAuthenticated(envelope.data);
    } catch (error) {
      setChallengeError(
        resolveMfaErrorMessage(error, {
          rejected: t('errors.rejected'),
          expired: t('errors.expired'),
          throttled: t('errors.throttled'),
          failed: t('errors.failed'),
        }),
      );
    }
  };

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submitChallenge();
      }}
    >
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">
          {t('title')}
        </h1>
        <p className="text-sm text-slate-500">
          {isUsingRecoveryCode ? t('recoverySubtitle') : t('subtitle')}
        </p>
      </div>

      {challengeError ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {challengeError}
        </p>
      ) : null}

      {isUsingRecoveryCode ? (
        <div className="space-y-1.5">
          <label htmlFor="mfa-recovery-code" className="block text-xs font-medium text-slate-700">
            {t('recoveryCodeLabel')}
          </label>
          <Input
            id="mfa-recovery-code"
            name="recoveryCode"
            type="text"
            autoComplete="one-time-code"
            spellCheck={false}
            placeholder={t('recoveryCodePlaceholder')}
            value={recoveryCode}
            onChange={(event) => setRecoveryCode(event.target.value)}
            className="h-11 px-4 py-2.5 font-mono"
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor="mfa-code" className="block text-xs font-medium text-slate-700">
            {t('codeLabel')}
          </label>
          <Input
            id="mfa-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={7}
            placeholder={t('codePlaceholder')}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="h-11 px-4 py-2.5 font-mono tracking-[0.3em]"
          />
        </div>
      )}

      <Button
        type="submit"
        disabled={challengeMutation.isPending}
        className="w-full bg-primary-container text-white hover:bg-primary"
      >
        {challengeMutation.isPending ? t('submitting') : t('submit')}
      </Button>

      <button
        type="button"
        className="w-full text-xs text-slate-500 underline-offset-4 hover:underline"
        onClick={() => {
          setChallengeError(null);
          setIsUsingRecoveryCode(!isUsingRecoveryCode);
        }}
      >
        {isUsingRecoveryCode ? t('useAuthenticator') : t('useRecoveryCode')}
      </button>
    </form>
  );
}
