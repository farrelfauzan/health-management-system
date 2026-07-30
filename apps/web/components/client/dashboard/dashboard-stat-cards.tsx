'use client';

import { Skeleton } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { StatCard } from '#components/shared/stat-card';
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
  const t = useTranslations('dashboard.stats');
  const format = useFormatter();
  const stats = useDashboardStats();
  const cards: DashboardStatCardViewModel[] = [
    {
      key: 'today-patients',
      icon: 'personal_injury',
      label: t('todayPatients'),
      isPending: stats.todayRegistrationsQuery.isPending,
      isError: stats.todayRegistrationsQuery.isError,
      total: stats.todayRegistrationsMeta?.total,
      helper: t('newRegistrations'),
      variant: 'default',
    },
    {
      key: 'appointments',
      icon: 'calendar_month',
      label: t('appointments'),
      isPending: stats.todayAppointmentsQuery.isPending,
      isError: stats.todayAppointmentsQuery.isError,
      total: stats.todayAppointmentsQuery.meta?.total,
      helper: t('upcomingWithinHour', { count: stats.upcomingWithinHour }),
      variant: 'default',
    },
    {
      key: 'doctors-on-duty',
      icon: 'medical_services',
      label: t('doctorsOnDuty'),
      isPending: stats.activeDoctorsQuery.isPending,
      isError: stats.activeDoctorsQuery.isError,
      total: stats.activeDoctorsMeta?.total,
      helper: t('specialtyBreakdown', { surgeons: 3, generalPractitioners: 5 }),
      variant: 'default',
    },
    {
      key: 'pending-rx',
      icon: 'prescriptions',
      label: t('pendingRx'),
      isPending: stats.pendingPrescriptionsQuery.isPending,
      isError: stats.pendingPrescriptionsQuery.isError,
      total: stats.pendingPrescriptionsMeta?.total,
      helper: t('awaitingVerification'),
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
            value={card.isError ? '—' : format.number(card.total ?? 0)}
            helper={card.isError ? t('unableToLoad') : card.helper}
            variant={card.variant}
          />
        );
      })}
    </div>
  );
}
