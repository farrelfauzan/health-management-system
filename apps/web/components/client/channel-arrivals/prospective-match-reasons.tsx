'use client';

import type { ProspectiveMatchReasonValue } from '@hms/shared-types';
import { Badge } from '@hms/ui';
import { useTranslations } from 'next-intl';

type ProspectiveMatchReasonsProps = {
  reasons: ProspectiveMatchReasonValue[];
};

/** Strongest evidence reads first, matching the order the API scores in. */
const REASON_STYLES: Record<ProspectiveMatchReasonValue, string> = {
  NIK_EXACT: 'bg-emerald-100 text-emerald-900',
  PHONE_EXACT: 'bg-sky-100 text-sky-900',
  NAME_SIMILAR: 'bg-slate-100 text-slate-700',
};

/**
 * Why this record is being offered (`P17-T04`).
 *
 * Reasons rather than a score, because the clerk is holding an ID document and
 * the reasons tell them what to check against it. They are colour-weighted on
 * purpose: an exact NIK is evidence, a shared phone number is a household, and
 * a similar name is a coincidence until something else agrees with it.
 *
 * A candidate with no reasons is one the clerk's own typing surfaced, and it
 * says so rather than showing an empty row that reads as a confirmed match.
 */
export function ProspectiveMatchReasons({ reasons }: ProspectiveMatchReasonsProps) {
  const t = useTranslations('channelArrivals.prospective.reasons');

  if (reasons.length === 0) {
    return <span className="text-xs text-slate-500">{t('SEARCH_ONLY')}</span>;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {reasons.map((reason) => (
        <Badge key={reason} className={REASON_STYLES[reason]}>
          {t(reason)}
        </Badge>
      ))}
    </span>
  );
}
