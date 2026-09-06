'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Icon, toast, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { satusehatLinkControllerLinkPatientV1 } from '#lib/api/generated/satusehat/satusehat';
import { resolveSatusehatLinkErrorKey } from '#lib/integrations/resolve-satusehat-link-error-key';
import { invalidatePatientQueries } from '#lib/patients/invalidate-patient-queries';

type PatientSatusehatLinkButtonProps = {
  patientId: string;
  hasNik: boolean;
  isLinked: boolean;
  isSatusehatEnabled: boolean;
};

/**
 * Resolves the patient's IHS number now, rather than discovering hours later
 * that the worker could not. The endpoint has existed since P7-T03 and nothing
 * called it: linking only happened inside the submission worker, so the first
 * signal that a NIK was unrecognised was a FAILED row long after the patient
 * had gone home.
 *
 * Visibility is CASL and the feature entitlement — both advisory. The API's
 * `PermissionsGuard` and `FeatureGuard` are what actually refuse the call.
 */
export function PatientSatusehatLinkButton({
  patientId,
  hasNik,
  isLinked,
  isSatusehatEnabled,
}: PatientSatusehatLinkButtonProps) {
  const t = useTranslations('clinical.patients');
  const tLinkError = useTranslations('clinical.patients.linkErrors');
  const ability = useAbility();
  const queryClient = useQueryClient();
  const linkMutation = useMutation({
    mutationFn: () => satusehatLinkControllerLinkPatientV1(patientId),
    onSuccess: async () => {
      await invalidatePatientQueries(queryClient);
      toast.success(t('linkSuccess'));
    },
    onError: (error) => toast.error(tLinkError(resolveSatusehatLinkErrorKey(error))),
  });

  if (!isSatusehatEnabled || !ability.can('link', 'Satusehat') || isLinked) {
    return null;
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={!hasNik || linkMutation.isPending}
      title={hasNik ? undefined : tLinkError('missingNik')}
      onClick={() => linkMutation.mutate()}
    >
      <Icon name="link" size={16} />
      {linkMutation.isPending ? t('linking') : t('linkToSatusehat')}
    </Button>
  );
}
