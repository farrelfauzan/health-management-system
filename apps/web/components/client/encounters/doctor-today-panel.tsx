'use client';

import { Card, CardContent } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { EncountersTable } from '#components/client/encounters/encounters-table';
import { PageHeader } from '#components/shared/page-header';
import { INVOICES_PAGE_SIZE } from '#lib/billing/search-params';
import { useEncountersList } from '#lib/encounters/use-encounters-list';

type DoctorTodayPanelProps = {
  /** Clinic-local day, resolved on the server so the browser timezone cannot shift it. */
  today: string;
};

export function DoctorTodayPanel({ today }: DoctorTodayPanelProps) {
  const t = useTranslations('clinical');
  const format = useFormatter();
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
        title={t('encounters.today')}
        subtitle={t('encounters.todaySubtitle')}
        breadcrumbs={[t('encounters.doctor'), t('encounters.today')]}
      />

      <section className="space-y-3">
        <h2 className="font-heading text-sm font-semibold text-slate-700">
          {t('encounters.openEncounters')}
          <span className="ml-2 text-xs font-normal text-slate-400">
            {format.number(openQuery.encounters.length)}
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
        <h2 className="font-heading text-sm font-semibold text-slate-700">
          {t('encounters.seenToday')}
        </h2>
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
