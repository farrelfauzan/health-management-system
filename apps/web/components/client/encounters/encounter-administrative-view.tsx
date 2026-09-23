'use client';

import { useState } from 'react';
import { Button, Can, Icon, Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { GenerateInvoiceDialog } from '#components/client/billing/generate-invoice-dialog';
import { EncounterSummaryCard } from '#components/client/encounters/encounter-summary-card';
import { EncounterVitalsCard } from '#components/client/encounters/encounter-vitals-card';
import { EmptyState } from '#components/shared/empty-state';
import { PageHeader } from '#components/shared/page-header';
import { useEncounterDetail } from '#lib/encounters/use-encounter-detail';
import { useShellBreadcrumbRoot } from '#lib/navigation/use-shell-breadcrumb-root';

type EncounterAdministrativeViewProps = {
  encounterId: string;
  encountersHref?: string;
  patientHrefPrefix?: string;
};

const DEFAULT_ENCOUNTERS_HREF = '/admin/encounters';
const DEFAULT_PATIENT_HREF_PREFIX = '/admin/patients';

/**
 * The administrator's view of a visit (P22-T02, enforcing D-033).
 *
 * `/admin/encounters/[id]` used to render the doctor's `EncounterWorkspace` —
 * SOAP notes, diagnoses, procedures, prescriptions, lab orders, the lot. D-033
 * reserves that content to the clinicians who examine the patient, so what is
 * left here is the half the decision explicitly says is **not** clinical
 * content: who the visit was with, when it started and ended, and what state it
 * is in.
 *
 * It is a separate component rather than a prop on the workspace on purpose. A
 * flag would leave every clinical card one boolean away from rendering, and the
 * point of the decision is that this screen has no path to them at all.
 *
 * P22-T03 adds the two front-desk jobs a visit needs outside the consulting
 * room, each shown to whoever holds its own key and nobody else:
 * `encounter.record-vitals` measures the patient before the doctor sees them
 * (vital signs are the one piece of the record triage reads, and the API
 * returns nothing else to it), and `invoice.write` bills a finished visit —
 * which, until this card existed, no screen offered anyone at all.
 */
export function EncounterAdministrativeView({
  encounterId,
  encountersHref = DEFAULT_ENCOUNTERS_HREF,
  patientHrefPrefix = DEFAULT_PATIENT_HREF_PREFIX,
}: EncounterAdministrativeViewProps) {
  const t = useTranslations('clinical');
  const root = useShellBreadcrumbRoot();
  const encounterQuery = useEncounterDetail(encounterId);
  const encounter = encounterQuery.encounter;
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState<boolean>(false);

  if (encounterQuery.isPending) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={encounter.patient.fullName}
        subtitle={t('encounters.administrativeSubtitle')}
        breadcrumbs={[
          root,
          { label: t('encounters.title'), href: encountersHref },
          { label: encounter.patient.fullName },
        ]}
        actions={
          encounter.status === 'FINISHED' ? (
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
          ) : null
        }
      />
      <EncounterSummaryCard
        encounter={encounter}
        patientHref={`${patientHrefPrefix}/${encounter.patientId}`}
      />
      <Can action="record-vitals" subject="Encounter">
        <EncounterVitalsCard
          encounterId={encounter.id}
          vitalSigns={encounter.vitalSigns}
          isEditable={encounter.status === 'IN_PROGRESS'}
        />
      </Can>
      <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {t('encounters.administrativeNotice')}
      </p>
      {isGeneratingInvoice ? (
        <GenerateInvoiceDialog
          open={isGeneratingInvoice}
          onOpenChange={setIsGeneratingInvoice}
          encounterId={encounter.id}
          patientName={encounter.patient.fullName}
        />
      ) : null}
    </div>
  );
}
