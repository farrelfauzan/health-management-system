'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { SatusehatKycSessionView } from '@hms/shared-types';
import { Button, Icon, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PatientKycDialog } from '#components/client/patients/patient-kyc-dialog';
import { satusehatKycControllerStartSessionV1 } from '#lib/api/generated/satusehat/satusehat';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { resolveSatusehatKycDisabledKey } from '#lib/satusehat-kyc/resolve-satusehat-kyc-disabled-key';
import { useSatusehatKycStatus } from '#lib/satusehat-kyc/use-satusehat-kyc-status';

type PatientKycVerifyButtonProps = {
  patientId: string;
  isSatusehatEnabled: boolean;
};

/**
 * "Verifikasi SATUSEHAT" (P24-T16, FR-KYC-02): asks the API for a validation
 * URL on the operator's behalf and opens it in a dialog. The URL lives in
 * component state for as long as the dialog is open and nowhere else — no
 * query cache, no storage — because it embeds a short-lived token.
 *
 * Disabled with a visible reason rather than hidden (FR-KYC-07): the desk
 * should learn *why* it cannot verify — no NIK on their own account, keys
 * not configured — instead of wondering where the button went. Visibility is
 * CASL and the feature entitlement, both advisory; the API refuses regardless.
 */
export function PatientKycVerifyButton({
  patientId,
  isSatusehatEnabled,
}: PatientKycVerifyButtonProps) {
  const t = useTranslations('clinical.patients.kyc');
  const ability = useAbility();
  const canVerify = isSatusehatEnabled && ability.can('verify', 'SatusehatKyc');
  const statusQuery = useSatusehatKycStatus(canVerify);
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const startMutation = useMutation({
    mutationFn: () => satusehatKycControllerStartSessionV1({ patientId }),
    onSuccess: (response) => {
      const parsed = parseApiSuccess<SatusehatKycSessionView>(response, t('startError'));
      setSessionUrl(parsed.data.url);
    },
    onError: (error) => notifyApiError(error, t('startError')),
  });

  if (!canVerify) {
    return null;
  }

  const disabledReason = statusQuery.status?.disabledReason ?? null;
  const disabledMessage =
    disabledReason === null
      ? null
      : t(`disabled.${resolveSatusehatKycDisabledKey(disabledReason)}`);
  const isDisabled = statusQuery.isPending || disabledMessage !== null || startMutation.isPending;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={isDisabled}
        aria-describedby={disabledMessage ? 'patient-kyc-disabled-reason' : undefined}
        onClick={() => startMutation.mutate()}
      >
        <Icon name="verified_user" size={18} />
        {startMutation.isPending ? t('starting') : t('action')}
      </Button>
      {disabledMessage ? (
        <p id="patient-kyc-disabled-reason" className="max-w-xs text-right text-xs text-slate-600">
          {disabledMessage}
        </p>
      ) : null}
      <PatientKycDialog url={sessionUrl} onClose={() => setSessionUrl(null)} />
    </div>
  );
}
