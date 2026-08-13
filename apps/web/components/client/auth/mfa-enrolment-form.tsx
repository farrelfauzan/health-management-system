'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { MfaEnrolment, MfaEnrolmentCompleted } from '@hms/shared-types';
import { Button, Input } from '@hms/ui';

import {
  authControllerBeginMfaEnrolmentV1,
  authControllerVerifyMfaEnrolmentV1,
} from '#lib/api/generated/auth/auth';
import { parseApiSuccess } from '#lib/api/response';
import { mfaTicketStore } from '#lib/auth/mfa-ticket-store';
import { resolveMfaErrorMessage } from '#lib/auth/mfa-error';
import { OtpauthQrCode } from '#components/client/auth/otpauth-qr-code';

type MfaEnrolmentFormProps = {
  ticket: string;
  onEnrolled: (completed: MfaEnrolmentCompleted) => void;
};

/**
 * Forced enrolment for a privileged account whose login was refused for want
 * of a second factor (SJ-8).
 *
 * The secret is shown in text beside the QR code, not hidden behind it. The
 * QR contains the same value either way, so concealing it buys nothing and
 * costs everything for anyone using a screen reader or a desktop
 * authenticator that takes typed input.
 */
export function MfaEnrolmentForm({ ticket, onEnrolled }: MfaEnrolmentFormProps) {
  const t = useTranslations('authShell.auth.mfa.enrolment');
  const [enrolment, setEnrolment] = useState<MfaEnrolment | null>(null);
  const [code, setCode] = useState('');
  const [enrolmentError, setEnrolmentError] = useState<string | null>(null);

  const verifyMutation = useMutation({
    mutationFn: () => authControllerVerifyMfaEnrolmentV1({ code }),
  });

  useEffect(() => {
    // Set before the first call and dropped on unmount, so the ticket cannot
    // outlive the enrolment it belongs to.
    mfaTicketStore.set(ticket);
    let isCurrent = true;
    void authControllerBeginMfaEnrolmentV1()
      .then((response) => {
        if (isCurrent) {
          setEnrolment(parseApiSuccess<MfaEnrolment>(response, t('errors.failed')).data);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setEnrolmentError(
            resolveMfaErrorMessage(error, {
              rejected: t('errors.failed'),
              expired: t('errors.expired'),
              throttled: t('errors.throttled'),
              failed: t('errors.failed'),
            }),
          );
        }
      });
    return () => {
      isCurrent = false;
      mfaTicketStore.set(null);
    };
  }, [ticket, t]);

  const submitCode = async (): Promise<void> => {
    setEnrolmentError(null);
    try {
      const response = await verifyMutation.mutateAsync();
      onEnrolled(parseApiSuccess<MfaEnrolmentCompleted>(response, t('errors.failed')).data);
    } catch (error) {
      setEnrolmentError(
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
        void submitCode();
      }}
    >
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">
          {t('title')}
        </h1>
        <p className="text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      {enrolmentError ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {enrolmentError}
        </p>
      ) : null}

      {enrolment ? (
        <div className="space-y-3">
          <div className="flex justify-center">
            <OtpauthQrCode otpauthUri={enrolment.otpauthUri} alt={t('qrAlt')} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">{t('manualEntry')}</p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm break-all text-slate-800">
              {enrolment.secret}
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="mfa-enrolment-code" className="block text-xs font-medium text-slate-700">
          {t('codeLabel')}
        </label>
        <Input
          id="mfa-enrolment-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder={t('codePlaceholder')}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="h-11 px-4 py-2.5 font-mono tracking-[0.3em]"
        />
      </div>

      <Button
        type="submit"
        disabled={verifyMutation.isPending || !enrolment}
        className="w-full bg-primary-container text-white hover:bg-primary"
      >
        {verifyMutation.isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
