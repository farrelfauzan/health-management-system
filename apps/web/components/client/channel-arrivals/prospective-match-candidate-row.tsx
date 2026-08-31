'use client';

import type { ProspectiveMatchCandidateView } from '@hms/shared-types';
import { Button } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ProspectiveMatchReasons } from '#components/client/channel-arrivals/prospective-match-reasons';

type ProspectiveMatchCandidateRowProps = {
  candidate: ProspectiveMatchCandidateView;
  isLinking: boolean;
  onLink: (patientId: string) => void;
};

/**
 * One registry record the arriving person might be (`P17-T04`).
 *
 * The four identifying fields are all shown at once rather than behind a
 * details toggle: linking a booking onto the wrong record puts one person's
 * appointment on another person's chart, and the check that prevents it is a
 * human comparing a name, an MRN, a number and a birth date against the card
 * in front of them. A row that made any of those a second click would be a row
 * people link from without reading.
 *
 * *Link* is per candidate rather than a select-then-confirm pair, because the
 * action is reversible in the sense that matters — no MRN is spent — and the
 * confirmation that counts already happened when the clerk read the row.
 */
export function ProspectiveMatchCandidateRow({
  candidate,
  isLinking,
  onLink,
}: ProspectiveMatchCandidateRowProps) {
  const t = useTranslations('channelArrivals.prospective');

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-medium text-slate-900">{candidate.fullName}</p>
        <p className="text-xs text-slate-500">
          {candidate.mrn} · {candidate.phoneNumber}
          {candidate.dateOfBirth === null ? '' : ` · ${candidate.dateOfBirth}`}
          {candidate.nikMasked === null ? '' : ` · ${candidate.nikMasked}`}
        </p>
        <ProspectiveMatchReasons reasons={candidate.reasons} />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isLinking}
        onClick={() => onLink(candidate.id)}
      >
        {t('link')}
      </Button>
    </li>
  );
}
