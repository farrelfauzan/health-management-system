'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Can } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicalDocumentButton } from '#components/client/clinical-documents/clinical-document-button';
import { antenatalExaminationControllerIssuePregnancyCertificateV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { useIssueClinicalDocument } from '#lib/clinical-documents/use-issue-clinical-document';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';

type PregnancyCertificateButtonProps = {
  pregnancyEpisodeId: string;
};

/**
 * "Surat keterangan hamil" (FR-ANC-06), issued from the episode rather than a
 * visit because what it attests is the pregnancy. Each issue files a new
 * letter; the route needs `Encounter` write, the same as recording the visit.
 */
export function PregnancyCertificateButton({
  pregnancyEpisodeId,
}: PregnancyCertificateButtonProps) {
  const t = useTranslations('maternalCare.examination.documents');
  const queryClient = useQueryClient();
  const { issueDocument, isIssuing } = useIssueClinicalDocument({
    issue: () => antenatalExaminationControllerIssuePregnancyCertificateV1(pregnancyEpisodeId),
    successMessage: t('pregnancyCertificateIssued'),
    issueErrorMessage: t('issueError'),
    openErrorMessage: t('openError'),
    onIssued: () => invalidateMaternalCareQueries(queryClient),
  });
  return (
    <Can action="write" subject="Encounter">
      <ClinicalDocumentButton
        label={t('pregnancyCertificate')}
        isIssuing={isIssuing}
        onIssue={() => issueDocument()}
      />
    </Can>
  );
}
