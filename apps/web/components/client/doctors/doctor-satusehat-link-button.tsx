'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Icon, toast, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DoctorSatusehatIhsLinkDialog } from '#components/client/doctors/doctor-satusehat-ihs-link-dialog';
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
 *
 * When the NIK lookup is refused because SATUSEHAT holds several records for it
 * (409), or none (404), the card offers entering the IHS number by hand
 * (P21-T08). That is the only way such a doctor can ever report an encounter.
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
  const [isManualLinkOffered, setIsManualLinkOffered] = useState<boolean>(false);
  const [isManualLinkOpen, setIsManualLinkOpen] = useState<boolean>(false);
  const linkMutation = useMutation({
    mutationFn: () => satusehatLinkControllerLinkDoctorV1(doctorId),
    onSuccess: async () => {
      await invalidateDoctorQueries(queryClient);
      toast.success(t('linkSuccess'));
    },
    onError: (error) => {
      const errorKey = resolveSatusehatLinkErrorKey(error);
      if (errorKey === 'ambiguous' || errorKey === 'notFound') {
        setIsManualLinkOffered(true);
      }
      toast.error(tLinkError(errorKey));
    },
  });

  if (!isSatusehatEnabled || !ability.can('link', 'Satusehat') || isLinked) {
    return null;
  }

  return (
    <>
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
      {isManualLinkOffered ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setIsManualLinkOpen(true)}>
          <Icon name="edit" size={16} />
          {t('manualLink.open')}
        </Button>
      ) : null}
      <DoctorSatusehatIhsLinkDialog
        doctorId={doctorId}
        open={isManualLinkOpen}
        onOpenChange={setIsManualLinkOpen}
      />
    </>
  );
}
