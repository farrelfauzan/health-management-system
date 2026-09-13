'use client';

import type { SatusehatResourceCheckResult } from '@hms/shared-types';
import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

type SatusehatCheckResultRowProps = {
  result: SatusehatResourceCheckResult;
};

const OUTCOME_ICONS: Record<SatusehatResourceCheckResult['outcome'], string> = {
  FOUND: 'check_circle',
  NOT_FOUND: 'error',
  UNPAIRED: 'help',
  ERROR: 'cloud_off',
};

const OUTCOME_CLASSES: Record<SatusehatResourceCheckResult['outcome'], string> = {
  FOUND: 'text-emerald-700',
  NOT_FOUND: 'text-red-700',
  UNPAIRED: 'text-slate-500',
  ERROR: 'text-amber-700',
};

/**
 * What SATUSEHAT answered for one resource we sent (P21-T03).
 *
 * `NOT_FOUND` and `ERROR` are kept visually distinct on purpose: "SATUSEHAT does
 * not hold this" and "we could not ask" mean opposite things to an operator
 * deciding whether to resend, and collapsing them into one red row would invite
 * a resend that duplicates a resource already on the national record.
 */
export function SatusehatCheckResultRow({ result }: SatusehatCheckResultRowProps) {
  const t = useTranslations('operations.integrations.satusehatDetail');

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
      <span className="flex items-center gap-2">
        <Icon
          name={OUTCOME_ICONS[result.outcome]}
          size={16}
          className={OUTCOME_CLASSES[result.outcome]}
        />
        <span className="font-mono text-sm text-slate-800">{result.resourceType}</span>
      </span>
      <span className="text-sm text-slate-600">
        {t(`outcome.${result.outcome}`)}
        {result.status ? ` · ${result.status}` : ''}
        {result.versionId ? ` · v${result.versionId.slice(-6)}` : ''}
      </span>
    </li>
  );
}
