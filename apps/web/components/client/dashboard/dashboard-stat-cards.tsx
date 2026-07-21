'use client';

import { Skeleton } from '@hms/ui';

import { StatCard } from '#components/shared/stat-card';
import { MOCK_DOCTOR_SPECIALTY_BREAKDOWN } from '#lib/dashboard/mock-doctor-specialty-breakdown';
import { useDashboardStats } from '#lib/dashboard/use-dashboard-stats';

type DashboardStatCardViewModel = {
  key: string;
  icon: string;
  label: string;
  isPending: boolean;
  isError: boolean;
  total: number | undefined;
  helper: string;
  variant: 'default' | 'danger';
};

export function DashboardStatCards() {
  const stats = useDashboardStats();
  const cards: DashboardStatCardViewModel[] = [
    {
      key: 'today-patients',
      icon: 'personal_injury',
      label: "Today's Patients",
      isPending: stats.todayRegistrationsQuery.isPending,
      isError: stats.todayRegistrationsQuery.isError,
      total: stats.todayRegistrationsMeta?.total,
      helper: 'New registrations today',
      variant: 'default',
    },
    {
      key: 'appointments',
      icon: 'calendar_month',
      label: 'Appointments',
      isPending: stats.todayAppointmentsQuery.isPending,
      isError: stats.todayAppointmentsQuery.isError,
      total: stats.todayAppointmentsQuery.meta?.total,
      helper: `${stats.upcomingWithinHour} upcoming in the next hour`,
      variant: 'default',
    },
    {
      key: 'doctors-on-duty',
      icon: 'medical_services',
      label: 'Doctors on Duty',
      isPending: stats.activeDoctorsQuery.isPending,
      isError: stats.activeDoctorsQuery.isError,
      total: stats.activeDoctorsMeta?.total,
      helper: MOCK_DOCTOR_SPECIALTY_BREAKDOWN,
      variant: 'default',
    },
    {
      key: 'pending-rx',
      icon: 'prescriptions',
      label: 'Pending RX',
      isPending: stats.pendingPrescriptionsQuery.isPending,
      isError: stats.pendingPrescriptionsQuery.isError,
      total: stats.pendingPrescriptionsMeta?.total,
      helper: 'Awaiting pharmacist verification',
      variant: 'danger',
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        if (card.isPending) {
          return (
            <Skeleton
              key={card.key}
              data-testid={`stat-skeleton-${card.key}`}
              className="h-36 rounded-xl"
            />
          );
        }
        return (
          <StatCard
            key={card.key}
            icon={card.icon}
            label={card.label}
            value={card.isError ? '—' : String(card.total ?? 0)}
            helper={card.isError ? 'Unable to load' : card.helper}
            variant={card.variant}
          />
        );
      })}
    </div>
  );
}
