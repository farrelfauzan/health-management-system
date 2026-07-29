'use client';

import { Card, CardContent } from '@hms/ui';
import { usePathname, useRouter } from 'next/navigation';

import {
  EncountersFilterCard,
  type EncountersFilterValues,
} from '#components/client/encounters/encounters-filter-card';
import { EncountersTable } from '#components/client/encounters/encounters-table';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { PageHeader } from '#components/shared/page-header';
import {
  buildEncountersSearchParams,
  type EncountersSearchParams,
} from '#lib/encounters/search-params';
import { useEncountersList } from '#lib/encounters/use-encounters-list';
import { ADMIN_ROUTE_METADATA } from '#lib/shell/route-metadata';

type EncountersPanelProps = {
  initialQuery: EncountersSearchParams;
};

export function EncountersPanel({ initialQuery }: EncountersPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const metadata = ADMIN_ROUTE_METADATA.encounters;
  const encountersQuery = useEncountersList(initialQuery);

  function navigateWithParams(next: EncountersSearchParams): void {
    router.replace(`${pathname}?${buildEncountersSearchParams(next).toString()}`);
  }

  function handleApplyFilters(filters: EncountersFilterValues): void {
    navigateWithParams({
      page: 1,
      limit: initialQuery.limit,
      patientId: initialQuery.patientId,
      registrationId: initialQuery.registrationId,
      ...filters,
    });
  }

  function handleResetFilters(): void {
    navigateWithParams({ page: 1, limit: initialQuery.limit });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={metadata.title}
        subtitle={metadata.subtitle}
        breadcrumbs={[...metadata.breadcrumbs]}
      />

      <EncountersFilterCard
        key={`${initialQuery.status ?? ''}|${initialQuery.doctorId ?? ''}|${initialQuery.startedFrom ?? ''}|${initialQuery.startedTo ?? ''}`}
        initialQuery={initialQuery}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
      />

      {encountersQuery.error && encountersQuery.encounters.length > 0 ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {encountersQuery.error.message}
        </p>
      ) : null}

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <EncountersTable
            encounters={encountersQuery.encounters}
            isPending={encountersQuery.isPending}
            isError={encountersQuery.isError}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={initialQuery.page}
            pageSize={initialQuery.limit}
            total={encountersQuery.meta?.total ?? 0}
            itemLabel="encounters"
            isDisabled={encountersQuery.isFetching}
            onPageChange={(nextPage) => navigateWithParams({ ...initialQuery, page: nextPage })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
