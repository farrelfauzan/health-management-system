'use client';

import { useState } from 'react';
import { Card, CardContent } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { ProspectivePatientsFilterCard } from '#components/client/prospective-patients/prospective-patients-filter-card';
import { ProspectivePatientsTable } from '#components/client/prospective-patients/prospective-patients-table';
import {
  DEFAULT_PROSPECTIVE_PATIENTS_FILTERS,
  PROSPECTIVE_PATIENTS_PAGE_SIZE,
  type ProspectivePatientsFilters,
} from '#lib/prospective-patients/prospective-patients-filters';
import { useProspectivePatients } from '#lib/prospective-patients/use-prospective-patients';

/**
 * The back-office view of chat bookings (`P19-T08`, feedback Patient #2).
 *
 * The arrival worklist on the registrations queue is the *arrival-time* flow:
 * it shows today's bookings and is where a person standing at the counter gets
 * resolved. Testers never found it, because somebody who booked for next week
 * is not on today's list and the front desk went looking under Patients. This
 * tab is that other view: every unresolved record regardless of date, with the
 * same two resolutions the counter has, so the desk can move people into the
 * patient table deliberately and ahead of time.
 */
export function ProspectivePatientsPanel() {
  const t = useTranslations('prospectivePatients');
  const [filters, setFilters] = useState<ProspectivePatientsFilters>(
    DEFAULT_PROSPECTIVE_PATIENTS_FILTERS,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listQuery = useProspectivePatients(filters);

  function handleFiltersChange(next: Omit<ProspectivePatientsFilters, 'page'>): void {
    setFilters({ ...next, page: 1 });
  }

  function handleResult(message: string): void {
    setError(null);
    setNotice(message);
  }

  function handleError(message: string): void {
    setNotice(null);
    setError(message);
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-slate-500">{t('subtitle')}</p>
      <ProspectivePatientsFilterCard filters={filters} onChange={handleFiltersChange} />
      {notice ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>
      ) : null}
      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <ProspectivePatientsTable
            items={listQuery.items}
            isPending={listQuery.isPending}
            isError={listQuery.isError}
            onResult={handleResult}
            onFailed={handleError}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={filters.page}
            pageSize={PROSPECTIVE_PATIENTS_PAGE_SIZE}
            total={listQuery.meta?.total ?? 0}
            itemLabel={t('itemLabel')}
            isDisabled={listQuery.isFetching}
            onPageChange={(nextPage) => setFilters({ ...filters, page: nextPage })}
          />
        </CardContent>
      </Card>
    </section>
  );
}
