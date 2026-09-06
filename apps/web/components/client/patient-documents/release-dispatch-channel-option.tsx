'use client';

import type { DeliveryChannelReadinessView } from '@hms/shared-types';
import { Checkbox, Icon, Label } from '@hms/ui';
import { useTranslations } from 'next-intl';

type ReleaseDispatchChannelOptionProps = {
  readiness: DeliveryChannelReadinessView;
  isChecked: boolean;
  isDisabled: boolean;
  onCheckedChange: (isChecked: boolean) => void;
};

/**
 * One channel in the release dialog (`P16-T40`): a checkbox enabled only
 * when the patient can receive on it right now, with the same reason
 * sentence the patient record shows when they cannot. The clinical twin of
 * the invoice send option — same rules, phrased from the clinical catalog
 * so the encounter and patient screens need no billing copy.
 */
export function ReleaseDispatchChannelOption({
  readiness,
  isChecked,
  isDisabled,
  onCheckedChange,
}: ReleaseDispatchChannelOptionProps) {
  const tc = useTranslations('clinical.deliveryConsent');
  const id = `release-dispatch-channel-${readiness.channel.toLowerCase()}`;
  const isBlocked = !readiness.isDeliveryAllowed;

  return (
    <li className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <Checkbox
        id={id}
        checked={isChecked}
        disabled={isDisabled || isBlocked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
          <Icon name={readiness.channel === 'WHATSAPP' ? 'chat' : 'mail'} size={16} />
          {tc(`channels.${readiness.channel}`)}
        </Label>
        <p
          className={`mt-1 flex items-start gap-1.5 text-xs ${
            isBlocked ? 'text-amber-800' : 'text-emerald-700'
          }`}
        >
          <Icon name={isBlocked ? 'info' : 'check_circle'} size={14} />
          <span>
            {readiness.refusalReason === null
              ? tc('ready')
              : tc(`refusals.${readiness.refusalReason}`)}
          </span>
        </p>
      </div>
    </li>
  );
}
