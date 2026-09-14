'use client';

import type { SatusehatLocationRegistrationResultView } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type SatusehatLocationOutcomeListProps = {
  result: SatusehatLocationRegistrationResultView;
};

/**
 * What the last registration did (P24-T06): how many rows were processed,
 * whether SATUSEHAT stopped the batch, and each row that failed or was blocked
 * with the reason — SATUSEHAT's own words on a rejection.
 */
export function SatusehatLocationOutcomeList({ result }: SatusehatLocationOutcomeListProps) {
  const t = useTranslations('operations.integrations.satusehatLocations');
  const notableOutcomes = result.outcomes.filter(
    (outcome) => outcome.outcome === 'FAILED' || outcome.outcome === 'BLOCKED',
  );
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <p className="text-slate-700">
        {t('summary', { done: result.processedCount, total: result.outcomes.length })}
      </p>
      {result.stoppedEarly ? <p className="text-amber-700">{t('stoppedEarly')}</p> : null}
      {notableOutcomes.length > 0 ? (
        <ul className="space-y-1">
          {notableOutcomes.map((outcome) => (
            <li key={`${outcome.kind}:${outcome.id}`} className="text-xs text-slate-600">
              <span className="font-medium text-slate-800">{outcome.name}</span> —{' '}
              {t(`outcome.${outcome.outcome}`)}: {outcome.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
