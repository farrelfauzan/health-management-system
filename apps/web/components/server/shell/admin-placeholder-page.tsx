import type { ReactNode } from 'react';

import { EmptyState } from '#components/shared/empty-state';
import { PageHeader } from '#components/shared/page-header';
import { ADMIN_ROUTE_METADATA, type AdminRouteKey } from '#lib/shell/route-metadata';

type AdminPlaceholderPageProps = {
  routeKey: AdminRouteKey;
  action?: ReactNode;
};

export function AdminPlaceholderPage({ routeKey, action }: AdminPlaceholderPageProps) {
  const metadata = ADMIN_ROUTE_METADATA[routeKey];
  return (
    <div className="space-y-6">
      <PageHeader
        title={metadata.title}
        subtitle={metadata.subtitle}
        breadcrumbs={metadata.breadcrumbs}
      />
      <EmptyState
        icon="construction"
        title={`${metadata.title} is on its way`}
        description="This screen ships in an upcoming Phase 4 task. The navigation and layout are ready for it."
        action={action}
      />
    </div>
  );
}
