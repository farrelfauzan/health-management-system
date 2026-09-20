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
import { PregnancyPanel } from '#components/client/maternal-care/pregnancy-panel';
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
import { RegisterNewbornDialog } from '#components/client/patients/register-newborn-dialog';
import { EmptyState } from '#components/shared/empty-state';
import { PageHeader } from '#components/shared/page-header';
import { useShellBreadcrumbRoot } from '#lib/navigation/use-shell-breadcrumb-root';
import { useTabSearchParam } from '#lib/navigation/use-tab-search-param';
import { PATIENT_DETAIL_TABS, type PatientDetailTab } from '#lib/patients/patient-detail-tabs';
import { usePatientDetail } from '#lib/patients/use-patient-detail';

const DEFAULT_PATIENTS_HREF = '/admin/patients';

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
  /**
   * P25-T06. Visibility only, like the laboratory flag: the API's
   * `@RequireFeature('maternal-care')` is what refuses the episode to a clinic
   * without the entitlement.
   */
  isMaternalCareEnabled?: boolean;
  /**
   * The list this record was opened from, for the trail's parent link: the
   * directory in the admin shell, the doctor's own panel in theirs.
   */
  patientsHref?: string;
};

export function PatientDetailPanel({
  patientId,
  initialTab,
  isSatusehatEnabled,
  isLaboratoryEnabled = false,
  isMaternalCareEnabled = false,
  patientsHref = DEFAULT_PATIENTS_HREF,
}: PatientDetailPanelProps) {
  const t = useTranslations('clinical');
  const tMaternal = useTranslations();
  const root = useShellBreadcrumbRoot();
  const ability = useAbility();
  // Visibility only. The tab hides for a role without the grant; the API's
  // guard is what refuses the list to anyone who reaches the route anyway.
  const canReadDocuments = ability.can('read', 'PatientDocument');
  // P18-T07. Two gates, refusing for different reasons: a clinic without the
  // entitlement has no laboratory at all, and a person without the order key
  // has one they may not read.
  const canReadLabHistory = isLaboratoryEnabled && ability.can('read', 'LabOrder');
  // P25-T06. Read before the tab strip is resolved, because the Kehamilan tab
  // is shown for a female patient only and the record is what says so. Three
  // gates: the clinic's entitlement, the patient, and the encounter grant the
  // episode is authorised on.
  const detailQuery = usePatientDetail(patientId);
  const canReadPregnancy =
    isMaternalCareEnabled &&
    detailQuery.patient?.sex === 'FEMALE' &&
    ability.can('read', 'Encounter');
  const readableTabs: Record<PatientDetailTab, boolean> = {
    overview: true,
    pregnancy: canReadPregnancy,
    documents: canReadDocuments,
    laboratory: canReadLabHistory,
  };
  const { tab, setTab } = useTabSearchParam<PatientDetailTab>({
    allowed: PATIENT_DETAIL_TABS.filter((candidate) => readableTabs[candidate]),
    fallback: 'overview',
    initialTab,
  });
  const [isEditDialogOpen, setIsEditDialogOpen] = useState<boolean>(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState<boolean>(false);
  const [isNewbornDialogOpen, setIsNewbornDialogOpen] = useState<boolean>(false);
  const patient = detailQuery.patient;
  // P24-T10. A baby is registered from a mother: a male record has none to
  // give, and a record that is itself a newborn has no babies of her own.
  const canRegisterNewborn =
    patient !== undefined &&
    patient.sex === 'FEMALE' &&
    patient.motherPatientId === undefined &&
    ability.can('create-newborn', 'Patient');

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
        breadcrumbs={[
          root,
          { label: t('patients.title'), href: patientsHref },
          { label: patient.fullName },
        ]}
        actions={
          <>
            {canRegisterNewborn ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNewbornDialogOpen(true)}
              >
                <Icon name="child_care" size={18} />
                {t('patients.newborn.action')}
              </Button>
            ) : null}
            <Can action="update" subject="Patient">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(true)}>
                <Icon name="edit" size={18} />
                {t('common.edit')} {t('patients.title')}
              </Button>
            </Can>
          </>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as PatientDetailTab)}
        className="space-y-5"
      >
        <TabsList>
          <TabsTrigger value="overview">{t('patients.tabs.overview')}</TabsTrigger>
          {canReadPregnancy ? (
            <TabsTrigger value="pregnancy">{tMaternal('maternalCare.tab')}</TabsTrigger>
          ) : null}
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
              <PatientIdentifiersCard patient={patient} isSatusehatEnabled={isSatusehatEnabled} />
              <PatientImmunizationsCard patientId={patient.id} />
            </div>
            <div className="min-w-0 space-y-6">
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
        {canReadPregnancy ? (
          <TabsContent value="pregnancy">
            <PregnancyPanel patientId={patient.id} />
          </TabsContent>
        ) : null}
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

      {isNewbornDialogOpen ? (
        <RegisterNewbornDialog
          open={isNewbornDialogOpen}
          onOpenChange={setIsNewbornDialogOpen}
          mother={{
            id: patient.id,
            fullName: patient.fullName,
            addressSummary: patient.addressDetails?.formattedAddress,
            phoneNumber: patient.phoneNumber,
          }}
        />
      ) : null}
    </div>
  );
}
