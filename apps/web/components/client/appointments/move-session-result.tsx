'use client';

import type { AppointmentSessionRescheduleResult } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';

type MoveSessionResultProps = {
  result: AppointmentSessionRescheduleResult;
};

/**
 * What a move did (P28-T05). The patients who stayed behind are a worklist
 * for the front desk, so they are listed by name with the reason rather than
 * folded into a toast that disappears.
 */
export function MoveSessionResult({ result }: MoveSessionResultProps) {
  const t = useTranslations('operations.appointments.sessionChange');
  return (
    <div className="space-y-3">
      <InlineNotice tone="success">
        {t('resultMoved', {
          count: result.movedCount,
          sessionDate: result.target.sessionDate,
          startTime: result.target.startTime,
          endTime: result.target.endTime,
        })}
      </InlineNotice>
      {result.blocked.length > 0 ? (
        <div className="space-y-2">
          <p className="font-heading text-sm font-semibold text-slate-900">
            {t('resultBlockedTitle')}
          </p>
          <p className="text-xs text-slate-500">{t('resultBlockedHint')}</p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {result.blocked.map((entry) => (
              <li key={entry.appointmentId} className="px-3 py-2 text-sm">
                <span className="font-medium text-slate-900">{entry.subject.fullName}</span>
                <span className="block text-xs text-slate-500">
                  {entry.reason === 'REGISTERED' ? t('blockedRegistered') : t('blockedBpjs')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
