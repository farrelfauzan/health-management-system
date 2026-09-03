'use client';

import { useTranslations } from 'next-intl';

import { LicenseExpiryBucketCard } from '#components/client/doctors/license-expiry-bucket-card';
import { PageHeader } from '#components/shared/page-header';
import { useDoctorLicenseExpiry } from '#lib/doctors/use-doctor-license-expiry';

/**
 * The clinic's licence expiry dashboard (P16-T19, FR-E3-33).
 *
 * Everything on this screen is read from `DoctorLicense` — a number and a
 * date the clinic already administers. Nothing here links to, references, or
 * hints at a document in anyone's vault, including one shared with the person
 * looking at it (FR-E3-35). That is what lets the vault stay entirely
 * private: the clinic can meet its licensing obligation without ever needing
 * a doctor to hand over a scan, so the two never have to be traded against
 * each other.
 */
export function LicenseExpiryPanel() {
  const t = useTranslations('clinical');
  const expiryQuery = useDoctorLicenseExpiry();
  const { buckets } = expiryQuery;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('licenceExpiry.title')}
        subtitle={t('licenceExpiry.subtitle')}
        breadcrumbs={[t('doctors.dashboard'), t('doctors.title'), t('licenceExpiry.breadcrumb')]}
      />

      {expiryQuery.isError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {t('licenceExpiry.errorDescription')}
        </p>
      ) : null}

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {t('licenceExpiry.scopeNotice')}
      </p>

      <LicenseExpiryBucketCard
        title={t('licenceExpiry.buckets.expired.title')}
        description={t('licenceExpiry.buckets.expired.description')}
        rows={buckets.expired}
        isPending={expiryQuery.isPending}
        emptyMessage={t('licenceExpiry.buckets.expired.empty')}
      />
      <LicenseExpiryBucketCard
        title={t('licenceExpiry.buckets.within30Days.title')}
        description={t('licenceExpiry.buckets.within30Days.description')}
        rows={buckets.within30Days}
        isPending={expiryQuery.isPending}
        emptyMessage={t('licenceExpiry.buckets.within30Days.empty')}
      />
      <LicenseExpiryBucketCard
        title={t('licenceExpiry.buckets.within60Days.title')}
        description={t('licenceExpiry.buckets.within60Days.description')}
        rows={buckets.within60Days}
        isPending={expiryQuery.isPending}
        emptyMessage={t('licenceExpiry.buckets.within60Days.empty')}
      />
      <LicenseExpiryBucketCard
        title={t('licenceExpiry.buckets.within90Days.title')}
        description={t('licenceExpiry.buckets.within90Days.description')}
        rows={buckets.within90Days}
        isPending={expiryQuery.isPending}
        emptyMessage={t('licenceExpiry.buckets.within90Days.empty')}
      />
    </div>
  );
}
