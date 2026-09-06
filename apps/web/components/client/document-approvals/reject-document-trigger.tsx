'use client';

import { Button } from '@hms/ui';
import { useTranslations } from 'next-intl';

type RejectDocumentTriggerProps = {
  onOpen: () => void;
};

/** Opens the reject dialog, where the mandatory reason is typed (FR-E5-17). */
export function RejectDocumentTrigger({ onOpen }: RejectDocumentTriggerProps) {
  const t = useTranslations('operations.documents.approvals.reject');

  return (
    <Button type="button" variant="outline" onClick={onOpen}>
      {t('action')}
    </Button>
  );
}
