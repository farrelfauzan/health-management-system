'use client';

import { useState } from 'react';
import {
  Button,
  Can,
  Icon,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PatientLabHistoryPanel } from '#components/client/laboratory/patient-lab-history-panel';
import { PatientDocumentsPanel } from '#components/client/patient-documents/patient-documents-panel';
import { AssignDoctorDialog } from '#components/client/patients/assign-doctor-dialog';
import { PatientActivityCard } from '#components/client/patients/patient-activity-card';
import { PatientAllergiesCard } from '#components/client/patients/patient-allergies-card';
import { PatientDemographicsCard } from '#components/client/patients/patient-demographics-card';
import { PatientDeliveryConsentCard } from '#components/client/patients/patient-delivery-consent-card';
import { PatientIdentifiersCard } from '#components/client/patients/patient-identifiers-card';
import { PatientImmunizationsCard } from '#components/client/patients/patient-immunizations-card';
import { PatientPrivacyHistoryCard } from '#components/client/patients/patient-privacy-history-card';
import { PatientDoctorsCard } from '#components/client/patients/patient-doctors-card';
import { PatientFormDialog } from '#components/client/patients/patient-form-dialog';
import { EmptyState } from '#components/shared/empty-state';
import { PageHeader } from '#components/shared/page-header';
import { useTabSearchParam } from '#lib/navigation/use-tab-search-param';
import { PATIENT_DETAIL_TABS, type PatientDetailTab } from '#lib/patients/patient-detail-tabs';
import { usePatientDetail } from '#lib/patients/use-patient-detail';

type PatientDetailPanelProps = {
  patientId: string;
  /** A tab asked for by the URL; honoured only when this person may see it (SJ-162). */
  initialTab?: PatientDetailTab;
  isSatusehatEnabled: boolean;
  /**
   * P18-T07. Resolved on the server page from the session claims. Visibility
   * only: the API refuses the trend feed for a clinic without the entitlement
   * whatever this says.
   */
  isLaboratoryEnabled?: boolean;
};

export function PatientDetailPanel({
  patientId,
  initialTab,
  isSatusehatEnabled,
  isLaboratoryEnabled = false,
}: PatientDetailPanelProps) {
  const t = useTranslations('clinical');
  const ability = useAbility();
  // Visibility only. The tab hides for a role without the grant; the API's
  // guard is what refuses the list to anyone who reaches the route anyway.
  const canReadDocuments = ability.can('read', 'PatientDocument');
  // P18-T07. Two gates, refusing for different reasons: a clinic without the
  // entitlement has no laboratory at all, and a person without the order key
  // has one they may not read.
  const canReadLabHistory = isLaboratoryEnabled && ability.can('read', 'LabOrder');
  const readableTabs: Record<PatientDetailTab, boolean> = {
    overview: true,
    documents: canReadDocuments,
    laboratory: canReadLabHistory,
  };
  const { tab, setTab } = useTabSearchParam<PatientDetailTab>({
    allowed: PATIENT_DETAIL_TABS.filter((candidate) => readableTabs[candidate]),
    fallback: 'overview',
    initialTab,
  });
  const detailQuery = usePatientDetail(patientId);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState<boolean>(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState<boolean>(false);
  const patient = detailQuery.patient;

  if (detailQuery.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <EmptyState
        icon="person_off"
        title={t('patients.notFound')}
        description={
          detailQuery.isError ? t('patients.loadError') : t('patients.notFoundDescription')
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={patient.fullName}
        subtitle={t('patients.record', { mrn: patient.mrn })}
        breadcrumbs={[t('patients.dashboard'), t('patients.title'), patient.fullName]}
        actions={
          <Can action="update" subject="Patient">
            <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(true)}>
              <Icon name="edit" size={18} />
              {t('common.edit')} {t('patients.title')}
            </Button>
          </Can>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as PatientDetailTab)}
        className="space-y-5"
      >
        <TabsList>
          <TabsTrigger value="overview">{t('patients.tabs.overview')}</TabsTrigger>
          {canReadDocuments ? (
            <TabsTrigger value="documents">{t('patients.tabs.documents')}</TabsTrigger>
          ) : null}
          {canReadLabHistory ? (
            <TabsTrigger value="laboratory">{t('patients.tabs.laboratory')}</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="overview">
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-6">
              <PatientDemographicsCard patient={patient} />
              <PatientIdentifiersCard
                patient={patient}
                isSatusehatEnabled={isSatusehatEnabled}
              />
              <PatientImmunizationsCard patientId={patient.id} />
            </div>
            <div className="space-y-6">
              <PatientAllergiesCard allergies={patient.allergies} />
              <PatientPrivacyHistoryCard patientId={patient.id} />
              <PatientDeliveryConsentCard patientId={patient.id} />
              <PatientDoctorsCard
                patient={patient}
                onAssignDoctor={() => setIsAssignDialogOpen(true)}
              />
              <PatientActivityCard patientId={patient.id} />
            </div>
          </div>
        </TabsContent>
        {canReadDocuments ? (
          <TabsContent value="documents">
            <PatientDocumentsPanel patientId={patient.id} />
          </TabsContent>
        ) : null}
        {canReadLabHistory ? (
          <TabsContent value="laboratory">
            <PatientLabHistoryPanel patientId={patient.id} />
          </TabsContent>
        ) : null}
      </Tabs>

      {isEditDialogOpen ? (
        <PatientFormDialog
          key={patient.updatedAt}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          patient={patient}
        />
      ) : null}

      {isAssignDialogOpen ? (
        <AssignDoctorDialog
          open={isAssignDialogOpen}
          onOpenChange={setIsAssignDialogOpen}
          patientId={patient.id}
          patientName={patient.fullName}
          assignedDoctorIds={patient.doctors.map((doctor) => doctor.id)}
        />
      ) : null}
    </div>
  );
}
