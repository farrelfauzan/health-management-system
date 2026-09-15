'use client';

import type { DoctorAuthorityStatusValue } from '@hms/shared-types';
import { Badge } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DOCTOR_AUTHORITY_STATUS_CLASSES } from '#lib/doctors/doctor-authority-status-classes';

type DoctorAuthorityStatusBadgeProps = {
  status: DoctorAuthorityStatusValue;
};

/** Aktif / Segera berakhir / Kedaluwarsa / Dicabut, as the API judged it on the clinic's day. */
export function DoctorAuthorityStatusBadge({ status }: DoctorAuthorityStatusBadgeProps) {
  const t = useTranslations('clinical');
  return (
    <Badge
      className={`shrink-0 rounded-full border-transparent text-[11px] font-medium ${DOCTOR_AUTHORITY_STATUS_CLASSES[status]}`}
    >
      {t(`doctors.authorities.status.${status}`)}
    </Badge>
  );
}
