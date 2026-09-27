'use client';

import { Button, Icon, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TAX_REPORTS_VIEWS, type TaxReportsView } from '#lib/taxes/tax-reports-views';

type TaxReportsViewToggleProps = {
  value: TaxReportsView;
  onChange: (next: TaxReportsView) => void;
};

const VIEW_ICONS: Record<TaxReportsView, string> = {
  table: 'table_rows',
  cards: 'grid_view',
};

/** Switches the tax reports between the tables (the default) and the month cards. */
export function TaxReportsViewToggle({ value, onChange }: TaxReportsViewToggleProps) {
  const t = useTranslations('operations.taxes.reports');

  return (
    <div
      role="group"
      aria-label={t('view.label')}
      className="inline-flex rounded-lg border border-slate-200 p-0.5"
    >
      {TAX_REPORTS_VIEWS.map((view) => (
        <Button
          key={view}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t(`view.${view}`)}
          aria-pressed={value === view}
          title={t(`view.${view}`)}
          className={cn('size-7', value === view && 'bg-slate-100 text-slate-900')}
          onClick={() => onChange(view)}
        >
          <Icon name={VIEW_ICONS[view]} size={18} fill={value === view} />
        </Button>
      ))}
    </div>
  );
}
