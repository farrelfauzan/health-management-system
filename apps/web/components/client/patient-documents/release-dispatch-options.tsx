'use client';

import type { DeliveryChannelReadinessView, DeliveryChannelValue } from '@hms/shared-types';
import { Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ReleaseDispatchChannelOption } from '#components/client/patient-documents/release-dispatch-channel-option';

type ReleaseDispatchOptionsProps = {
  readiness: readonly DeliveryChannelReadinessView[];
  isPending: boolean;
  isError: boolean;
  isDispatchByDefault: boolean;
  selectedChannels: readonly DeliveryChannelValue[];
  isDisabled: boolean;
  onToggleChannel: (channel: DeliveryChannelValue, isChecked: boolean) => void;
};

/**
 * The dispatch half of the release dialog (`P16-T40`, FR-E4-24/27/28):
 * one checkbox per channel, pre-judged from the patient's readiness view
 * with the same reason sentence the patient record shows, pre-ticked when
 * the document's category dispatches by default.
 */
export function ReleaseDispatchOptions({
  readiness,
  isPending,
  isError,
  isDispatchByDefault,
  selectedChannels,
  isDisabled,
  onToggleChannel,
}: ReleaseDispatchOptionsProps) {
  const t = useTranslations('clinical.patients.documents.release');
  const tc = useTranslations('clinical.deliveryConsent');
  const hasAvailableChannel = readiness.some((entry) => entry.isDeliveryAllowed);

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-medium text-slate-900">{t('dispatchTitle')}</p>
      <p className="text-xs text-slate-500">{t('dispatchDescription')}</p>
      {isPending ? <Skeleton className="h-16 w-full" /> : null}
      {isError ? (
        <p role="alert" className="text-xs text-rose-700">
          {tc('loadError')}
        </p>
      ) : null}
      {readiness.length > 0 ? (
        <ul className="space-y-2">
          {readiness.map((entry) => (
            <ReleaseDispatchChannelOption
              key={entry.channel}
              readiness={entry}
              isChecked={selectedChannels.includes(entry.channel)}
              isDisabled={isDisabled}
              onCheckedChange={(isChecked) => onToggleChannel(entry.channel, isChecked)}
            />
          ))}
        </ul>
      ) : null}
      {!isPending && !isError && !hasAvailableChannel ? (
        <p className="text-xs text-amber-800">{t('dispatchUnavailable')}</p>
      ) : null}
      {isDispatchByDefault && hasAvailableChannel ? (
        <p className="text-xs text-slate-500">{t('dispatchDefaultHint')}</p>
      ) : null}
      <p className="text-xs text-slate-500">{t('captionNote')}</p>
    </div>
  );
}
