'use client';

import type { SensitiveDataFinding } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type SensitiveDataFindingsProps = {
  findings: readonly SensitiveDataFinding[];
  /** Selects the offending span in the field the reporter is looking at. */
  onSelectFinding: (finding: SensitiveDataFinding) => void;
};

/**
 * The findings under one field, each naming its category (P23-T11).
 *
 * It names the *category* and never the matched text, which is the same rule the
 * API's error response follows: a message that quotes the NIK it rejected has
 * copied it into a second place, and this one renders on screen in a room with
 * patients in it.
 *
 * Clicking a finding selects the span rather than removing it. Editing the
 * reporter's words for them would be guessing at what they meant to say — the
 * offsets are enough to put the cursor on the problem and let them fix it.
 */
export function SensitiveDataFindings({ findings, onSelectFinding }: SensitiveDataFindingsProps) {
  const t = useTranslations('authShell.bugReport');
  if (findings.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1" aria-live="polite">
      {findings.map((finding) => (
        <li key={`${finding.category}-${finding.start}`}>
          <button
            type="button"
            onClick={() => onSelectFinding(finding)}
            className="text-left text-xs text-rose-600 underline underline-offset-2 hover:text-rose-700"
          >
            {t('findings.entry', { category: t(`findings.categories.${finding.category}`) })}
          </button>
        </li>
      ))}
    </ul>
  );
}
