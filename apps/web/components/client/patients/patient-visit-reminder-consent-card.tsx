'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Icon,
  Skeleton,
  useAbility,
} from '@hms/ui';
import type { VisitReminderConsentView } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { notifyApiError } from '#lib/api/notify-api-error';
import { useUpsertVisitReminderConsent } from '#lib/visit-reminder/use-upsert-visit-reminder-consent';
import { useVisitReminderConsent } from '#lib/visit-reminder/use-visit-reminder-consent';

type PatientVisitReminderConsentCardProps = {
  patientId: string;
};

const STATE_CLASSES = {
  granted: 'bg-emerald-50 text-emerald-800',
  withdrawn: 'bg-slate-100 text-slate-700',
  optedOut: 'bg-amber-50 text-amber-900',
  notAsked: 'bg-slate-100 text-slate-600',
} as const;

function resolveState(consent: VisitReminderConsentView | null): keyof typeof STATE_CLASSES {
  if (consent === null) return 'notAsked';
  if (consent.isGranted) return 'granted';
  return consent.revokedReason === 'PATIENT_KEYWORD' ? 'optedOut' : 'withdrawn';
}

/**
 * The visit-reminder consent toggle on the patient's contact column
 * (P25-T17, D-042). Its own card next to delivery consent, never folded into
 * it: the two are separate consents for separate purposes.
 */
export function PatientVisitReminderConsentCard({
  patientId,
}: PatientVisitReminderConsentCardProps) {
  const t = useTranslations('maternalCare.visitReminderConsent');
  const format = useFormatter();
  const ability = useAbility();
  // Visibility only: the API's guard is what refuses the write.
  const canUpdate = ability.can('update', 'Patient');
  const query = useVisitReminderConsent(patientId);
  const upsertMutation = useUpsertVisitReminderConsent(patientId, t('updateError'));
  const consent = query.consent;
  const state = resolveState(consent);
  const isGranted = consent?.isGranted === true;
  const actionLabel = isGranted ? t('withdraw') : consent === null ? t('capture') : t('recapture');
  const formatDate = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });

  async function handleToggle(): Promise<void> {
    try {
      await upsertMutation.mutateAsync({ isGranted: !isGranted });
    } catch (error) {
      notifyApiError(error, t('updateError'));
    }
  }

  return (
    <Card className="min-w-0 rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base">
          <Icon name="notifications" size={18} />
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isPending ? <Skeleton className="h-16 w-full" /> : null}
        {query.isError ? <InlineNotice tone="error">{t('loadError')}</InlineNotice> : null}
        {query.isSuccess ? (
          <div className="min-w-0 space-y-2 rounded-lg border border-slate-200 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge
                className={`rounded-full border-transparent text-[11px] font-medium ${STATE_CLASSES[state]}`}
              >
                {t(`state.${state}`)}
              </Badge>
              {canUpdate ? (
                <Button
                  type="button"
                  size="sm"
                  variant={isGranted ? 'ghost' : 'outline'}
                  className="ml-auto h-auto min-h-8 max-w-full whitespace-normal"
                  disabled={upsertMutation.isPending}
                  onClick={() => void handleToggle()}
                >
                  {actionLabel}
                </Button>
              ) : null}
            </div>
            {consent?.isGranted && consent.grantedAt ? (
              <p className="text-xs text-slate-500">
                {t('grantedBy', {
                  name: consent.grantedBy?.name ?? '—',
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
          </div>
        ) : null}
        <p className="text-xs text-slate-500">{t('description')}</p>
      </CardContent>
    </Card>
  );
}
