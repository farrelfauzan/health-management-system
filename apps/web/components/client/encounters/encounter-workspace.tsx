'use client';

import { useState } from 'react';
import { Button, Can, Icon } from '@hms/ui';

import { GenerateInvoiceDialog } from '#components/client/billing/generate-invoice-dialog';
import { EncounterDiagnosesCard } from '#components/client/encounters/encounter-diagnoses-card';
import { EncounterPrescriptionsCard } from '#components/client/encounters/encounter-prescriptions-card';
import { EncounterProceduresCard } from '#components/client/encounters/encounter-procedures-card';
import { EncounterReferralCard } from '#components/client/encounters/encounter-referral-card';
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
};

export function EncounterWorkspace({ encounterId }: EncounterWorkspaceProps) {
  const encounterQuery = useEncounterDetail(encounterId);
  const [pendingTransition, setPendingTransition] = useState<EncounterTransitionTarget | null>(null);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState<boolean>(false);
  const encounter = encounterQuery.encounter;

  if (encounterQuery.isPending) {
    return <p className="text-sm text-slate-500">Loading encounter...</p>;
  }

  if (!encounter) {
    return (
      <EmptyState
        icon="error"
        title="Encounter unavailable"
        description={
          encounterQuery.error?.message ??
          'This encounter could not be loaded. It may have been removed, or it belongs to another clinician.'
        }
      />
    );
  }

  // Both closed states are terminal — the record is read-only once it is
  // signed off, and a correction is a new encounter.
  const isEditable = encounter.status === 'IN_PROGRESS';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Encounter · ${encounter.patient.fullName}`}
        subtitle="The clinical record for this visit: note, measurements, coded diagnoses and procedures."
        breadcrumbs={['Main Dashboard', 'Encounters', encounter.patient.mrn]}
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
                Generate Invoice
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
                  {ENCOUNTER_TRANSITION_META.CANCELLED.actionLabel}
                </Button>
                <Button
                  type="button"
                  className="bg-primary-container hover:bg-primary"
                  onClick={() => setPendingTransition('FINISHED')}
                >
                  <Icon name={ENCOUNTER_TRANSITION_META.FINISHED.icon} size={18} />
                  {ENCOUNTER_TRANSITION_META.FINISHED.actionLabel}
                </Button>
              </div>
            </Can>
          ) : null
        }
      />

      <EncounterSummaryCard encounter={encounter} />

      {!isEditable ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          This encounter is {encounter.status === 'FINISHED' ? 'closed' : 'cancelled'} and read-only.
          Medical records are corrected by superseding them, never by re-opening.
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
          <EncounterReferralCard encounterId={encounter.id} isEditable={isEditable} />
          <EncounterPrescriptionsCard prescriptions={encounter.prescriptions} />
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
