'use client';

import type { DeliveryChannelReadinessView } from '@hms/shared-types';
import { Checkbox, Icon, Label } from '@hms/ui';
import { useTranslations } from 'next-intl';

type SendInvoiceChannelOptionProps = {
  readiness: DeliveryChannelReadinessView;
  isChecked: boolean;
  isDisabled: boolean;
  onCheckedChange: (isChecked: boolean) => void;
};

/**
 * One channel in the send dialog (P16-T27, US-E4-02): a checkbox that is
 * only enabled when the patient can receive on it right now, with the same
 * reason sentence the patient record shows when they cannot — so the
 * cashier is sent to the right next step (capture consent, run the OTP flow,
 * complete the email) rather than told "unavailable".
 */
export function SendInvoiceChannelOption({
  readiness,
  isChecked,
  isDisabled,
  onCheckedChange,
}: SendInvoiceChannelOptionProps) {
  const t = useTranslations('operations.billing.delivery');
  const tc = useTranslations('clinical.deliveryConsent');
  const id = `send-invoice-channel-${readiness.channel.toLowerCase()}`;
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
          {t(`channelLabels.${readiness.channel}`)}
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
