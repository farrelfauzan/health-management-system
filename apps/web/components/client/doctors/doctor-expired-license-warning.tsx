'use client';

import { Badge, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

type DoctorExpiredLicenseWarningProps = {
  /**
   * The soonest-expiring lapsed licence's date, or undefined when none has
   * lapsed — or when the viewer cannot read the expiry roster at all, in
   * which case the flag simply does not appear.
   */
  expiredAt?: string;
};

/**
 * Flags a doctor practising on a lapsed licence, on their directory row
 * (US-E3-08).
 *
 * The date comes from the expiry roster, not from the directory payload:
 * `Doctor` read is held by doctors and patients, and a badge fed from that
 * response would have published to every patient the fact this dashboard
 * exists to keep among administrators. Renders nothing when no licence has
 * lapsed.
 */
export function DoctorExpiredLicenseWarning({ expiredAt }: DoctorExpiredLicenseWarningProps) {
  const t = useTranslations('clinical');

  if (!expiredAt) {
    return null;
  }

  return (
    <Badge
      data-tone="danger"
      title={t('licenceExpiry.directoryFlagHint', { expiresAt: expiredAt })}
      className="mt-1 gap-1 rounded-full border-transparent bg-danger-tint font-heading text-[11px] font-medium tracking-wide text-danger"
    >
      <Icon name="gpp_maybe" size={12} />
      {t('licenceExpiry.directoryFlag', { expiresAt: expiredAt })}
    </Badge>
  );
}
