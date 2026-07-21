'use client';

import { useState } from 'react';
import type { DoctorListItem } from '@hms/shared-types';
import { Button, Can, Card, CardContent, Icon } from '@hms/ui';
import { usePathname, useRouter } from 'next/navigation';

import { AssignPatientDialog } from '#components/client/doctors/assign-patient-dialog';
import { DoctorFormDialog } from '#components/client/doctors/doctor-form-dialog';
import { DoctorScheduleDialog } from '#components/client/doctors/doctor-schedule-dialog';
import {
  DoctorsFilterCard,
  type DoctorsFilterValues,
} from '#components/client/doctors/doctors-filter-card';
import { DoctorsTable } from '#components/client/doctors/doctors-table';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { PageHeader } from '#components/shared/page-header';
import {
  buildDoctorsSearchParams,
  type DoctorsSearchParams,
} from '#lib/doctors/search-params';
import { useDoctorsList } from '#lib/doctors/use-doctors-list';
import { ADMIN_ROUTE_METADATA } from '#lib/shell/route-metadata';

type DoctorsDirectoryPanelProps = {
  initialQuery: DoctorsSearchParams;
};

export function DoctorsDirectoryPanel({ initialQuery }: DoctorsDirectoryPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const metadata = ADMIN_ROUTE_METADATA.doctors;
  const doctorsQuery = useDoctorsList(initialQuery);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState<boolean>(false);
  const [editingDoctor, setEditingDoctor] = useState<DoctorListItem | null>(null);
  const [schedulingDoctor, setSchedulingDoctor] = useState<DoctorListItem | null>(null);
  const [assigningDoctor, setAssigningDoctor] = useState<DoctorListItem | null>(null);

  function navigateWithParams(next: DoctorsSearchParams): void {
    router.replace(`${pathname}?${buildDoctorsSearchParams(next).toString()}`);
  }

  function handleApplyFilters(filters: DoctorsFilterValues): void {
    navigateWithParams({
      page: 1,
      limit: initialQuery.limit,
      ...filters,
    });
  }

  function handleResetFilters(): void {
    navigateWithParams({ page: 1, limit: initialQuery.limit });
  }

  function handleOpenCreateDialog(): void {
    setEditingDoctor(null);
    setIsFormDialogOpen(true);
  }

  function handleOpenEditDialog(doctor: DoctorListItem): void {
    setEditingDoctor(doctor);
    setIsFormDialogOpen(true);
  }

  function handleViewDoctor(doctorId: string): void {
    router.push(`/admin/doctors/${doctorId}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={metadata.title}
        subtitle={metadata.subtitle}
        breadcrumbs={metadata.breadcrumbs}
        actions={
          <Can action="create" subject="Doctor">
            <Button
              type="button"
              className="bg-primary-container hover:bg-primary"
              onClick={handleOpenCreateDialog}
            >
              <Icon name="person_add" size={18} />
              Add New Doctor
            </Button>
          </Can>
        }
      />

      <DoctorsFilterCard
        key={`${initialQuery.search ?? ''}|${initialQuery.specialty ?? ''}|${initialQuery.isActive ?? ''}`}
        initialQuery={initialQuery}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
      />

      {doctorsQuery.error && doctorsQuery.doctors.length > 0 ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {doctorsQuery.error.message}
        </p>
      ) : null}

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <DoctorsTable
            doctors={doctorsQuery.doctors}
            isPending={doctorsQuery.isPending}
            isError={doctorsQuery.isError}
            onView={handleViewDoctor}
            onEdit={handleOpenEditDialog}
            onManageSchedule={setSchedulingDoctor}
            onAssignPatient={setAssigningDoctor}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={initialQuery.page}
            pageSize={initialQuery.limit}
            total={doctorsQuery.meta?.total ?? 0}
            itemLabel="doctors"
            isDisabled={doctorsQuery.isFetching}
            onPageChange={(nextPage) => navigateWithParams({ ...initialQuery, page: nextPage })}
          />
        </CardContent>
      </Card>

      {isFormDialogOpen ? (
        <DoctorFormDialog
          key={editingDoctor?.id ?? 'create'}
          open={isFormDialogOpen}
          onOpenChange={(open) => {
            setIsFormDialogOpen(open);
            if (!open) {
              setEditingDoctor(null);
            }
          }}
          doctor={editingDoctor}
        />
      ) : null}

      {schedulingDoctor ? (
        <DoctorScheduleDialog
          key={schedulingDoctor.id}
          open={Boolean(schedulingDoctor)}
          onOpenChange={(open) => {
            if (!open) {
              setSchedulingDoctor(null);
            }
          }}
          doctorId={schedulingDoctor.id}
          doctorName={schedulingDoctor.fullName}
          initialSchedules={schedulingDoctor.schedules}
        />
      ) : null}

      {assigningDoctor ? (
        <AssignPatientDialog
          key={assigningDoctor.id}
          open={Boolean(assigningDoctor)}
          onOpenChange={(open) => {
            if (!open) {
              setAssigningDoctor(null);
            }
          }}
          doctorId={assigningDoctor.id}
          doctorName={assigningDoctor.fullName}
        />
      ) : null}
    </div>
  );
}
