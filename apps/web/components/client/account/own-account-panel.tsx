'use client';

import { Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { OwnAccountIdentityCard } from '#components/client/account/own-account-identity-card';
import { OwnAccountNikForm } from '#components/client/account/own-account-nik-form';
import { EmptyState } from '#components/shared/empty-state';
import { PageHeader } from '#components/shared/page-header';
import { useOwnAccount } from '#lib/account/use-own-account';
import { useShellBreadcrumbRoot } from '#lib/navigation/use-shell-breadcrumb-root';

/**
 * The operator's own account (P24-T15): what the clinic knows the account as,
 * read-only, and the one field that is theirs to add here — their NIK for
 * SATUSEHAT's KYC (D-039).
 */
export function OwnAccountPanel() {
  const t = useTranslations('operations.account');
  const root = useShellBreadcrumbRoot();
  const accountQuery = useOwnAccount();
  const header = (
    <PageHeader
      title={t('title')}
      subtitle={t('subtitle')}
      breadcrumbs={[root, { label: t('title') }]}
    />
  );
  if (accountQuery.isPending) {
    return (
      <div className="space-y-6">
        {header}
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }
  if (!accountQuery.account) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon="error"
          title={t('loadErrorTitle')}
          description={t('loadErrorDescription')}
        />
      </div>
    );
  }
  const account = accountQuery.account;
  return (
    <div className="space-y-6">
      {header}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Keyed on the masked digits so a save re-seeds the form from what
              the server now holds. */}
          <OwnAccountNikForm key={account.nikLast4 ?? 'none'} nikLast4={account.nikLast4} />
        </div>
        <OwnAccountIdentityCard account={account} />
      </div>
    </div>
  );
}
