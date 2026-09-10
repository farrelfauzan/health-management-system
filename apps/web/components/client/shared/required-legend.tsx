'use client';

import { cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

type RequiredLegendProps = {
  className?: string;
};

/**
 * "* Required" hint shown at the top of any form that marks at least one
 * field with `required`, so the asterisk is explained before the first submit.
 */
export function RequiredLegend({ className }: RequiredLegendProps) {
  const t = useTranslations('shared.form');
  return (
    <p className={cn('text-xs text-slate-500', className)}>
      <span aria-hidden="true" className="text-destructive">
        *
      </span>{' '}
      {t('requiredLegend')}
    </p>
  );
}
