'use client';

import { Card, CardContent } from '@hms/ui';

import { EncountersTable } from '#components/client/encounters/encounters-table';
import { PageHeader } from '#components/shared/page-header';
import { INVOICES_PAGE_SIZE } from '#lib/billing/search-params';
import { useEncountersList } from '#lib/encounters/use-encounters-list';

type DoctorTodayPanelProps = {
  /** Clinic-local day, resolved on the server so the browser timezone cannot shift it. */
  today: string;
};

export function DoctorTodayPanel({ today }: DoctorTodayPanelProps) {
  const openQuery = useEncountersList({
    page: 1,
    limit: INVOICES_PAGE_SIZE,
    status: 'IN_PROGRESS',
  });
  const todayQuery = useEncountersList({
    page: 1,
    limit: INVOICES_PAGE_SIZE,
    startedFrom: today,
    startedTo: today,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Today"
        subtitle="Visits you have open right now, and everything you have seen today."
        breadcrumbs={['Doctor', 'Today']}
      />

      <section className="space-y-3">
        <h2 className="font-heading text-sm font-semibold text-slate-700">
          Open encounters
          <span className="ml-2 text-xs font-normal text-slate-400">
            {openQuery.encounters.length}
          </span>
        </h2>
        <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
          <CardContent className="p-0">
            <EncountersTable
              encounters={openQuery.encounters}
              isPending={openQuery.isPending}
              isError={openQuery.isError}
              basePath="/doctor/encounters"
            />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-sm font-semibold text-slate-700">Seen today</h2>
        <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
          <CardContent className="p-0">
            <EncountersTable
              encounters={todayQuery.encounters}
              isPending={todayQuery.isPending}
              isError={todayQuery.isError}
              basePath="/doctor/encounters"
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
