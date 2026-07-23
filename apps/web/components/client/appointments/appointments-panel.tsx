'use client';

import { useState } from 'react';
import type { AppointmentListItem, DoctorSessionCalendarItem } from '@hms/shared-types';
import { Card, CardContent } from '@hms/ui';
import { usePathname, useRouter } from 'next/navigation';

import { AppointmentDetailsDialog } from '#components/client/appointments/appointment-details-dialog';
import { AppointmentRequestsPanel } from '#components/client/appointments/appointment-requests-panel';
import { AppointmentsSidePanel } from '#components/client/appointments/appointments-side-panel';
import { AppointmentsTable } from '#components/client/appointments/appointments-table';
import { CalendarToolbar } from '#components/client/appointments/calendar-toolbar';
import { CancelAppointmentDialog } from '#components/client/appointments/cancel-appointment-dialog';
import { DayView } from '#components/client/appointments/day-view';
import { MonthView } from '#components/client/appointments/month-view';
import { RescheduleAppointmentDialog } from '#components/client/appointments/reschedule-appointment-dialog';
import { ScheduleAppointmentDialog } from '#components/client/appointments/schedule-appointment-dialog';
import { SessionDetailsDialog } from '#components/client/appointments/session-details-dialog';
import { SessionQueueDialog } from '#components/client/appointments/session-queue-dialog';
import { WeekView } from '#components/client/appointments/week-view';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { PageHeader } from '#components/shared/page-header';
import { filterAppointmentsByDoctors } from '#lib/appointments/filter-appointments-by-doctors';
import {
  buildAppointmentsSearchParams,
  type AppointmentsSearchParams,
  type AppointmentsView,
} from '#lib/appointments/search-params';
import { useAppointmentsList } from '#lib/appointments/use-appointments-list';
import { useSessionsCalendar } from '#lib/appointments/use-sessions-calendar';
import {
  addDays,
  addMonths,
  formatDateParam,
  formatDayTitle,
  formatMonthTitle,
  formatWeekRangeTitle,
  getMonthGridDays,
  getWeekDays,
  getWeekStart,
  parseDateParam,
} from '#lib/appointments/week-range';
import { useDoctorsList } from '#lib/doctors/use-doctors-list';
import { ADMIN_ROUTE_METADATA } from '#lib/shell/route-metadata';

const CALENDAR_PAGE = 1;
const CALENDAR_LIMIT = 100;
const MEDICAL_STAFF_QUERY = { page: 1, limit: 100, isActive: 'true' as const };

type AppointmentsPanelProps = {
  initialQuery: AppointmentsSearchParams;
};

