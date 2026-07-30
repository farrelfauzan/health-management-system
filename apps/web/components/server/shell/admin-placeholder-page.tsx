import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { EmptyState } from '#components/shared/empty-state';
import { PageHeader } from '#components/shared/page-header';
import { resolveLocalizedAdminRouteMetadata, type AdminRouteKey } from '#lib/shell/route-metadata';

type AdminPlaceholderPageProps = {
  routeKey: AdminRouteKey;
  action?: ReactNode;
};

export async function AdminPlaceholderPage({ routeKey, action }: AdminPlaceholderPageProps) {
  const t = await getTranslations('authShell.shell.placeholder');
  const routes = await getTranslations('authShell.shell.routes');
  const navigation = await getTranslations('authShell.shell.navigation');
  const metadata = resolveLocalizedAdminRouteMetadata(
    routeKey,
    (key, values) => routes(key, values),
    (key) => navigation(key),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title={metadata.title}
        subtitle={metadata.subtitle}
        breadcrumbs={metadata.breadcrumbs}
      />
      <EmptyState
        icon="construction"
        title={t('title', { title: metadata.title })}
        description={t('description')}
        action={action}
      />
    </div>
  );
}
