'use client';

import { useTranslations } from 'next-intl';

/** D-040: the layout has not been compared with the pilot puskesmas' form yet. */
export function MaternalReportProvisionalNotice() {
  const t = useTranslations('maternalCare.reports');
  return (
    <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {t('provisionalNotice')}
    </p>
  );
}
