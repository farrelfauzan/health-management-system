'use client';

import { Can } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicalDocumentButton } from '#components/client/clinical-documents/clinical-document-button';
import { labOrderControllerPrintRequestLetterV1 } from '#lib/api/generated/laboratory-orders/laboratory-orders';
import { useIssueClinicalDocument } from '#lib/clinical-documents/use-issue-clinical-document';

type LabRequestDocumentButtonProps = {
  labOrderId: string;
  encounterId: string;
};

/**
 * "Cetak surat pengantar": the letter the patient hands to the laboratory,
 * ours or the outside one the order was referred to. The route needs only
 * `LabOrder` read, and printing never moves the order.
 */
export function LabRequestDocumentButton({
  labOrderId,
  encounterId,
}: LabRequestDocumentButtonProps) {
  const t = useTranslations('clinical.encounters.laboratory.order.requestDocument');
  const { issueDocument, isIssuing } = useIssueClinicalDocument({
    issue: () => labOrderControllerPrintRequestLetterV1(labOrderId),
    readFromEncounterId: encounterId,
    successMessage: t('issued'),
    issueErrorMessage: t('error'),
    openErrorMessage: t('openError'),
  });
  return (
    <Can action="read" subject="LabOrder">
      <ClinicalDocumentButton
        label={t('action')}
        isIssuing={isIssuing}
        onIssue={() => issueDocument()}
      />
    </Can>
  );
}
