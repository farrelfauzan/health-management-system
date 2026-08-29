'use client';

import { Badge, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

type DoctorSatusehatWarningProps = {
  /** The masked NIK from the doctor profile; absent means none is stored. */
  nikMasked?: string;
};

/**
 * Flags a doctor whose encounters cannot reach SATUSEHAT. The IHS practitioner
 * number is resolved from the NIK and nothing else, so a doctor without one
 * fails submission permanently rather than retrying — and only an admin looking
 * at this directory can fix it (SJ-75). Renders nothing once a NIK is on file.
 */
export function DoctorSatusehatWarning({ nikMasked }: DoctorSatusehatWarningProps) {
  const t = useTranslations('clinical');

  if (nikMasked) {
    return null;
  }

  return (
    <Badge
      data-tone="warning"
      title={t('doctors.nikMissingHint')}
      className="mt-1 gap-1 rounded-full border-transparent bg-warning-tint font-heading text-[11px] font-medium tracking-wide text-warning"
    >
      <Icon name="warning" size={12} />
      {t('doctors.nikMissing')}
    </Badge>
  );
}
