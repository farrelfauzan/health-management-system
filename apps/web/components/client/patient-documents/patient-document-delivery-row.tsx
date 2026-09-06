'use client';

import type { DeliveryView } from '@hms/shared-types';
import { Icon } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { StatusBadge } from '#components/shared/status-badge';
import { parseDeliveryError } from '#lib/document-delivery/parse-delivery-error';

type PatientDocumentDeliveryRowProps = {
  delivery: DeliveryView;
};

/**
 * One send of a clinical file (`P16-T40`, FR-E4-14): channel, masked
 * destination, where it stands, and — on a failure — the same sentence the
 * invoice timeline shows for the same code. Read-only: retry, revoke and
 * cancel are cashier verbs, and a clinician re-sends by releasing again.
 */
export function PatientDocumentDeliveryRow({ delivery }: PatientDocumentDeliveryRowProps) {
  const t = useTranslations('clinical.patients.documents.deliveries');
  const tc = useTranslations('clinical.deliveryConsent');
  const format = useFormatter();
  const parsedError = delivery.lastError === null ? null : parseDeliveryError(delivery.lastError);
  const formatDate = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });

  function describeError(): string {
    if (parsedError === null) return '';
    if (parsedError.code === 'DELIVERY_REFUSED_AT_SEND_TIME') {
      return t('errors.DELIVERY_REFUSED_AT_SEND_TIME', {
        reason: parsedError.refusalReason
          ? tc(`refusals.${parsedError.refusalReason}`)
          : parsedError.raw,
      });
    }
    if (parsedError.code !== null) return t(`errors.${parsedError.code}`);
    return t('errors.unknown', { code: parsedError.raw });
  }

  return (
    <li className="space-y-1 rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <Icon name={delivery.channel === 'WHATSAPP' ? 'chat' : 'mail'} size={16} />
          {tc(`channels.${delivery.channel}`)}
          <span className="font-mono text-xs text-slate-500">{delivery.destinationMasked}</span>
        </span>
        <StatusBadge status={delivery.status} label={t(`statuses.${delivery.status}`)} />
      </div>
      <p className="text-xs text-slate-500">
        {delivery.sentAt
          ? t('sentAt', { date: formatDate(delivery.sentAt) })
          : t('queuedAt', { date: formatDate(delivery.createdAt) })}
        {delivery.requestedBy
          ? ` · ${t('requestedBy', { email: delivery.requestedBy.email })}`
          : ''}
        {delivery.attemptCount > 0 ? ` · ${t('attempts', { count: delivery.attemptCount })}` : ''}
      </p>
      {parsedError !== null ? <p className="text-xs text-rose-700">{describeError()}</p> : null}
    </li>
  );
}
