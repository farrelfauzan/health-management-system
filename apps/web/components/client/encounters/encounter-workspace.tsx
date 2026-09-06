'use client';

import { useState } from 'react';
import { Button, Can, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { GenerateInvoiceDialog } from '#components/client/billing/generate-invoice-dialog';
import { EncounterDiagnosesCard } from '#components/client/encounters/encounter-diagnoses-card';
import { EncounterPrescriptionsCard } from '#components/client/encounters/encounter-prescriptions-card';
import { EncounterImmunizationsCard } from '#components/client/encounters/encounter-immunizations-card';
import { EncounterProceduresCard } from '#components/client/encounters/encounter-procedures-card';
import { EncounterReferralCard } from '#components/client/encounters/encounter-referral-card';
import { EncounterDocumentsPanel } from '#components/client/patient-documents/encounter-documents-panel';
import { EncounterSoapCard } from '#components/client/encounters/encounter-soap-card';
import { EncounterSummaryCard } from '#components/client/encounters/encounter-summary-card';
import { EncounterTransitionDialog } from '#components/client/encounters/encounter-transition-dialog';
import { EncounterVitalsCard } from '#components/client/encounters/encounter-vitals-card';
import { EmptyState } from '#components/shared/empty-state';
import { PageHeader } from '#components/shared/page-header';
import {
  ENCOUNTER_TRANSITION_META,
  type EncounterTransitionTarget,
} from '#lib/encounters/encounter-transition-meta';
import { useEncounterDetail } from '#lib/encounters/use-encounter-detail';

type EncounterWorkspaceProps = {
  encounterId: string;
  /**
   * Breadcrumb root and patient-link shell. A doctor session has no patient
   * directory to reach, so the link is omitted rather than pointing at a route
   * their session cannot open.
   */
  breadcrumbRoot?: string;
  patientHrefPrefix?: string;
};

export function EncounterWorkspace({
  encounterId,
  breadcrumbRoot = 'Main Dashboard',
  patientHrefPrefix = '/admin/patients',
}: EncounterWorkspaceProps) {
  const encounterQuery = useEncounterDetail(encounterId);
  const t = useTranslations('clinical');
  const [pendingTransition, setPendingTransition] = useState<EncounterTransitionTarget | null>(
    null,
  );
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState<boolean>(false);
  const encounter = encounterQuery.encounter;

  if (encounterQuery.isPending) {
    return <p className="text-sm text-slate-500">{t('encounters.loading')}</p>;
  }

  if (!encounter) {
    return (
      <EmptyState
        icon="error"
        title={t('encounters.unavailable')}
        description={t('encounters.unavailableDescription')}
      />
    );
  }

  // Both closed states are terminal — the record is read-only once it is
  // signed off, and a correction is a new encounter.
  const isEditable = encounter.status === 'IN_PROGRESS';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('encounters.workspaceTitle', { name: encounter.patient.fullName })}
        subtitle={t('encounters.workspaceSubtitle')}
        breadcrumbs={[breadcrumbRoot, t('encounters.title'), encounter.patient.mrn]}
        actions={
          !isEditable && encounter.status === 'FINISHED' ? (
            // Billing starts where the clinical record ends: only a finished
            // visit has the diagnoses, procedures, and dispenses to price.
            <Can action="write" subject="Invoice">
              <Button
                type="button"
                className="bg-primary-container hover:bg-primary"
                onClick={() => setIsGeneratingInvoice(true)}
              >
                <Icon name="receipt_long" size={18} />
                {t('encounters.generateInvoice')}
              </Button>
            </Can>
          ) : isEditable ? (
            <Can action="write" subject="Encounter">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPendingTransition('CANCELLED')}
                >
                  <Icon name={ENCOUNTER_TRANSITION_META.CANCELLED.icon} size={18} />
                  {t('encounters.transition.CANCELLED.action')}
                </Button>
                <Button
                  type="button"
                  className="bg-primary-container hover:bg-primary"
                  onClick={() => setPendingTransition('FINISHED')}
                >
                  <Icon name={ENCOUNTER_TRANSITION_META.FINISHED.icon} size={18} />
                  {t('encounters.transition.FINISHED.action')}
                </Button>
              </div>
            </Can>
          ) : null
        }
      />

      <EncounterSummaryCard
        encounter={encounter}
        patientHref={patientHrefPrefix ? `${patientHrefPrefix}/${encounter.patientId}` : undefined}
      />

      {!isEditable ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {t('encounters.readOnly', {
            status: t(
              encounter.status === 'FINISHED' ? 'encounters.closed' : 'encounters.cancelled',
            ),
          })}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <EncounterSoapCard encounter={encounter} isEditable={isEditable} />
          <EncounterVitalsCard
            encounterId={encounter.id}
            vitalSigns={encounter.vitalSigns}
            isEditable={isEditable}
          />
          {/* Beside vitals rather than in the right column: the doctor reads
              the file while taking the history, not while prescribing. */}
          <EncounterDocumentsPanel encounterId={encounter.id} />
        </div>
        <div className="space-y-6">
          <EncounterDiagnosesCard
            encounterId={encounter.id}
            diagnoses={encounter.diagnoses}
            isEditable={isEditable}
          />
          <EncounterProceduresCard
            encounterId={encounter.id}
            procedures={encounter.procedures}
            isEditable={isEditable}
          />
          <EncounterImmunizationsCard
            encounterId={encounter.id}
            immunizations={encounter.immunizations}
            isEditable={isEditable}
          />
          <EncounterReferralCard encounterId={encounter.id} isEditable={isEditable} />
          <EncounterPrescriptionsCard
            encounterId={encounter.id}
            patientId={encounter.patientId}
            prescriptions={encounter.prescriptions}
            isEditable={isEditable}
          />
        </div>
      </div>

      {isGeneratingInvoice ? (
        <GenerateInvoiceDialog
          open={isGeneratingInvoice}
          onOpenChange={setIsGeneratingInvoice}
          encounterId={encounter.id}
          patientName={encounter.patient.fullName}
        />
      ) : null}

      {pendingTransition ? (
        <EncounterTransitionDialog
          key={pendingTransition}
          open={Boolean(pendingTransition)}
          onOpenChange={(dialogOpen) => {
            if (!dialogOpen) {
              setPendingTransition(null);
            }
          }}
          encounter={encounter}
          targetStatus={pendingTransition}
        />
      ) : null}
    </div>
  );
}
