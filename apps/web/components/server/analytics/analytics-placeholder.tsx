import { getTranslations } from 'next-intl/server';

import { EmptyState } from '#components/shared/empty-state';
import { PageHeader } from '#components/shared/page-header';
import type { AnalyticsDashboard } from '#lib/analytics/analytics-dashboards';
import { resolveShellBreadcrumbRoot } from '#lib/navigation/resolve-shell-breadcrumb-root.server';

type AnalyticsPlaceholderProps = {
  dashboard: AnalyticsDashboard;
};

/**
 * Stands in for a dashboard until its own ticket lands (P29-T01). Says the
 * page is being prepared rather than showing zeros, which would read as a
 * clinic with no visits.
 */
export async function AnalyticsPlaceholder({ dashboard }: AnalyticsPlaceholderProps) {
  const t = await getTranslations('analytics');
  const root = await resolveShellBreadcrumbRoot('admin');
  return (
    <div className="space-y-6">
      <PageHeader
        title={t(`dashboards.${dashboard.slug}.title`)}
        subtitle={t(`dashboards.${dashboard.slug}.subtitle`)}
        breadcrumbs={[
          root,
          { label: t('breadcrumb') },
          { label: t(`dashboards.${dashboard.slug}.title`) },
        ]}
      />
      <EmptyState
        icon={dashboard.icon}
        title={t('placeholder.title')}
        description={t('placeholder.description')}
      />
    </div>
  );
}
