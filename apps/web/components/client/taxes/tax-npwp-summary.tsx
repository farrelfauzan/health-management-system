'use client';

import type { NpwpStatusValue } from '@hms/shared-types';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { InlineNotice } from '#components/client/shared/inline-notice';

type TaxNpwpSummaryProps = {
  npwp?: string;
  npwpStatus: NpwpStatusValue;
};

const CLINIC_PROFILE_HREF = '/admin/administration?tab=clinic';

/**
 * The clinic's NPWP as the tax profile reads it (P27-T02). Read-only here: the
 * clinic profile owns it, so anything short of 16 digits links there rather
 * than offering a second place to type it.
 */
export function TaxNpwpSummary({ npwp, npwpStatus }: TaxNpwpSummaryProps) {
  const t = useTranslations('operations.taxes.settings.npwp');

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{t('label')}</p>
      <p className="font-mono text-sm text-slate-900">{npwp ?? t('missing')}</p>
      {npwpStatus === 'VALID' ? null : (
        <InlineNotice tone="warning">
          {t(`status.${npwpStatus}`)}{' '}
          <Link href={CLINIC_PROFILE_HREF} className="font-medium underline">
            {t('fixLink')}
          </Link>
        </InlineNotice>
      )}
    </div>
  );
}
