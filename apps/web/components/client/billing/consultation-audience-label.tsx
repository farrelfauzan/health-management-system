'use client';

import type { ServiceTariffResponse } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type ConsultationAudienceLabelProps = {
  tariff: ServiceTariffResponse;
};

/**
 * The audience line under a consultation tariff's name. Two rows called
 * "Konsultasi" are otherwise indistinguishable in the price list, and which
 * one a visit is billed at is exactly the difference between them.
 */
export function ConsultationAudienceLabel({ tariff }: ConsultationAudienceLabelProps) {
  const t = useTranslations('operations.billing.consultationAudience');

  if (tariff.category !== 'CONSULTATION') {
    return null;
  }
  const poli = tariff.specialty?.name ?? t('anyPoli');
  const profession = tariff.profession ? t(`professions.${tariff.profession}`) : t('anyProfession');

  return <p className="text-xs text-slate-500">{`${poli} · ${profession}`}</p>;
}
