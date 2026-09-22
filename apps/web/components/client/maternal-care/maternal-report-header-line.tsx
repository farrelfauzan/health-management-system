'use client';

import type { MaternalReportHeader } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type MaternalReportHeaderLineProps = {
  header: MaternalReportHeader;
};

/** Clinic, reporting puskesmas and month, as the printed header reads them. */
export function MaternalReportHeaderLine({ header }: MaternalReportHeaderLineProps) {
  const t = useTranslations('maternalCare.reports.header');
  const puskesmas = [header.puskesmasName, header.puskesmasCode]
    .filter((value): value is string => value !== null && value.trim() !== '')
    .join(' · ');
  return (
    <p className="text-sm text-slate-600">
      <span className="font-medium text-slate-900">{header.clinicName}</span>
      {' · '}
      {t('puskesmas')}: {puskesmas === '' ? t('notSet') : puskesmas}
      {' · '}
      {header.monthLabel}
    </p>
  );
}
