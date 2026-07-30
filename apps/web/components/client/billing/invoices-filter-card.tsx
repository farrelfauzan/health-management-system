'use client';

import { useState } from 'react';
import { INVOICE_STATUSES, type InvoiceStatusValue } from '@hms/shared-types';
import {
  Button,
  DatePicker,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FilterCard } from '#components/shared/filter-card';
import type { InvoicesSearchParams } from '#lib/billing/search-params';
import { formatStatusLabel } from '#lib/shared/status-label';

const ALL_STATUSES_VALUE = 'ALL';

export type InvoicesFilterValues = {
  status?: InvoiceStatusValue;
  createdFrom?: string;
  createdTo?: string;
};

type InvoicesFilterCardProps = {
  initialQuery: InvoicesSearchParams;
  onApply: (filters: InvoicesFilterValues) => void;
  onReset: () => void;
};

export function InvoicesFilterCard({ initialQuery, onApply, onReset }: InvoicesFilterCardProps) {
  const t = useTranslations('operations');
  const [status, setStatus] = useState<string>(initialQuery.status ?? ALL_STATUSES_VALUE);
  const [createdFrom, setCreatedFrom] = useState<string>(initialQuery.createdFrom ?? '');
  const [createdTo, setCreatedTo] = useState<string>(initialQuery.createdTo ?? '');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    event.stopPropagation();
    onApply({
      status: status === ALL_STATUSES_VALUE ? undefined : (status as InvoiceStatusValue),
      createdFrom: createdFrom.length > 0 ? createdFrom : undefined,
      createdTo: createdTo.length > 0 ? createdTo : undefined,
    });
  }

  function handleReset(): void {
    setStatus(ALL_STATUSES_VALUE);
    setCreatedFrom('');
    setCreatedTo('');
    onReset();
  }

  function handleCreatedFromChange(value: string): void {
    setCreatedFrom(value);
    if (createdTo.length > 0 && (value.length === 0 || createdTo < value)) {
      setCreatedTo('');
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <FilterCard
        actions={
          <>
            <Button type="submit" size="sm" className="bg-primary-container hover:bg-primary">
              {t('common.applyFilters')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleReset}>
              {t('common.reset')}
            </Button>
          </>
        }
      >
        <div className="w-44">
          <label
            htmlFor="invoices-status-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('common.status')}
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="invoices-status-filter" className="w-full">
              <SelectValue placeholder={t('billing.allStatuses')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES_VALUE}>{t('billing.allStatuses')}</SelectItem>
              {INVOICE_STATUSES.map((statusValue) => (
                <SelectItem key={statusValue} value={statusValue}>
                  {formatStatusLabel(statusValue)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <span className="mb-1.5 block font-heading text-xs font-medium text-slate-600">
            {t('billing.createdBetween')}
          </span>
          <div className="flex items-center gap-2">
            <DatePicker
              aria-label={t('billing.createdFrom')}
              className="w-40"
              placeholder={t('common.from')}
              value={createdFrom}
              onValueChange={handleCreatedFromChange}
            />
            <span className="text-sm text-slate-400">–</span>
            <DatePicker
              aria-label={t('billing.createdTo')}
              className="w-40"
              placeholder={t('common.to')}
              value={createdTo}
              disabled={createdFrom.length === 0}
              minValue={createdFrom}
              onValueChange={setCreatedTo}
            />
          </div>
        </div>
      </FilterCard>
    </form>
  );
}
