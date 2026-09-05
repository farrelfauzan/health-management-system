'use client';

import type { DeliveryChannelReadinessView, DeliveryChannelValue } from '@hms/shared-types';
import { Badge, Button, Icon } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

type PatientDeliveryConsentRowProps = {
  readiness: DeliveryChannelReadinessView;
  canUpdate: boolean;
  isSaving: boolean;
  onChange: (channel: DeliveryChannelValue, isGranted: boolean) => void;
};

const STATE_CLASSES = {
  granted: 'bg-emerald-50 text-emerald-800',
  withdrawn: 'bg-slate-100 text-slate-700',
  optedOut: 'bg-amber-50 text-amber-900',
  notAsked: 'bg-slate-100 text-slate-600',
} as const;

function resolveState(readiness: DeliveryChannelReadinessView): keyof typeof STATE_CLASSES {
  if (readiness.consent === null) return 'notAsked';
  if (readiness.consent.isGranted) return 'granted';
  return readiness.consent.revokedReason === 'PATIENT_KEYWORD' ? 'optedOut' : 'withdrawn';
}

export function PatientDeliveryConsentRow({
  readiness,
  canUpdate,
  isSaving,
  onChange,
}: PatientDeliveryConsentRowProps) {
  const t = useTranslations('clinical.deliveryConsent');
  const format = useFormatter();
  const state = resolveState(readiness);
  const consent = readiness.consent;
  const formatDate = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });
  const isGranted = consent?.isGranted === true;
  // The patient's own opt-out is shown as its own state rather than folded
  // into "withdrawn": the counter needs to know it was the patient who said
  // stop before offering to capture again.
  const actionLabel = isGranted ? t('withdraw') : consent === null ? t('capture') : t('recapture');

  return (
    <li className="space-y-2 rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-900">{t(`channels.${readiness.channel}`)}</p>
          <Badge
            className={`rounded-full border-transparent text-[11px] font-medium ${STATE_CLASSES[state]}`}
          >
            {t(`state.${state}`)}
          </Badge>
        </div>
        {canUpdate ? (
          <Button
            type="button"
            size="sm"
            variant={isGranted ? 'ghost' : 'outline'}
            disabled={isSaving}
            onClick={() => onChange(readiness.channel, !isGranted)}
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
      {consent?.isGranted && consent.grantedAt ? (
        <p className="text-xs text-slate-500">
          {t('grantedBy', {
            email: consent.grantedBy?.email ?? '—',
            date: formatDate(consent.grantedAt),
          })}
          {consent.noticeVersion
            ? ` · ${t('noticeVersion', { version: consent.noticeVersion.version })}`
            : ''}
        </p>
      ) : null}
      {consent && !consent.isGranted && consent.revokedAt ? (
        <p className="text-xs text-slate-500">
          {t('revokedAt', { date: formatDate(consent.revokedAt) })}
        </p>
      ) : null}
      <p
        className={`flex items-start gap-1.5 text-xs ${
          readiness.isDeliveryAllowed ? 'text-emerald-700' : 'text-amber-800'
        }`}
      >
        <Icon name={readiness.isDeliveryAllowed ? 'check_circle' : 'info'} size={14} />
        <span>
          {readiness.refusalReason === null ? t('ready') : t(`refusals.${readiness.refusalReason}`)}
        </span>
      </p>
    </li>
  );
}
