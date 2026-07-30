'use client';

import { Button, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

export type PrescriptionQueueFilter = 'ALL' | 'STAT';

type PrescriptionQueueToggleProps = {
  value: PrescriptionQueueFilter;
  onChange: (value: PrescriptionQueueFilter) => void;
};

export function PrescriptionQueueToggle({ value, onChange }: PrescriptionQueueToggleProps) {
  const t = useTranslations('operations.pharmacy');
  return (
    <div className="flex gap-2" role="group" aria-label={t('filterPriority')}>
      {(['ALL', 'STAT'] as PrescriptionQueueFilter[]).map((filter) => (
        <Button
          key={filter}
          type="button"
          size="sm"
          variant="outline"
          aria-pressed={value === filter}
          className={cn(
            'h-7 rounded-md px-2.5 text-xs',
            value === filter &&
              filter === 'STAT' &&
              'border-danger/20 bg-danger-tint text-danger hover:bg-danger-tint hover:text-danger',
            value === filter && filter === 'ALL' && 'border-slate-300 bg-slate-100 text-slate-900',
          )}
          onClick={() => onChange(filter)}
        >
          {filter === 'ALL' ? t('all') : t('statOnly')}
        </Button>
      ))}
    </div>
  );
}
