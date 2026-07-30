'use client';

import type { DoctorListItem } from '@hms/shared-types';
import { Button, Can, Card, CardContent, Icon, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AppointmentStatusLegend } from '#components/client/appointments/appointment-status-legend';
import { MedicalStaffList } from '#components/client/appointments/medical-staff-list';

type AppointmentsSidePanelProps = {
  doctors: DoctorListItem[];
  selectedDoctorIds: string[] | null;
  isDoctorsLoading: boolean;
  onToggleDoctor: (doctorId: string) => void;
  onSchedule: () => void;
  className?: string;
};

export function AppointmentsSidePanel({
  doctors,
  selectedDoctorIds,
  isDoctorsLoading,
  onToggleDoctor,
  onSchedule,
  className,
}: AppointmentsSidePanelProps) {
  const t = useTranslations('operations.appointments');
  return (
    <aside className={cn('space-y-4', className)}>
      <Can action="create" subject="Appointment">
        <Button
          type="button"
          className="w-full bg-primary-container hover:bg-primary"
          onClick={onSchedule}
        >
          <Icon name="add" size={18} />
          {t('schedule')}
        </Button>
      </Can>

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="space-y-3 p-4">
          <h3 className="font-heading text-sm font-semibold text-slate-900">{t('medicalStaff')}</h3>
          <MedicalStaffList
            doctors={doctors}
            selectedDoctorIds={selectedDoctorIds}
            isLoading={isDoctorsLoading}
            onToggleDoctor={onToggleDoctor}
          />
        </CardContent>
      </Card>

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="space-y-3 p-4">
          <h3 className="font-heading text-sm font-semibold text-slate-900">
            {t('statusHeading')}
          </h3>
          <AppointmentStatusLegend />
        </CardContent>
      </Card>
    </aside>
  );
}
