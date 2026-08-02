'use client';

import { useState } from 'react';
import type { PatientListItem } from '@hms/shared-types';
import { Button, Can, Card, CardContent, Icon } from '@hms/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { AssignDoctorDialog } from '#components/client/patients/assign-doctor-dialog';
import { PatientFormDialog } from '#components/client/patients/patient-form-dialog';
import {
  PatientsFilterCard,
  type PatientsFilterValues,
} from '#components/client/patients/patients-filter-card';
import { PatientsTable } from '#components/client/patients/patients-table';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { PageHeader } from '#components/shared/page-header';
import { buildPatientsCsv } from '#lib/patients/build-patients-csv';
import { buildPatientsSearchParams, type PatientsSearchParams } from '#lib/patients/search-params';
import { usePatientsList } from '#lib/patients/use-patients-list';
import { downloadTextFile } from '#lib/shared/download-text-file';

const CSV_FILE_NAME = 'patients-export.csv';
const CSV_MIME_TYPE = 'text/csv;charset=utf-8';
const DEFAULT_PATIENT_DETAIL_BASE_PATH = '/admin/patients';

type PatientsDirectoryPanelProps = {
  initialQuery: PatientsSearchParams;
  patientDetailBasePath?: string;
};

export function PatientsDirectoryPanel({
  initialQuery,
  patientDetailBasePath = DEFAULT_PATIENT_DETAIL_BASE_PATH,
}: PatientsDirectoryPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('clinical');
  const patientsQuery = usePatientsList(initialQuery);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState<boolean>(false);
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
      content: buildPatientsCsv(patientsQuery.patients, {
        headers: [
          t('patients.csv.fullName'),
          t('patients.csv.status'),
          t('patients.csv.doctors'),
        ],
        status: (status) => t(`patients.status.${status}`),
      }),
      mimeType: CSV_MIME_TYPE,
    });
  }

  function handleOpenCreateDialog(): void {
    setIsFormDialogOpen(true);
  }

  function handleViewPatient(patientId: string): void {
    router.push(`${patientDetailBasePath}/${patientId}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('patients.title')}
        subtitle={t('patients.subtitle')}
        breadcrumbs={[t('patients.dashboard'), t('patients.title')]}
        actions={
          <Can action="create" subject="Patient">
            <Button
              type="button"
              className="bg-primary-container hover:bg-primary"
              onClick={handleOpenCreateDialog}
            >
              <Icon name="person_add" size={18} />
              {t('patients.add')}
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
          {t('patients.errorDescription')}
        </p>
      ) : null}

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <PatientsTable
            patients={patientsQuery.patients}
            isPending={patientsQuery.isPending}
            isError={patientsQuery.isError}
            onView={handleViewPatient}
            onAssignDoctor={setAssigningPatient}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={initialQuery.page}
            pageSize={initialQuery.limit}
            total={patientsQuery.meta?.total ?? 0}
            itemLabel={t('patients.itemLabel')}
            isDisabled={patientsQuery.isFetching}
            onPageChange={(nextPage) => navigateWithParams({ ...initialQuery, page: nextPage })}
          />
        </CardContent>
      </Card>

      {isFormDialogOpen ? (
        <PatientFormDialog
          key="create"
          open={isFormDialogOpen}
          onOpenChange={setIsFormDialogOpen}
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
