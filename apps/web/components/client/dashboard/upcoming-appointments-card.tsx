'use client';

import {
  Badge,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  TableBody,
  TableHeader,
  TableRow,
} from '@hms/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { RefreshCountdown } from '#components/client/dashboard/refresh-countdown';
import { UpcomingAppointmentsRow } from '#components/client/dashboard/upcoming-appointments-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';
import { useTodayAppointments } from '#lib/dashboard/use-today-appointments';

export function UpcomingAppointmentsCard() {
  const t = useTranslations('dashboard.appointments');
  const appointmentsQuery = useTodayAppointments();
  const hasRows = appointmentsQuery.appointments.length > 0;
  const showEmptyState = !appointmentsQuery.isPending && !hasRows;
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center gap-3">
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          {t('title')}
        </CardTitle>
        <Badge className="rounded-full bg-info-tint font-mono text-[11px] text-primary">
          {t('total', { count: appointmentsQuery.meta?.total ?? 0 })}
        </Badge>
        <Link
          href="/admin/appointments"
          className="ml-auto text-sm font-medium text-primary hover:underline"
        >
          {t('viewFullSchedule')}
        </Link>
      </CardHeader>
      <CardContent>
        {showEmptyState ? (
          <EmptyState
            icon="event_busy"
            title={appointmentsQuery.isError ? t('loadErrorTitle') : t('emptyTitle')}
            description={
              appointmentsQuery.isError ? t('loadErrorDescription') : t('emptyDescription')
            }
            className="border-0"
          />
        ) : (
          <DataTable className="rounded-lg">
            <TableHeader>
              <TableRow>
                <DataTableHeaderCell>{t('columns.patient')}</DataTableHeaderCell>
                <DataTableHeaderCell>{t('columns.reasonDoctor')}</DataTableHeaderCell>
                <DataTableHeaderCell>{t('columns.time')}</DataTableHeaderCell>
                <DataTableHeaderCell>{t('columns.status')}</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">
                  {t('columns.actions')}
                </DataTableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointmentsQuery.isPending ? (
                <TableSkeleton columns={5} />
              ) : (
                appointmentsQuery.appointments.map((appointment) => (
                  <UpcomingAppointmentsRow key={appointment.id} appointment={appointment} />
                ))
              )}
            </TableBody>
          </DataTable>
        )}
      </CardContent>
      <CardFooter className="border-t border-slate-100 pt-4">
        <RefreshCountdown dataUpdatedAt={appointmentsQuery.dataUpdatedAt} />
      </CardFooter>
    </Card>
  );
}
