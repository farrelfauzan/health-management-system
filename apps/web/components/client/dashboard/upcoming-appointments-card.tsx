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

import { RefreshCountdown } from '#components/client/dashboard/refresh-countdown';
import { UpcomingAppointmentsRow } from '#components/client/dashboard/upcoming-appointments-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';
import { useTodayAppointments } from '#lib/dashboard/use-today-appointments';

export function UpcomingAppointmentsCard() {
  const appointmentsQuery = useTodayAppointments();
  const hasRows = appointmentsQuery.appointments.length > 0;
  const showEmptyState = !appointmentsQuery.isPending && !hasRows;
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center gap-3">
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          Upcoming Appointments
        </CardTitle>
        <Badge className="rounded-full bg-info-tint font-mono text-[11px] text-primary">
          {appointmentsQuery.meta?.total ?? 0} Total
        </Badge>
        <Link
          href="/admin/appointments"
          className="ml-auto text-sm font-medium text-primary hover:underline"
        >
          View Full Schedule →
        </Link>
      </CardHeader>
      <CardContent>
        {showEmptyState ? (
          <EmptyState
            icon="event_busy"
            title={
              appointmentsQuery.isError
                ? 'Unable to load appointments'
                : 'No appointments scheduled today'
            }
            description={
              appointmentsQuery.isError
                ? 'Something went wrong while fetching the schedule. It retries automatically.'
                : 'Newly scheduled appointments for today will show up here.'
            }
            className="border-0"
          />
        ) : (
          <DataTable className="rounded-lg">
            <TableHeader>
              <TableRow>
                <DataTableHeaderCell>Patient</DataTableHeaderCell>
                <DataTableHeaderCell>Reason / Doctor</DataTableHeaderCell>
                <DataTableHeaderCell>Time</DataTableHeaderCell>
                <DataTableHeaderCell>Status</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Actions</DataTableHeaderCell>
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
