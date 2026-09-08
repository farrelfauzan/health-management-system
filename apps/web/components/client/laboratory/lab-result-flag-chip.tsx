'use client';

import type { LabResultFlagValue } from '@hms/shared-types';
import { Badge, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LAB_RESULT_FLAG_META } from '#lib/laboratory/lab-result-flag-meta';

const TONE_CLASSNAMES: Record<string, string> = {
  normal: 'bg-slate-100 text-slate-600',
  warning: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-600 text-white',
};

type LabResultFlagChipProps = {
  flag?: LabResultFlagValue;
};

/**
 * How abnormal a value is, in the two characters a doctor reads on every
 * printed report — with the critical pair spelled out, because a value that
 * has to be acted on now must not be one glyph away from one that merely leans
 * high.
 *
 * No flag renders nothing at all rather than a neutral chip: the row already
 * says "tidak ada rentang rujukan", and an empty badge beside it would read as
 * a judgement nobody made.
 */
export function LabResultFlagChip({ flag }: LabResultFlagChipProps) {
  const t = useTranslations('clinical');

  if (!flag) {
    return null;
  }

  const meta = LAB_RESULT_FLAG_META[flag];

  return (
    <Badge
      variant="secondary"
      className={cn('font-semibold', TONE_CLASSNAMES[meta.tone])}
      title={t(`encounters.laboratory.flag.${meta.labelKey}`)}
    >
      {meta.short}
    </Badge>
  );
}
