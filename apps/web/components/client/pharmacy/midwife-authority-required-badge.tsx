'use client';

import type { DoctorAuthorityKindValue } from '@hms/shared-types';
import { Badge } from '@hms/ui';
import { useTranslations } from 'next-intl';

type MidwifeAuthorityRequiredBadgeProps = {
  kind: DoctorAuthorityKindValue;
};

/**
 * Marks a catalog row a bidan may write only under an authority (P25-T05).
 * Names the kewenangan rather than saying "restricted", because that is the
 * one thing an administrator needs in order to act on it.
 */
export function MidwifeAuthorityRequiredBadge({ kind }: MidwifeAuthorityRequiredBadgeProps) {
  const t = useTranslations('pharmacyInventory');
  return (
    <Badge className="shrink-0 rounded-full border-transparent bg-warning-tint text-[11px] font-medium text-warning">
      {t('midwifeAuthorityRequired', { kind: t(`midwifeAuthorityKindOption.${kind}`) })}
    </Badge>
  );
}
