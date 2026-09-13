'use client';

import type { SatusehatSubmissionResourceGroup } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type SatusehatResourceGroupRowProps = {
  group: SatusehatSubmissionResourceGroup;
};

/**
 * One resource type as a submission sent it (P21-T03).
 *
 * Skips are rendered as "2 skipped: no KFA code" — a category and a count,
 * never the item. Naming the medication would tell an administrator what the
 * patient was prescribed, which is the line this whole view stays behind.
 */
export function SatusehatResourceGroupRow({ group }: SatusehatResourceGroupRowProps) {
  const t = useTranslations('operations.integrations.satusehatDetail');

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
      <span className="font-mono text-sm text-slate-800">{group.resourceType}</span>
      <span className="text-sm text-slate-600">
        {t('sentCount', { count: group.sentCount })}
        {group.unpairedCount > 0 ? ` · ${t('unpairedCount', { count: group.unpairedCount })}` : ''}
        {group.skipped.map(
          (skip) =>
            ` · ${t('skippedCount', { count: skip.count })}: ${t(`skipReason.${skip.reason}`)}`,
        )}
      </span>
    </li>
  );
}
