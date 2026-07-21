'use client';

import { useState } from 'react';
import type { PatientListItem } from '@hms/shared-types';
import { Button, Can, Card, CardContent, Icon } from '@hms/ui';
import { usePathname, useRouter } from 'next/navigation';

import { AssignDoctorDialog } from '#components/client/patients/assign-doctor-dialog';
import { PatientFormDialog } from '#components/client/patients/patient-form-dialog';
import { PatientsFilterCard, type PatientsFilterValues } from '#components/client/patients/patients-filter-card';
import { PatientsTable } from '#components/client/patients/patients-table';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { PageHeader } from '#components/shared/page-header';
import { buildPatientsCsv } from '#lib/patients/build-patients-csv';
import {
  buildPatientsSearchParams,
  type PatientsSearchParams,
} from '#lib/patients/search-params';
import { usePatientsList } from '#lib/patients/use-patients-list';
import { downloadTextFile } from '#lib/shared/download-text-file';
import { ADMIN_ROUTE_METADATA } from '#lib/shell/route-metadata';

const CSV_FILE_NAME = 'patients-export.csv';
const CSV_MIME_TYPE = 'text/csv;charset=utf-8';

type PatientsDirectoryPanelProps = {
  initialQuery: PatientsSearchParams;
};

export function PatientsDirectoryPanel({ initialQuery }: PatientsDirectoryPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const metadata = ADMIN_ROUTE_METADATA.patients;
  const patientsQuery = usePatientsList(initialQuery);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState<boolean>(false);
  const [editingPatient, setEditingPatient] = useState<PatientListItem | null>(null);
  const [assigningPatient, setAssigningPatient] = useState<PatientListItem | null>(null);

  function navigateWithParams(next: PatientsSearchParams): void {
    router.replace(`${pathname}?${buildPatientsSearchParams(next).toString()}`);
  }

  function handleApplyFilters(filters: PatientsFilterValues): void {
    navigateWithParams({
      page: 1,
      limit: initialQuery.limit,
      ...filters,
    });
  }

  function handleResetFilters(): void {
    navigateWithParams({ page: 1, limit: initialQuery.limit });
  }

  function handleExport(): void {
    downloadTextFile({
      fileName: CSV_FILE_NAME,
      content: buildPatientsCsv(patientsQuery.patients),
      mimeType: CSV_MIME_TYPE,
    });
  }

  function handleOpenCreateDialog(): void {
    setEditingPatient(null);
    setIsFormDialogOpen(true);
  }

  function handleOpenEditDialog(patient: PatientListItem): void {
    setEditingPatient(patient);
    setIsFormDialogOpen(true);
  }

  function handleViewPatient(patientId: string): void {
    router.push(`/admin/patients/${patientId}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={metadata.title}
        subtitle={metadata.subtitle}
        breadcrumbs={metadata.breadcrumbs}
        actions={
          <Can action="create" subject="Patient">
            <Button
              type="button"
              className="bg-primary-container hover:bg-primary"
              onClick={handleOpenCreateDialog}
            >
              <Icon name="person_add" size={18} />
              Add New Patient
            </Button>
          </Can>
        }
      />

      <PatientsFilterCard
        key={`${initialQuery.search ?? ''}|${initialQuery.status ?? ''}|${initialQuery.createdFrom ?? ''}|${initialQuery.createdTo ?? ''}`}
        initialQuery={initialQuery}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        onExport={handleExport}
        isExportDisabled={patientsQuery.patients.length === 0}
      />

      {patientsQuery.error && patientsQuery.patients.length > 0 ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {patientsQuery.error.message}
        </p>
      ) : null}

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <PatientsTable
            patients={patientsQuery.patients}
            isPending={patientsQuery.isPending}
            isError={patientsQuery.isError}
            onView={handleViewPatient}
            onEdit={handleOpenEditDialog}
            onAssignDoctor={setAssigningPatient}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={initialQuery.page}
            pageSize={initialQuery.limit}
            total={patientsQuery.meta?.total ?? 0}
            itemLabel="patients"
            isDisabled={patientsQuery.isFetching}
            onPageChange={(nextPage) => navigateWithParams({ ...initialQuery, page: nextPage })}
          />
        </CardContent>
      </Card>

      {isFormDialogOpen ? (
        <PatientFormDialog
          key={editingPatient?.id ?? 'create'}
          open={isFormDialogOpen}
          onOpenChange={(open) => {
            setIsFormDialogOpen(open);
            if (!open) {
              setEditingPatient(null);
            }
          }}
          patient={editingPatient}
        />
      ) : null}

      {assigningPatient ? (
        <AssignDoctorDialog
          key={assigningPatient.id}
          open={Boolean(assigningPatient)}
          onOpenChange={(open) => {
            if (!open) {
              setAssigningPatient(null);
            }
          }}
          patientId={assigningPatient.id}
          patientName={assigningPatient.fullName}
          assignedDoctorIds={assigningPatient.doctors.map((doctor) => doctor.id)}
        />
      ) : null}
    </div>
  );
}