export function AppointmentsPanel({ initialQuery }: AppointmentsPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const metadata = ADMIN_ROUTE_METADATA.appointments;
  const anchorDate = parseDateParam(initialQuery.date) ?? new Date();
  const weekStart = getWeekStart(anchorDate);
  const weekDays = getWeekDays(weekStart);
  const monthGridDays = getMonthGridDays(anchorDate);
  const monthGridStart = getWeekStart(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1));
  const rangeStart =
    initialQuery.view === 'day'
      ? anchorDate
      : initialQuery.view === 'month'
        ? monthGridStart
        : weekStart;
  const rangeLengthDays =
    initialQuery.view === 'day' ? 1 : initialQuery.view === 'month' ? monthGridDays.length : 7;
  const title =
    initialQuery.view === 'day'
      ? formatDayTitle(anchorDate)
      : initialQuery.view === 'month'
        ? formatMonthTitle(anchorDate)
        : formatWeekRangeTitle(weekStart);
  const appointmentsQuery = useAppointmentsList({
    page: initialQuery.view === 'table' ? initialQuery.page : CALENDAR_PAGE,
    limit: initialQuery.view === 'table' ? initialQuery.limit : CALENDAR_LIMIT,
    scheduledFrom: rangeStart.toISOString(),
    scheduledTo: new Date(addDays(rangeStart, rangeLengthDays).getTime() - 1).toISOString(),
  });
  const sessionsQuery = useSessionsCalendar({
    from: formatDateParam(rangeStart),
    to: formatDateParam(addDays(rangeStart, rangeLengthDays - 1)),
  });
  const doctorsQuery = useDoctorsList(MEDICAL_STAFF_QUERY);
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[] | null>(null);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState<boolean>(false);
  const [viewingAppointment, setViewingAppointment] = useState<AppointmentListItem | null>(null);
  const [reschedulingAppointment, setReschedulingAppointment] =
    useState<AppointmentListItem | null>(null);
  const [cancellingAppointment, setCancellingAppointment] = useState<AppointmentListItem | null>(
    null,
  );
  const [viewingQueueSessionId, setViewingQueueSessionId] = useState<string | null>(null);
  const [viewingSession, setViewingSession] = useState<DoctorSessionCalendarItem | null>(null);
  const visibleAppointments = filterAppointmentsByDoctors(
    appointmentsQuery.appointments,
    selectedDoctorIds,
  );
  const calendarAppointments = visibleAppointments.filter(
    (appointment) => appointment.type !== 'SESSION',
  );
  const visibleSessions = sessionsQuery.sessions.filter(
    (session) => selectedDoctorIds === null || selectedDoctorIds.includes(session.doctorId),
  );

  function navigateWithParams(next: AppointmentsSearchParams): void {
    router.replace(`${pathname}?${buildAppointmentsSearchParams(next).toString()}`);
  }

  function resolveNavigationAnchor(offset: number): Date {
    if (offset === 0) {
      return new Date();
    }
    if (initialQuery.view === 'day') {
      return addDays(anchorDate, offset);
    }
    if (initialQuery.view === 'month') {
      return addMonths(anchorDate, offset);
    }
    return addDays(weekStart, offset * 7);
  }

  function handleNavigate(offset: number): void {
    navigateWithParams({
      ...initialQuery,
      date: formatDateParam(resolveNavigationAnchor(offset)),
      page: 1,
    });
  }

  function handleViewChange(view: AppointmentsView): void {
    navigateWithParams({ ...initialQuery, view, page: 1 });
  }

  function handleSelectDay(day: Date): void {
    navigateWithParams({ ...initialQuery, view: 'day', date: formatDateParam(day), page: 1 });
  }

  function handleToggleDoctor(doctorId: string): void {
    setSelectedDoctorIds((current) => {
      const base = current ?? doctorsQuery.doctors.map((doctor) => doctor.id);
      return base.includes(doctorId)
        ? base.filter((id) => id !== doctorId)
        : [...base, doctorId];
    });
  }

  function handleRescheduleAppointment(appointment: AppointmentListItem): void {
    setViewingAppointment(null);
    setReschedulingAppointment(appointment);
  }

  function handleCancelAppointment(appointment: AppointmentListItem): void {
    setViewingAppointment(null);
    setCancellingAppointment(appointment);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={metadata.title}
        subtitle={metadata.subtitle}
        breadcrumbs={metadata.breadcrumbs}
      />

      {appointmentsQuery.error && appointmentsQuery.appointments.length > 0 ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {appointmentsQuery.error.message}
        </p>
      ) : null}

      <AppointmentRequestsPanel />

      <div className="flex flex-col gap-6 xl:flex-row">
        <AppointmentsSidePanel
          className="shrink-0 xl:w-72"
          doctors={doctorsQuery.doctors}
          selectedDoctorIds={selectedDoctorIds}
          isDoctorsLoading={doctorsQuery.isPending}
          onToggleDoctor={handleToggleDoctor}
          onSchedule={() => setIsScheduleDialogOpen(true)}
        />

        <Card className="min-w-0 flex-1 gap-0 overflow-hidden rounded-xl border-slate-200 py-0 shadow-none">
          <CardContent className="p-0">
            <CalendarToolbar
              title={title}
              view={initialQuery.view}
              onNavigatePrevious={() => handleNavigate(-1)}
              onNavigateToday={() => handleNavigate(0)}
              onNavigateNext={() => handleNavigate(1)}
              onViewChange={handleViewChange}
              onPrint={() => window.print()}
            />
            {initialQuery.view !== 'table' &&
            (appointmentsQuery.meta?.total ?? 0) > appointmentsQuery.appointments.length ? (
              <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700">
                Showing the first {appointmentsQuery.appointments.length} of{' '}
                {appointmentsQuery.meta?.total} appointments in this range. Use the Table view to
                browse all of them.
              </p>
            ) : null}
            {initialQuery.view === 'day' ? (
              <DayView
                day={anchorDate}
                appointments={calendarAppointments}
                sessions={visibleSessions}
                isPending={appointmentsQuery.isPending}
                onSelectAppointment={setViewingAppointment}
                onSelectSession={setViewingSession}
              />
            ) : initialQuery.view === 'month' ? (
              <MonthView
                monthDate={anchorDate}
                days={monthGridDays}
                appointments={calendarAppointments}
                sessions={visibleSessions}
                isPending={appointmentsQuery.isPending}
                onSelectAppointment={setViewingAppointment}
                onSelectSession={setViewingSession}
                onSelectDay={handleSelectDay}
              />
            ) : initialQuery.view === 'week' ? (
              <WeekView
                weekDays={weekDays}
                appointments={calendarAppointments}
                sessions={visibleSessions}
                isPending={appointmentsQuery.isPending}
                onSelectAppointment={setViewingAppointment}
                onSelectSession={setViewingSession}
              />
            ) : (
              <>
                <AppointmentsTable
                  appointments={visibleAppointments}
                  isPending={appointmentsQuery.isPending}
                  isError={appointmentsQuery.isError}
                  onView={setViewingAppointment}
                  onReschedule={handleRescheduleAppointment}
                  onCancel={handleCancelAppointment}
                />
                <NumberedPagination
                  className="border-t border-slate-100 px-4 py-3"
                  page={initialQuery.page}
                  pageSize={initialQuery.limit}
                  total={appointmentsQuery.meta?.total ?? 0}
                  itemLabel="appointments"
                  isDisabled={appointmentsQuery.isFetching}
                  onPageChange={(nextPage) =>
                    navigateWithParams({ ...initialQuery, page: nextPage })
                  }
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {isScheduleDialogOpen ? (
        <ScheduleAppointmentDialog
          open={isScheduleDialogOpen}
          onOpenChange={setIsScheduleDialogOpen}
          initialDate={initialQuery.date}
        />
      ) : null}

      {viewingAppointment ? (
        <AppointmentDetailsDialog
          key={viewingAppointment.id}
          open={Boolean(viewingAppointment)}
          onOpenChange={(open) => {
            if (!open) {
              setViewingAppointment(null);
            }
          }}
          appointment={viewingAppointment}
          onReschedule={handleRescheduleAppointment}
          onCancel={handleCancelAppointment}
          onViewQueue={(sessionId) => {
            setViewingAppointment(null);
            setViewingQueueSessionId(sessionId);
          }}
        />
      ) : null}

      {viewingSession ? (
        <SessionDetailsDialog
          key={`${viewingSession.doctorId}|${viewingSession.sessionDate}|${viewingSession.startTime}`}
          open={Boolean(viewingSession)}
          onOpenChange={(open) => {
            if (!open) {
              setViewingSession(null);
            }
          }}
          session={viewingSession}
        />
      ) : null}

      {viewingQueueSessionId ? (
        <SessionQueueDialog
          key={viewingQueueSessionId}
          open={Boolean(viewingQueueSessionId)}
          onOpenChange={(open) => {
            if (!open) {
              setViewingQueueSessionId(null);
            }
          }}
          sessionId={viewingQueueSessionId}
        />
      ) : null}

      {reschedulingAppointment ? (
        <RescheduleAppointmentDialog
          key={reschedulingAppointment.id}
          open={Boolean(reschedulingAppointment)}
          onOpenChange={(open) => {
            if (!open) {
              setReschedulingAppointment(null);
            }
          }}
          appointment={reschedulingAppointment}
        />
      ) : null}

      {cancellingAppointment ? (
        <CancelAppointmentDialog
          key={cancellingAppointment.id}
          open={Boolean(cancellingAppointment)}
          onOpenChange={(open) => {
            if (!open) {
              setCancellingAppointment(null);
            }
          }}
          appointment={cancellingAppointment}
        />
      ) : null}
    </div>
  );
}
