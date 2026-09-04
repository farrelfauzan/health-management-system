'use client';

import type { DeliveryChannelValue } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle, Icon, Skeleton, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PatientDeliveryConsentRow } from '#components/client/patients/patient-delivery-consent-row';
import { notifyApiError } from '#lib/api/notify-api-error';
import { usePatientDeliveryConsents } from '#lib/document-delivery/use-patient-delivery-consents';
import { useUpsertPatientDeliveryConsent } from '#lib/document-delivery/use-upsert-patient-delivery-consent';

type PatientDeliveryConsentCardProps = {
  patientId: string;
};

export function PatientDeliveryConsentCard({ patientId }: PatientDeliveryConsentCardProps) {
  const t = useTranslations('clinical.deliveryConsent');
  const ability = useAbility();
  // Visibility only: the API's guard is what refuses the write.
  const canUpdate = ability.can('update', 'Patient');
  const query = usePatientDeliveryConsents(patientId);
  const upsertMutation = useUpsertPatientDeliveryConsent(patientId, t('updateError'));

  async function handleChange(channel: DeliveryChannelValue, isGranted: boolean): Promise<void> {
    try {
      await upsertMutation.mutateAsync({ channel, isGranted });
    } catch (error) {
      notifyApiError(error, t('updateError'));
    }
  }

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base">
          <Icon name="send" size={18} />
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {query.isError ? (
          <p role="alert" className="text-sm text-rose-700">
            {t('loadError')}
          </p>
        ) : null}
        {query.consents ? (
          <ul className="space-y-2">
            {query.consents.channels.map((readiness) => (
              <PatientDeliveryConsentRow
                key={readiness.channel}
                readiness={readiness}
                canUpdate={canUpdate}
                isSaving={upsertMutation.isPending}
                onChange={handleChange}
              />
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-slate-500">{t('description')}</p>
      </CardContent>
    </Card>
  );
}
