'use client';

import type { LabOrderPriorityValue } from '@hms/shared-types';
import { Badge } from '@hms/ui';
import { useTranslations } from 'next-intl';

type LabPriorityBadgeProps = {
  priority: LabOrderPriorityValue;
};

/** Cito in red, routine in outline — the one badge every row of the worklist carries. */
export function LabPriorityBadge({ priority }: LabPriorityBadgeProps) {
  const t = useTranslations('operations.laboratory.worklist');

  if (priority === 'URGENT') {
    return <Badge variant="destructive">{t('urgent')}</Badge>;
  }

  return <Badge variant="outline">{t('routine')}</Badge>;
}
