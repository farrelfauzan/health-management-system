'use client';

import type { ExpiredDoctorLicence } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';

type ExpiredLicenceWarningProps = {
  /**
   * Lapsed STR/SIP for the doctor being scheduled. `undefined` means the
   * viewer is not told about licences at all — a patient in the portal, or a
   * doctor reading their own sessions — and is deliberately different from an
   * empty array, which means this doctor's permits are current.
   */
  expiredLicenses?: ExpiredDoctorLicence[];
};

/**
 * Warns a scheduler that the doctor they are about to book patients with is
 * practising on a lapsed permit (FR-E3-36, US-E3-09).
 *
 * **A warning only.** Booking proceeds — v1 does not block, because a clinic
 * whose booking screen refuses on a licence a clerk cannot renew from that
 * screen is a clinic that stops booking, not one that renews faster. The hard
 * block (FR-E3-37) is a clinic-level setting defaulting to off, and is out of
 * scope here.
 *
 * Reads `DoctorLicense` fields only: a type, a number and a date the clinic
 * already administers. Nothing here refers to a document, and the payload it
 * renders has no document field to refer to — the clinic's obligation is met
 * without anyone opening, or learning of, a scan in that doctor's vault.
 */
export function ExpiredLicenceWarning({ expiredLicenses }: ExpiredLicenceWarningProps) {
  const t = useTranslations('operations.appointments.expiredLicence');

  if (expiredLicenses === undefined || expiredLicenses.length === 0) {
    return null;
  }

  return (
    <InlineNotice tone="warning" title={t('title')}>
      <div className="space-y-1">
        <ul className="space-y-0.5">
          {expiredLicenses.map((licence) => (
            <li key={`${licence.type}|${licence.licenseNumber}`}>
              {t('item', {
                type: licence.type,
                licenseNumber: licence.licenseNumber,
                expiresAt: licence.expiresAt,
              })}
            </li>
          ))}
        </ul>
        <p>{t('bookingProceeds')}</p>
      </div>
    </InlineNotice>
  );
}
