'use client';

import type { SatusehatLocationFallbackReasonValue } from '@hms/shared-types';
import { Badge } from '@hms/ui';
import { useTranslations } from 'next-intl';

type SatusehatLocationFallbackBadgeProps = {
  reason: SatusehatLocationFallbackReasonValue;
};

/**
 * Warns that the Encounter this row sent named the clinic's root site rather
 * than the poli the visit happened in (P24-T07, FR-LOC-09).
 *
 * The two reasons read differently on purpose: an unregistered poli is work
 * the Lokasi SATUSEHAT panel can close, while a visit registered without a
 * poli is not. Presence only — no poli name and no clinical content, because
 * the monitor is an operations surface.
 */
export function SatusehatLocationFallbackBadge({
  reason,
}: SatusehatLocationFallbackBadgeProps) {
  const t = useTranslations('operations.integrations.locationFallback');
  return (
    <Badge
      variant="outline"
      className="border-amber-200 bg-amber-50 text-amber-700"
      title={reason === 'POLI_NOT_REGISTERED' ? t('poliNotRegistered') : t('noPoli')}
    >
      {t('label')}
    </Badge>
  );
}
