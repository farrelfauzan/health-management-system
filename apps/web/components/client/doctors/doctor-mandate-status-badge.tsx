'use client';

import type { DoctorAuthorityStatusValue } from '@hms/shared-types';
import { Badge } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DOCTOR_AUTHORITY_STATUS_CLASSES } from '#lib/doctors/doctor-authority-status-classes';

type DoctorMandateStatusBadgeProps = {
  status: DoctorAuthorityStatusValue;
};

/**
 * Aktif / Segera berakhir / Kedaluwarsa / Dicabut for one pelimpahan, judged
 * by the API on the clinic's calendar day. Shares the authority chip tones
 * deliberately: the two cards sit side by side and mean the same four things.
 */
export function DoctorMandateStatusBadge({ status }: DoctorMandateStatusBadgeProps) {
  const t = useTranslations('clinical');
  return (
    <Badge
      className={`shrink-0 rounded-full border-transparent text-[11px] font-medium ${DOCTOR_AUTHORITY_STATUS_CLASSES[status]}`}
    >
      {t(`doctors.authorities.status.${status}`)}
    </Badge>
  );
}
