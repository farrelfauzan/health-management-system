'use client';

import type { ChannelDraftMissingFieldValue } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type ChannelArrivalMissingFieldsProps = {
  missingFields: ChannelDraftMissingFieldValue[];
  /**
   * Whether the two columns that hold a row on the worklist are among them.
   * Decided by the API — "incomplete" is a rule about the columns a chat
   * cannot fill, and a client re-deriving it would drift the moment the rule
   * changed.
   */
  isDraft: boolean;
};

/**
 * What the front desk still has to ask this person for.
 *
 * Identifiers are rendered in a quieter style than the demographics, matching
 * the rule the API applies: a missing date of birth or address keeps the row
 * on the worklist, while a missing NIK or BPJS number is a prompt. Somebody
 * may genuinely have neither, and a list that never clears is a list people
 * stop reading.
 */
export function ChannelArrivalMissingFields({
  missingFields,
  isDraft,
}: ChannelArrivalMissingFieldsProps) {
  const t = useTranslations('channelArrivals.fields');

  if (missingFields.length === 0) {
    return <span className="text-sm text-emerald-800">{t('complete')}</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {missingFields.map((field) => (
        <li
          key={field}
          className={
            isDraft && (field === 'dateOfBirth' || field === 'address')
              ? 'rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900'
              : 'rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600'
          }
        >
          {t(field)}
        </li>
      ))}
    </ul>
  );
}
