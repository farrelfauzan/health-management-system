'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Icon, toast, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { satusehatLinkControllerLinkDoctorV1 } from '#lib/api/generated/satusehat/satusehat';
import { invalidateDoctorQueries } from '#lib/doctors/invalidate-doctor-queries';
import { resolveSatusehatLinkErrorKey } from '#lib/integrations/resolve-satusehat-link-error-key';

type DoctorSatusehatLinkButtonProps = {
  doctorId: string;
  hasNik: boolean;
  isLinked: boolean;
  isSatusehatEnabled: boolean;
};

/**
 * The practitioner half of the same manual link. A doctor's practitioner id is
 * plaintext by design (P7-T03), so the refreshed card shows the resolved value
 * rather than only the fact that it exists.
 */
export function DoctorSatusehatLinkButton({
  doctorId,
  hasNik,
  isLinked,
  isSatusehatEnabled,
}: DoctorSatusehatLinkButtonProps) {
  const t = useTranslations('clinical.doctors');
  const tLinkError = useTranslations('clinical.doctors.linkErrors');
  const ability = useAbility();
  const queryClient = useQueryClient();
  const linkMutation = useMutation({
    mutationFn: () => satusehatLinkControllerLinkDoctorV1(doctorId),
    onSuccess: async () => {
      await invalidateDoctorQueries(queryClient);
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
