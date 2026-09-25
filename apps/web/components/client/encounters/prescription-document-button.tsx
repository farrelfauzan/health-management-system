'use client';

import { Can } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicalDocumentButton } from '#components/client/clinical-documents/clinical-document-button';
import { prescriptionControllerPrintPrescriptionDocumentV1 } from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import { useIssueClinicalDocument } from '#lib/clinical-documents/use-issue-clinical-document';

type PrescriptionDocumentButtonProps = {
  prescriptionId: string;
  encounterId: string;
};

/**
 * "Cetak resep": renders the resep the patient carries to an apotek and opens
 * it. The route needs only `Prescription` read — printing is not a state
 * change, and a reprint replaces the stored file rather than filing a copy.
 */
export function PrescriptionDocumentButton({
  prescriptionId,
  encounterId,
}: PrescriptionDocumentButtonProps) {
  const t = useTranslations('clinical.encounters.prescriptionDocument');
  const { issueDocument, isIssuing } = useIssueClinicalDocument({
    issue: () => prescriptionControllerPrintPrescriptionDocumentV1(prescriptionId),
    readFromEncounterId: encounterId,
    successMessage: t('issued'),
    issueErrorMessage: t('error'),
    openErrorMessage: t('openError'),
  });
  return (
    <Can action="read" subject="Prescription">
      <ClinicalDocumentButton
        label={t('action')}
        isIssuing={isIssuing}
        onIssue={() => issueDocument()}
      />
    </Can>
  );
}
