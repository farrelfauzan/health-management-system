'use client';

import type { PpnTreatmentValue } from '@hms/shared-types';
import { Badge } from '@hms/ui';
import { useTranslations } from 'next-intl';

type TaxTreatmentBadgeProps = {
  treatment: PpnTreatmentValue;
};

/** How PPN treats a code, as a short label: taxed codes stand out, exempt ones recede. */
export function TaxTreatmentBadge({ treatment }: TaxTreatmentBadgeProps) {
  const t = useTranslations('operations.taxes.treatment');
  return <Badge variant={treatment === 'STANDARD' ? 'default' : 'outline'}>{t(treatment)}</Badge>;
}
