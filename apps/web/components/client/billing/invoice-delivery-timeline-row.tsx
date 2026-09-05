'use client';

import type { DeliveryActionKind, DeliveryView } from '@hms/shared-types';
import { Button, Icon } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { StatusBadge } from '#components/shared/status-badge';
import { parseDeliveryError } from '#lib/document-delivery/parse-delivery-error';

type InvoiceDeliveryTimelineRowProps = {
  delivery: DeliveryView;
  canAct: boolean;
  pendingAction: DeliveryActionKind | null;
  onAction: (action: DeliveryActionKind) => void;
};

const SENT_STATUSES: readonly DeliveryView['status'][] = ['SENT', 'DELIVERED', 'OPENED'];

/**
 * Which of the three acts this row offers (P16-T25/T38): a queued send can
 * be called off, a failed one retried or withdrawn, a link that is out can be
 * killed. An attachment already in a chat offers nothing — the API would say
 * no, and a button that always says no is worse than none.
 */
function resolveActions(delivery: DeliveryView): DeliveryActionKind[] {
  if (delivery.status === 'QUEUED') return ['cancel'];
  if (delivery.status === 'FAILED') return ['retry', 'revoke'];
  if (delivery.shape === 'LINK' && SENT_STATUSES.includes(delivery.status)) return ['revoke'];
  return [];
}

export function InvoiceDeliveryTimelineRow({
  delivery,
  canAct,
  pendingAction,
  onAction,
}: InvoiceDeliveryTimelineRowProps) {
  const t = useTranslations('operations.billing.delivery');
  const tc = useTranslations('clinical.deliveryConsent');
  const format = useFormatter();
  const formatDate = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });
  const actions = canAct ? resolveActions(delivery) : [];
  const parsedError = delivery.lastError === null ? null : parseDeliveryError(delivery.lastError);

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

  function labelFor(action: DeliveryActionKind): string {
    if (pendingAction === action) {
      return action === 'retry'
        ? t('actions.retrying')
        : action === 'revoke'
          ? t('actions.revoking')
          : t('actions.cancelling');
    }
    return t(`actions.${action}`);
  }

  return (
    <li className="space-y-1.5 rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Icon name={delivery.channel === 'WHATSAPP' ? 'chat' : 'mail'} size={16} />
          <span className="font-medium">{t(`channelLabels.${delivery.channel}`)}</span>
          <span className="truncate text-slate-500">{delivery.destinationMasked}</span>
        </div>
        <StatusBadge status={delivery.status} />
      </div>
      <p className="text-xs text-slate-500">
        {t(`shapes.${delivery.shape}`)}
        {delivery.passwordSource ? ` · ${t(`passwordScheme.${delivery.passwordSource}`)}` : ''}
        {delivery.requestedBy
          ? ` · ${t('requestedBy', { email: delivery.requestedBy.email })}`
          : ''}
        {` · ${formatDate(delivery.createdAt)}`}
      </p>
      {delivery.status === 'QUEUED' && delivery.sendAt ? (
        <p className="text-xs text-slate-600">
          {t('scheduledFor', { date: formatDate(delivery.sendAt) })}
        </p>
      ) : null}
      {delivery.sentAt ? (
        <p className="text-xs text-slate-600">
          {t('sentAt', { date: formatDate(delivery.sentAt) })}
          {` · ${t('attempts', { count: delivery.attemptCount })}`}
        </p>
      ) : null}
      {delivery.openedAt && delivery.link ? (
        <p className="text-xs text-slate-600">
          {t('openedAt', { date: formatDate(delivery.openedAt), count: delivery.link.openCount })}
        </p>
      ) : null}
      {delivery.link ? (
        <p className="text-xs text-slate-500">
          {delivery.link.revokedAt
            ? t('linkRevoked', { date: formatDate(delivery.link.revokedAt) })
            : t('linkExpires', { date: formatDate(delivery.link.expiresAt) })}
        </p>
      ) : null}
      {parsedError !== null && delivery.status !== 'SENT' ? (
        <p
          className={`text-xs ${delivery.status === 'FAILED' ? 'text-rose-700' : 'text-slate-600'}`}
        >
          {describeError()}
        </p>
      ) : null}
      {actions.length > 0 ? (
        <div className="flex justify-end gap-2">
          {actions.map((action) => (
            <Button
              key={action}
              type="button"
              size="xs"
              variant={action === 'retry' ? 'default' : 'outline'}
              disabled={pendingAction !== null}
              onClick={() => onAction(action)}
            >
              {labelFor(action)}
            </Button>
          ))}
        </div>
      ) : null}
    </li>
  );
}
