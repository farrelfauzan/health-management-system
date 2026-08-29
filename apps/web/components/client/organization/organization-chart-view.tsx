'use client';

import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { OrganizationChartNode } from '#components/client/organization/organization-chart-node';
import { EmptyState } from '#components/shared/empty-state';

type OrganizationChartViewProps = {
  roots: OrganizationUnitTreeNode[];
  isError: boolean;
  onSelectUnit: (unit: OrganizationUnitTreeNode) => void;
};

/**
 * The family-tree rendering of the org chart (SJ-91): the same tree the list
 * view shows, drawn as boxes and connector lines. A view, not an edit surface —
 * the treegrid keeps the keyboard model, ARIA semantics and row actions, and
 * this keeps the picture.
 *
 * Roots render side by side rather than under an invented company node,
 * because the API deliberately returns `roots` as a forest — the Bekasi branch
 * is a real second structure, not a child of the hospital.
 *
 * Wide trees scroll inside this container; the page never grows sideways.
 */
export function OrganizationChartView({ roots, isError, onSelectUnit }: OrganizationChartViewProps) {
  const t = useTranslations('operations.organization');

  if (roots.length === 0) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'account_tree'}
        title={isError ? t('loadError') : t('empty')}
        description={isError ? t('loadErrorDescription') : t('emptyReadOnly')}
      />
    );
  }

  return (
    <div className="w-full max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white py-6">
      <p className="px-4 pb-4 text-xs text-slate-400">{t('chartHint')}</p>
      <ul aria-label={t('title')} className="flex min-w-max items-start justify-center gap-10 px-6">
        {roots.map((root) => (
          <OrganizationChartNode key={root.id} unit={root} isRoot onSelectUnit={onSelectUnit} />
        ))}
      </ul>
    </div>
  );
}
