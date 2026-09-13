'use client';

import type { SatusehatRecordLine } from '@hms/shared-types';
import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

type EncounterSatusehatRecordLineRowProps = {
  line: SatusehatRecordLine;
};

const OUTCOME_ICONS: Record<SatusehatRecordLine['outcome'], string> = {
  MATCHES: 'check_circle',
  DIFFERS: 'compare_arrows',
  MISSING_ON_SATUSEHAT: 'error',
  NOT_SENT: 'block',
};

const OUTCOME_CLASSES: Record<SatusehatRecordLine['outcome'], string> = {
  MATCHES: 'text-emerald-700',
  DIFFERS: 'text-amber-700',
  MISSING_ON_SATUSEHAT: 'text-red-700',
  NOT_SENT: 'text-slate-500',
};

/**
 * One item of the visit against what SATUSEHAT holds (P21-T04).
 *
 * Both values are shown only when they differ: a matching line repeating the
 * same diagnosis twice is noise, and a differing one is the reason the doctor
 * opened this card. `NOT_SENT` names its reason, because the fix — a missing
 * KFA or ICD-9-CM code — is something the clinic can act on.
 */
export function EncounterSatusehatRecordLineRow({ line }: EncounterSatusehatRecordLineRowProps) {
  const t = useTranslations('clinical.encounters.satusehatRecord');

  return (
    <li className="space-y-1 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Icon
            name={OUTCOME_ICONS[line.outcome]}
            size={16}
            className={OUTCOME_CLASSES[line.outcome]}
          />
          <span className="text-xs uppercase tracking-wide text-slate-500">
            {t(`category.${line.category}`)}
          </span>
          <span className="text-sm text-slate-800">{line.display}</span>
          {line.code ? <span className="font-mono text-xs text-slate-500">{line.code}</span> : null}
        </span>
        <span className={`text-sm ${OUTCOME_CLASSES[line.outcome]}`}>
          {t(`outcome.${line.outcome}`)}
          {line.notSentReason ? ` · ${t(`notSentReason.${line.notSentReason}`)}` : ''}
        </span>
      </div>
      {line.outcome === 'DIFFERS' ? (
        <p className="pl-6 text-xs text-slate-600">
          {t('ours')}: {line.ours ?? '—'} · {t('satusehat')}: {line.satusehat ?? '—'}
        </p>
      ) : null}
    </li>
  );
}
